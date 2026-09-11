import { env } from "cloudflare:workers";

export const runtime = "edge";

export async function POST(request: Request) {
  if (!env.INFERENCE_API_URL) return Response.json({ error: "The detector is not connected yet.", code: "MODEL_NOT_CONFIGURED" }, { status: 503 });
  const form = await request.formData();
  const image = form.get("image");
  if (!(image instanceof File) || !image.type.startsWith("image/") || image.size === 0 || image.size > 8_000_000) return Response.json({ error: "Attach a road image smaller than 8 MB." }, { status: 422 });
  const outgoing = new FormData();
  outgoing.set("image", image);
  try {
    const response = await fetch(`${env.INFERENCE_API_URL.replace(/\/$/, "")}/detect`, { method: "POST", headers: env.INFERENCE_API_KEY ? { Authorization: `Bearer ${env.INFERENCE_API_KEY}` } : undefined, body: outgoing });
    if (!response.ok) throw new Error(`Detector returned ${response.status}`);
    const result = await response.json();
    return Response.json(result);
  } catch (error) {
    console.error("Detector request failed", error);
    return Response.json({ error: "The detector is temporarily unavailable.", code: "MODEL_UNAVAILABLE" }, { status: 503 });
  }
}
