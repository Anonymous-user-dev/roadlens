import { env } from "cloudflare:workers";
import { getRawDb } from "@/db";

export const runtime = "edge";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!env.REVIEWER_TOKEN || authorization !== `Bearer ${env.REVIEWER_TOKEN}`) return Response.json({ error: "Invalid reviewer access code." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^RL-[A-F0-9]{8}$/.test(id)) return Response.json({ error: "A valid report is required." }, { status: 422 });
  try {
    const row = await getRawDb().prepare("SELECT image_key FROM road_reports WHERE id = ? LIMIT 1").bind(id).first<{ image_key: string | null }>();
    if (!row?.image_key) return Response.json({ error: "No review image is available." }, { status: 404 });
    if (env.BUCKET) {
      const object = await env.BUCKET.get(row.image_key);
      if (!object) return Response.json({ error: "No review image is available." }, { status: 404 });
      return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    if (env.PHOTOS) {
      const object = await env.PHOTOS.getWithMetadata<{ contentType?: string }>(row.image_key, "arrayBuffer");
      if (!object.value) return Response.json({ error: "No review image is available." }, { status: 404 });
      return new Response(object.value, { headers: { "Content-Type": object.metadata?.contentType || "application/octet-stream", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    return Response.json({ error: "Review image storage is unavailable." }, { status: 503 });
  } catch (error) {
    console.error("Unable to load review image", error);
    return Response.json({ error: "The review image is temporarily unavailable." }, { status: 503 });
  }
}
