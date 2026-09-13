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
    const box = "box" in candidate && Array.isArray(candidate.box) && candidate.box.length === 4 && candidate.box.every((coordinate: unknown) => typeof coordinate === "number" && Number.isFinite(coordinate)) ? candidate.box : undefined;
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
    const response = await fetch(`${env.INFERENCE_API_URL.replace(/\/$/, "")}/detect`, { method: "POST", headers: env.INFERENCE_API_KEY ? { Authorization: `Bearer ${env.INFERENCE_API_KEY}` } : undefined, body: outgoing, signal: AbortSignal.timeout(90_000) });
    if (response.status === 401 || response.status === 403) {
      console.error("Detector authentication failed", response.status);
      return Response.json({ error: "Automatic analysis is temporarily offline. You can still submit for human review.", code: "DETECTOR_AUTH_ERROR" }, { status: 503 });
    }
    if (response.status === 413 || response.status === 415 || response.status === 422) {
      return Response.json({ error: "The detector could not read this photo. Try a JPEG photo or submit it for human review.", code: "IMAGE_UNREADABLE" }, { status: 422 });
    }
    if (!response.ok) throw new Error(`Detector returned ${response.status}`);
    const result = normalizeDetectorResponse(await response.json());
    if (!result) throw new Error("Detector returned an invalid response");
    return Response.json(result);
  } catch (error) {
    console.error("Detector request failed", error);
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return Response.json({ error: timedOut ? "The detector is waking up. Wait a moment, then try automatic analysis again." : "The detector is temporarily unavailable. You can still submit for human review.", code: timedOut ? "MODEL_TIMEOUT" : "MODEL_UNAVAILABLE" }, { status: timedOut ? 504 : 503 });
  }
}
