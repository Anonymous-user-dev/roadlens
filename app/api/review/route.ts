import { env } from "cloudflare:workers";
import { getRawDb } from "@/db";

export const runtime = "edge";

function isAuthorized(request: Request) {
  const authorization = request.headers.get("authorization");
  return Boolean(env.REVIEWER_TOKEN && authorization === `Bearer ${env.REVIEWER_TOKEN}`);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "Invalid reviewer access code." }, { status: 401 });
  try {
    const rows = await getRawDb().prepare(
      `SELECT id, street, detail, severity, confidence, confirmations,
              latitude, longitude, status, created_at AS createdAt,
              CASE WHEN image_key IS NULL THEN 0 ELSE 1 END AS hasImage
       FROM road_reports
       WHERE status = 'pending_review'
       ORDER BY created_at ASC LIMIT 100`,
    ).all();
    return Response.json({ reports: rows.results });
  } catch (error) {
    console.error("Unable to load review queue", error);
    return Response.json({ error: "The review queue is temporarily unavailable." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "Invalid reviewer access code." }, { status: 401 });
  let body: { id?: unknown; decision?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "Expected a JSON review decision." }, { status: 400 }); }
  const id = typeof body.id === "string" && /^RL-[A-F0-9]{8}$/.test(body.id) ? body.id : null;
  const decision = body.decision === "verify" || body.decision === "reject" ? body.decision : null;
  if (!id || !decision) return Response.json({ error: "A valid report and decision are required." }, { status: 422 });
  const status = decision === "verify" ? "verified" : "rejected";
  try {
    const current = await getRawDb().prepare("SELECT image_key FROM road_reports WHERE id = ? AND status = 'pending_review' LIMIT 1").bind(id).first<{ image_key: string | null }>();
    if (!current) return Response.json({ error: "This report is no longer awaiting review." }, { status: 409 });
    const result = await getRawDb().prepare(
      `UPDATE road_reports
       SET status = ?, confirmations = confirmations + 1
       WHERE id = ? AND status = 'pending_review'`,
    ).bind(status, id).run();
    if (!result.meta.changes) return Response.json({ error: "This report is no longer awaiting review." }, { status: 409 });
    if (decision === "reject" && current.image_key) {
      try {
        if (env.BUCKET) await env.BUCKET.delete(current.image_key);
        else if (env.PHOTOS) await env.PHOTOS.delete(current.image_key);
      } catch (error) {
        console.error("Unable to remove rejected review image", error);
      }
      await getRawDb().prepare("UPDATE road_reports SET image_key = NULL WHERE id = ?").bind(id).run();
    }
    return Response.json({ report: { id, status } });
  } catch (error) {
    console.error("Unable to save review decision", error);
    return Response.json({ error: "The review decision could not be saved." }, { status: 503 });
  }
}
