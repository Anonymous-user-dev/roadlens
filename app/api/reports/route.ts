import { env } from "cloudflare:workers";
import { getRawDb } from "@/db";

export const runtime = "edge";

const allowedSeverities = new Set(["Critical", "High", "Medium"]);
const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export async function GET() {
  try {
    const rows = await getRawDb().prepare(
      `SELECT id, street, detail, severity, confidence, confirmations,
              latitude, longitude, status, created_at AS createdAt,
              CASE WHEN image_key IS NULL THEN 0 ELSE 1 END AS hasImage
       FROM road_reports
       WHERE status != 'rejected'
       ORDER BY created_at DESC LIMIT 100`,
    ).all();
    return Response.json({ reports: rows.results });
  } catch (error) {
    console.error("Unable to load road reports", error);
    return Response.json({ reports: [], error: "Road reports are temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ error: "Expected a multipart road report." }, { status: 400 }); }

  const latitude = Number(form.get("latitude"));
  const longitude = Number(form.get("longitude"));
  const street = String(form.get("street") || "Current road segment").slice(0, 120);
  const detail = String(form.get("detail") || "Road damage awaiting review").slice(0, 240);
  const severityInput = String(form.get("severity") || "Medium");
  const severity = allowedSeverities.has(severityInput) ? severityInput : "Medium";
  const confidenceValue = form.get("confidence");
  const confidence = confidenceValue === null || confidenceValue === "" ? null : Number(confidenceValue);
  const reviewRequested = form.get("reviewRequested") === "true";
  const image = form.get("image");
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return Response.json({ error: "A valid location is required." }, { status: 422 });
  if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 100)) return Response.json({ error: "Confidence must be between 0 and 100." }, { status: 422 });
  if (!(image instanceof File) || !supportedImageTypes.has(image.type.toLowerCase()) || image.size === 0 || image.size > 8_000_000) return Response.json({ error: "Attach a JPEG, PNG, WebP, HEIC, or HEIF road image smaller than 8 MB." }, { status: 422 });

  const id = `RL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const imageKey = `reports/${id}/${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  let storedImageKey: string | null = null;
  try {
    if (env.BUCKET) {
      await env.BUCKET.put(imageKey, image.stream(), { httpMetadata: { contentType: image.type } });
      storedImageKey = imageKey;
    } else if (env.PHOTOS) {
      await env.PHOTOS.put(imageKey, await image.arrayBuffer(), { metadata: { contentType: image.type } });
      storedImageKey = imageKey;
    }
    if (!storedImageKey) throw new Error("Road image storage is unavailable.");
    const status = reviewRequested || confidence === null ? "pending_review" : "model_screened";
    await getRawDb().prepare(
      `INSERT INTO road_reports
       (id, street, detail, severity, confidence, confirmations, latitude, longitude, image_key, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, street, detail, severity, confidence, 0, latitude, longitude, storedImageKey, status, createdAt).run();
    return Response.json({ report: { id, street, detail, severity, confidence, confirmations: 0, latitude, longitude, status, createdAt, hasImage: true } }, { status: 201 });
  } catch (error) {
    console.error("Unable to save road report", error);
    if (storedImageKey && env.BUCKET) await env.BUCKET.delete(storedImageKey).catch(() => undefined);
    if (storedImageKey && !env.BUCKET && env.PHOTOS) await env.PHOTOS.delete(storedImageKey).catch(() => undefined);
    return Response.json({ error: "The report could not be saved. Keep this screen open and try again." }, { status: 503 });
  }
}
