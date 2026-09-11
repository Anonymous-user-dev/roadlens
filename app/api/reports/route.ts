import { env } from "cloudflare:workers";
import { getRawDb } from "@/db";

export const runtime = "edge";

const allowedSeverities = new Set(["Critical", "High", "Medium"]);

export async function GET() {
  try {
    const rows = await getRawDb().prepare(
      `SELECT id, street, detail, severity, confidence, confirmations,
              latitude, longitude, status, created_at AS createdAt
       FROM road_reports ORDER BY created_at DESC LIMIT 100`,
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
  const image = form.get("image");
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return Response.json({ error: "A valid location is required." }, { status: 422 });
  if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 100)) return Response.json({ error: "Confidence must be between 0 and 100." }, { status: 422 });
  if (!(image instanceof File) || !image.type.startsWith("image/") || image.size === 0 || image.size > 8_000_000) return Response.json({ error: "Attach a road image smaller than 8 MB." }, { status: 422 });

  const id = `RL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const imageKey = `reports/${id}/${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  try {
    if (!env.BUCKET) throw new Error("Road image storage is unavailable.");
    await env.BUCKET.put(imageKey, image.stream(), { httpMetadata: { contentType: image.type } });
    await getRawDb().prepare(
      `INSERT INTO road_reports
       (id, street, detail, severity, confidence, confirmations, latitude, longitude, image_key, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, street, detail, severity, confidence, 1, latitude, longitude, imageKey, confidence === null ? "pending_review" : "model_screened", createdAt).run();
    return Response.json({ report: { id, street, detail, severity, confidence, confirmations: 1, latitude, longitude, status: confidence === null ? "pending_review" : "model_screened", createdAt } }, { status: 201 });
  } catch (error) {
    console.error("Unable to save road report", error);
    if (env.BUCKET) await env.BUCKET.delete(imageKey).catch(() => undefined);
    return Response.json({ error: "The report could not be saved. Keep this screen open and try again." }, { status: 503 });
  }
}
