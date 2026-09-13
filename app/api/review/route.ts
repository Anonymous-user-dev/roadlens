import { env } from "cloudflare:workers";
import { getRawDb } from "@/db";

export const runtime = "edge";

const allowedStatuses = new Set(["verified", "scheduled", "repairing", "repaired"]);
const allowedSeverities = new Set(["Critical", "High", "Medium"]);

function isAuthorized(request: Request) {
  const authorization = request.headers.get("authorization");
  return Boolean(env.REVIEWER_TOKEN && authorization === `Bearer ${env.REVIEWER_TOKEN}`);
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/[<>]/g, "").trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "Invalid reviewer access code." }, { status: 401 });
  try {
    const rows = await getRawDb().prepare(
      `SELECT id, street, detail, severity, confidence, confirmations,
              latitude, longitude, location_accuracy AS locationAccuracy,
              CASE WHEN location_source = 'approximate' AND street NOT LIKE '%needs verification%' AND detail NOT LIKE '%approximate location%' THEN 'gps' ELSE location_source END AS locationSource,
              defect_type AS defectType,
              ai_explanation AS aiExplanation, duplicate_of AS duplicateOf,
              status, reviewer_note AS reviewerNote, reviewed_at AS reviewedAt,
              COALESCE(updated_at, created_at) AS updatedAt, created_at AS createdAt,
              CASE WHEN image_key IS NULL THEN 0 ELSE 1 END AS hasImage
       FROM road_reports
       WHERE status != 'rejected'
       ORDER BY CASE status WHEN 'pending_review' THEN 0 WHEN 'verified' THEN 1 WHEN 'scheduled' THEN 2 WHEN 'repairing' THEN 3 ELSE 4 END,
                created_at ASC LIMIT 250`,
    ).all();
    return Response.json({ reports: rows.results });
  } catch (error) {
    console.error("Unable to load review queue", error);
    return Response.json({ error: "The review queue is temporarily unavailable." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "Invalid reviewer access code." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return Response.json({ error: "Expected a JSON review update." }, { status: 400 }); }
  const id = typeof body.id === "string" && /^RL-[A-F0-9]{8}$/.test(body.id) ? body.id : null;
  if (!id) return Response.json({ error: "A valid report is required." }, { status: 422 });
  const decision = body.decision === "verify" || body.decision === "reject" ? body.decision : null;
  const requestedStatus = typeof body.status === "string" && allowedStatuses.has(body.status) ? body.status : null;
  if (!decision && !requestedStatus) return Response.json({ error: "A valid review decision or workflow status is required." }, { status: 422 });

  const latitude = typeof body.latitude === "number" && Number.isFinite(body.latitude) && body.latitude >= -90 && body.latitude <= 90 ? body.latitude : null;
  const longitude = typeof body.longitude === "number" && Number.isFinite(body.longitude) && body.longitude >= -180 && body.longitude <= 180 ? body.longitude : null;
  if ((body.latitude !== undefined || body.longitude !== undefined) && (latitude === null || longitude === null)) return Response.json({ error: "Both corrected coordinates are required." }, { status: 422 });
  const severity = typeof body.severity === "string" && allowedSeverities.has(body.severity) ? body.severity : null;
  const defectType = text(body.defectType, 60);
  const street = text(body.street, 120);
  const reviewerNote = text(body.reviewerNote, 240);
  const now = new Date().toISOString();

  try {
    const current = await getRawDb().prepare("SELECT image_key AS imageKey, status, duplicate_of AS duplicateOf FROM road_reports WHERE id = ? LIMIT 1").bind(id).first<{ imageKey: string | null; status: string; duplicateOf: string | null }>();
    if (!current) return Response.json({ error: "Report not found." }, { status: 404 });
    if (decision === "verify" && current.status !== "pending_review") return Response.json({ error: "Only pending reports can be verified." }, { status: 409 });
    if (decision === "reject" && current.status !== "pending_review") return Response.json({ error: "Only pending reports can be rejected." }, { status: 409 });
    const nextStatus = decision === "verify" ? "verified" : decision === "reject" ? "rejected" : requestedStatus!;
    const transitions: Record<string, string> = { verified: "scheduled", scheduled: "repairing", repairing: "repaired" };
    if (!decision && transitions[current.status] !== nextStatus) return Response.json({ error: "This workflow step is out of order. Refresh the workspace and try again." }, { status: 409 });

    const statements = [getRawDb().prepare(
      `UPDATE road_reports SET
         status = ?,
         street = CASE WHEN ? = '' THEN street ELSE ? END,
         severity = COALESCE(?, severity),
         defect_type = CASE WHEN ? = '' THEN defect_type ELSE ? END,
         reviewer_note = CASE WHEN ? = '' THEN reviewer_note ELSE ? END,
         latitude = COALESCE(?, latitude), longitude = COALESCE(?, longitude),
         location_source = CASE WHEN ? IS NULL THEN location_source ELSE 'reviewer' END,
         location_accuracy = CASE WHEN ? IS NULL THEN location_accuracy ELSE 0 END,
         confirmations = confirmations + CASE WHEN ? = 'verified' AND status = 'pending_review' THEN 1 ELSE 0 END,
         reviewed_at = CASE WHEN ? IN ('verified','rejected') THEN ? ELSE reviewed_at END,
         updated_at = ?
       WHERE id = ?`,
    ).bind(nextStatus, street, street, severity, defectType, defectType, reviewerNote, reviewerNote, latitude, longitude, latitude, latitude, nextStatus, nextStatus, now, now, id)];
    if (nextStatus === "verified" && current.duplicateOf && current.status === "pending_review") {
      statements.push(getRawDb().prepare("UPDATE road_reports SET confirmations = confirmations + 1, updated_at = ? WHERE id = ?").bind(now, current.duplicateOf));
    }
    await getRawDb().batch(statements);

    if (decision === "reject" && current.imageKey) {
      try {
        if (env.BUCKET) await env.BUCKET.delete(current.imageKey);
        else if (env.PHOTOS) await env.PHOTOS.delete(current.imageKey);
      } catch (error) { console.error("Unable to remove rejected review image", error); }
      await getRawDb().prepare("UPDATE road_reports SET image_key = NULL WHERE id = ?").bind(id).run();
    }
    return Response.json({ report: { id, status: nextStatus } });
  } catch (error) {
    console.error("Unable to save review update", error);
    return Response.json({ error: "The review update could not be saved." }, { status: 503 });
  }
}
