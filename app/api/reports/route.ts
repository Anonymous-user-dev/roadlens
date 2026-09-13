import { env } from "cloudflare:workers";
import { getRawDb } from "@/db";

export const runtime = "edge";

const allowedSeverities = new Set(["Critical", "High", "Medium"]);
const allowedLocationSources = new Set(["gps", "approximate", "reviewer"]);
const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX_REPORTS_PER_HOUR = 12;

function cleanText(value: FormDataEntryValue | null, fallback: string, maxLength: number) {
  return String(value || fallback).replace(/[<>]/g, "").trim().slice(0, maxLength) || fallback;
}

async function rateLimit(request: Request) {
  const now = new Date();
  const hour = now.toISOString().slice(0, 13);
  const client = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const input = new TextEncoder().encode(`${client.trim()}|${hour}|roadlens-submit`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  const fingerprint = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const row = await getRawDb().prepare(
    `INSERT INTO submission_rate_limits (fingerprint, request_count, expires_at)
     VALUES (?, 1, ?)
     ON CONFLICT(fingerprint) DO UPDATE SET request_count = request_count + 1
     RETURNING request_count AS requestCount`,
  ).bind(fingerprint, expiresAt).first<{ requestCount: number }>();
  if (Math.random() < 0.05) await getRawDb().prepare("DELETE FROM submission_rate_limits WHERE expires_at < ?").bind(now.toISOString()).run().catch(() => undefined);
  return (row?.requestCount ?? 1) <= MAX_REPORTS_PER_HOUR;
}

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function findNearbyReport(latitude: number, longitude: number, defectType: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const candidates = await getRawDb().prepare(
    `SELECT id, latitude, longitude, defect_type AS defectType
     FROM road_reports
     WHERE duplicate_of IS NULL AND status NOT IN ('rejected', 'repaired')
       AND created_at >= ? AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?
     ORDER BY created_at DESC LIMIT 50`,
  ).bind(since, latitude - 0.0007, latitude + 0.0007, longitude - 0.0009, longitude + 0.0009)
    .all<{ id: string; latitude: number; longitude: number; defectType: string | null }>();
  return candidates.results.find((candidate) =>
    (!candidate.defectType || !defectType || candidate.defectType.toLowerCase() === defectType.toLowerCase()) &&
    distanceMeters({ latitude, longitude }, candidate) <= 45,
  )?.id ?? null;
}

export async function GET() {
  try {
    const rows = await getRawDb().prepare(
      `SELECT r.id, r.street, r.detail, r.severity, r.confidence, r.confirmations,
              r.latitude, r.longitude, r.location_accuracy AS locationAccuracy,
              CASE WHEN r.location_source = 'approximate' AND r.street NOT LIKE '%needs verification%' AND r.detail NOT LIKE '%approximate location%' THEN 'gps' ELSE r.location_source END AS locationSource,
              r.defect_type AS defectType,
              r.ai_explanation AS aiExplanation, r.status,
              r.reviewer_note AS reviewerNote, r.reviewed_at AS reviewedAt,
              COALESCE(r.updated_at, r.created_at) AS updatedAt, r.created_at AS createdAt,
              (SELECT COUNT(*) FROM road_reports d WHERE d.duplicate_of = r.id AND d.status != 'rejected') AS duplicateCount,
              CASE WHEN r.image_key IS NULL THEN 0 ELSE 1 END AS hasImage
       FROM road_reports r
       WHERE r.status != 'rejected' AND r.duplicate_of IS NULL
       ORDER BY r.created_at DESC LIMIT 200`,
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
  const accuracyInput = form.get("locationAccuracy");
  const locationAccuracy = accuracyInput === null || accuracyInput === "" ? null : Number(accuracyInput);
  const locationSourceInput = String(form.get("locationSource") || "approximate");
  const locationSource = allowedLocationSources.has(locationSourceInput) ? locationSourceInput : "approximate";
  const street = cleanText(form.get("street"), "Current road segment", 120);
  const detail = cleanText(form.get("detail"), "Road damage awaiting review", 240);
  const defectType = cleanText(form.get("defectType"), "road damage", 60);
  const aiExplanation = cleanText(form.get("aiExplanation"), "Submitted for visual confirmation.", 240);
  const severityInput = String(form.get("severity") || "Medium");
  const severity = allowedSeverities.has(severityInput) ? severityInput : "Medium";
  const confidenceValue = form.get("confidence");
  const confidence = confidenceValue === null || confidenceValue === "" ? null : Number(confidenceValue);
  const image = form.get("image");
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return Response.json({ error: "A valid location is required." }, { status: 422 });
  if (locationAccuracy !== null && (!Number.isFinite(locationAccuracy) || locationAccuracy < 0 || locationAccuracy > 50_000)) return Response.json({ error: "Location accuracy is invalid." }, { status: 422 });
  if (confidence !== null && (!Number.isFinite(confidence) || confidence < 0 || confidence > 100)) return Response.json({ error: "Confidence must be between 0 and 100." }, { status: 422 });
  if (!(image instanceof File) || !supportedImageTypes.has(image.type.toLowerCase()) || image.size === 0 || image.size > 8_000_000) return Response.json({ error: "Attach a JPEG, PNG, WebP, HEIC, or HEIF road image smaller than 8 MB." }, { status: 422 });

  try {
    if (!(await rateLimit(request))) return Response.json({ error: "Too many reports from this device. Try again after the hourly limit resets." }, { status: 429 });
  } catch (error) {
    console.error("Rate-limit check failed", error);
    return Response.json({ error: "The report service is temporarily unavailable." }, { status: 503 });
  }

  const id = `RL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const imageKey = `reports/${id}/${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  let storedImageKey: string | null = null;
  try {
    const duplicateOf = locationSource === "gps" && (locationAccuracy === null || locationAccuracy <= 100)
      ? await findNearbyReport(latitude, longitude, defectType)
      : null;
    if (env.BUCKET) {
      await env.BUCKET.put(imageKey, image.stream(), { httpMetadata: { contentType: image.type } });
      storedImageKey = imageKey;
    } else if (env.PHOTOS) {
      await env.PHOTOS.put(imageKey, await image.arrayBuffer(), { metadata: { contentType: image.type } });
      storedImageKey = imageKey;
    }
    if (!storedImageKey) throw new Error("Road image storage is unavailable.");
    await getRawDb().prepare(
      `INSERT INTO road_reports
       (id, street, detail, severity, confidence, confirmations, latitude, longitude,
        location_accuracy, location_source, defect_type, ai_explanation, duplicate_of,
        image_key, status, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?)`,
    ).bind(id, street, detail, severity, confidence, 0, latitude, longitude, locationAccuracy, locationSource, defectType, aiExplanation, duplicateOf, storedImageKey, createdAt, createdAt).run();
    return Response.json({ report: { id, street, detail, severity, confidence, confirmations: 0, latitude, longitude, locationAccuracy, locationSource, defectType, aiExplanation, duplicateOf, status: "pending_review", createdAt, hasImage: true } }, { status: 201 });
  } catch (error) {
    console.error("Unable to save road report", error);
    if (storedImageKey && env.BUCKET) await env.BUCKET.delete(storedImageKey).catch(() => undefined);
    if (storedImageKey && !env.BUCKET && env.PHOTOS) await env.PHOTOS.delete(storedImageKey).catch(() => undefined);
    return Response.json({ error: "The report could not be saved. Keep this screen open and try again." }, { status: 503 });
  }
}
