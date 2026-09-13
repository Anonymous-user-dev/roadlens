import { env } from "cloudflare:workers";
import { getRawDb } from "@/db";

export const runtime = "edge";
const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function authorized(request: Request) {
  return Boolean(env.REVIEWER_TOKEN && request.headers.get("authorization") === `Bearer ${env.REVIEWER_TOKEN}`);
}
function validId(value: string | null): value is string { return Boolean(value && /^RL-[A-F0-9]{8}$/.test(value)); }
function key(id: string) { return `repairs/${id}`; }

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Invalid reviewer access code." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!validId(id)) return Response.json({ error: "A valid report is required." }, { status: 422 });
  try {
    if (env.BUCKET) {
      const object = await env.BUCKET.get(key(id));
      if (!object) return Response.json({ error: "No completion image is available." }, { status: 404 });
      return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    const object = await env.PHOTOS?.getWithMetadata<{ contentType?: string }>(key(id), "arrayBuffer");
    if (!object?.value) return Response.json({ error: "No completion image is available." }, { status: 404 });
    return new Response(object.value, { headers: { "Content-Type": object.metadata?.contentType || "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return Response.json({ error: "Completion evidence is temporarily unavailable." }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Invalid reviewer access code." }, { status: 401 });
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ error: "Expected completion evidence." }, { status: 400 }); }
  const id = String(form.get("id") || ""); const image = form.get("image");
  const reviewer = String(form.get("reviewer") || "admin").replace(/[<>]/g, "").trim().slice(0, 120) || "admin";
  if (!validId(id)) return Response.json({ error: "A valid report is required." }, { status: 422 });
  if (!(image instanceof File) || !supportedImageTypes.has(image.type.toLowerCase()) || image.size === 0 || image.size > 8_000_000) return Response.json({ error: "Attach a JPEG, PNG, WebP, HEIC, or HEIF image smaller than 8 MB." }, { status: 422 });
  const report = await getRawDb().prepare("SELECT status FROM road_reports WHERE id = ? LIMIT 1").bind(id).first<{ status: string }>();
  if (!report) return Response.json({ error: "Report not found." }, { status: 404 });
  if (!["verified", "scheduled", "repairing"].includes(report.status)) return Response.json({ error: "Completion evidence can only be added to confirmed repair work." }, { status: 409 });
  try {
    if (env.BUCKET) await env.BUCKET.put(key(id), image.stream(), { httpMetadata: { contentType: image.type } });
    else if (env.PHOTOS) await env.PHOTOS.put(key(id), await image.arrayBuffer(), { metadata: { contentType: image.type } });
    else return Response.json({ error: "Evidence storage is unavailable." }, { status: 503 });
    const now = new Date().toISOString();
    await getRawDb().prepare("INSERT INTO review_audit_events (id, report_id, action, from_status, to_status, reviewer, details, created_at) VALUES (?, ?, 'completion_evidence', ?, ?, ?, 'Completion photo uploaded', ?)").bind(crypto.randomUUID(), id, report.status, report.status, reviewer, now).run();
    return Response.json({ uploaded: true });
  } catch { return Response.json({ error: "Completion evidence could not be saved." }, { status: 503 }); }
}
