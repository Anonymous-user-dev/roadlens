import { env } from "cloudflare:workers";

export const runtime = "edge";

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

type DetectorResponse = { detections: Array<{ confidence: number; label?: string; box?: number[] }> };

function normalizeDetectorResponse(value: unknown): DetectorResponse | null {
  if (!value || typeof value !== "object" || !("detections" in value) || !Array.isArray(value.detections)) return null;
  const detections = value.detections.slice(0, 20).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || !("confidence" in candidate) || typeof candidate.confidence !== "number" || !Number.isFinite(candidate.confidence)) return [];
    const confidence = Math.max(0, Math.min(1, candidate.confidence > 1 ? candidate.confidence / 100 : candidate.confidence));
    const label = "label" in candidate && typeof candidate.label === "string" ? candidate.label.slice(0, 40) : undefined;
    const box = "box" in candidate && Array.isArray(candidate.box) && candidate.box.length === 4 && candidate.box.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)) ? candidate.box : undefined;
    return [{ confidence, label, box }];
  });
  return { detections };
}

export async function POST(request: Request) {
  if (!env.INFERENCE_API_URL) return Response.json({ error: "The detector is not connected yet.", code: "MODEL_NOT_CONFIGURED" }, { status: 503 });
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ error: "Expected a multipart image upload." }, { status: 400 }); }
  const image = form.get("image");
  if (!(image instanceof File) || !supportedImageTypes.has(image.type.toLowerCase()) || image.size === 0 || image.size > 8_000_000) return Response.json({ error: "Attach a JPEG, PNG, WebP, HEIC, or HEIF road image smaller than 8 MB." }, { status: 422 });
  const outgoing = new FormData();
  outgoing.set("image", image);
  try {
    const response = await fetch(`${env.INFERENCE_API_URL.replace(/\/$/, "")}/detect`, { method: "POST", headers: env.INFERENCE_API_KEY ? { Authorization: `Bearer ${env.INFERENCE_API_KEY}` } : undefined, body: outgoing, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`Detector returned ${response.status}`);
    const result = normalizeDetectorResponse(await response.json());
    if (!result) throw new Error("Detector returned an invalid response");
    return Response.json(result);
  } catch (error) {
    console.error("Detector request failed", error);
    return Response.json({ error: "The detector is temporarily unavailable.", code: "MODEL_UNAVAILABLE" }, { status: 503 });
  }
}
