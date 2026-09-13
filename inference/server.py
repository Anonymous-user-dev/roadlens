from __future__ import annotations

import io
import hashlib
import os
import threading
import time
import urllib.request
import warnings
from pathlib import Path

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

DEFAULT_MODEL_URL = "https://huggingface.co/vinothvikas1987/pothole-detection-yolov8/resolve/main/best.onnx"
DEFAULT_MODEL_SHA256 = "590a20e8c4a7bcbdb32e8a3b7b3a3c1d57d1fa8a7dde5c83fcec8928a4aa753f"
MODEL_URL = os.getenv("MODEL_URL", DEFAULT_MODEL_URL)
MODEL_PATH = Path(os.getenv("MODEL_PATH", Path(__file__).with_name("best.onnx")))
MODEL_SHA256 = os.getenv("MODEL_SHA256", DEFAULT_MODEL_SHA256 if MODEL_URL == DEFAULT_MODEL_URL else "").lower()
API_KEY = os.getenv("INFERENCE_API_KEY", "")
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.30"))
IOU_THRESHOLD = float(os.getenv("IOU_THRESHOLD", "0.55"))
MAX_UPLOAD_BYTES = 8_000_000
INPUT_SIZE = 640
CLASS_NAMES = (
    "longitudinal crack",
    "transverse crack",
    "alligator crack",
    "pothole",
    "other road damage",
)
CLASS_CONFIDENCE_FLOORS = np.asarray((0.35, 0.35, 0.40, 0.45, 0.60), dtype=np.float32)

app = FastAPI(title="RoadLens detector", version="0.1.0")
session: ort.InferenceSession | None = None
session_lock = threading.Lock()
Image.MAX_IMAGE_PIXELS = 25_000_000
warnings.simplefilter("error", Image.DecompressionBombWarning)
register_heif_opener()


@app.get("/")
def root() -> dict:
    return {
        "name": "RoadLens detector",
        "status": "ok",
        "health": "/health",
        "docs": "/docs",
    }


def model_checksum(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as model_file:
        for chunk in iter(lambda: model_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_model() -> Path:
    if MODEL_PATH.exists() and MODEL_PATH.stat().st_size > 1_000_000:
        if MODEL_SHA256 and model_checksum(MODEL_PATH) != MODEL_SHA256:
            MODEL_PATH.unlink()
        else:
            return MODEL_PATH
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = MODEL_PATH.with_suffix(".download")
    try:
        urllib.request.urlretrieve(MODEL_URL, temporary)
        if MODEL_SHA256 and model_checksum(temporary) != MODEL_SHA256:
            raise RuntimeError("Downloaded model checksum mismatch")
        temporary.replace(MODEL_PATH)
    finally:
        temporary.unlink(missing_ok=True)
    return MODEL_PATH


def get_session() -> ort.InferenceSession:
    global session
    if session is None:
        with session_lock:
            if session is None:
                session = ort.InferenceSession(str(ensure_model()), providers=["CPUExecutionProvider"])
    return session


def prepare_image(image: Image.Image) -> tuple[np.ndarray, tuple[int, int], tuple[float, int, int]]:
    image = ImageOps.exif_transpose(image).convert("RGB")
    original = image.size
    scale = min(INPUT_SIZE / original[0], INPUT_SIZE / original[1])
    resized = image.resize((round(original[0] * scale), round(original[1] * scale)), Image.Resampling.BILINEAR)
    canvas = Image.new("RGB", (INPUT_SIZE, INPUT_SIZE), (114, 114, 114))
    offset_x = (INPUT_SIZE - resized.width) // 2
    offset_y = (INPUT_SIZE - resized.height) // 2
    canvas.paste(resized, (offset_x, offset_y))
    tensor = np.asarray(canvas, dtype=np.float32).transpose(2, 0, 1) / 255.0
    return np.expand_dims(tensor, 0), original, (scale, offset_x, offset_y)


def intersection_over_union(box: np.ndarray, boxes: np.ndarray) -> np.ndarray:
    x1 = np.maximum(box[0], boxes[:, 0])
    y1 = np.maximum(box[1], boxes[:, 1])
    x2 = np.minimum(box[2], boxes[:, 2])
    y2 = np.minimum(box[3], boxes[:, 3])
    intersection = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)
    box_area = max(0, box[2] - box[0]) * max(0, box[3] - box[1])
    areas = np.maximum(0, boxes[:, 2] - boxes[:, 0]) * np.maximum(0, boxes[:, 3] - boxes[:, 1])
    return intersection / np.maximum(box_area + areas - intersection, 1e-6)


def decode(output: np.ndarray, original: tuple[int, int], transform: tuple[float, int, int]) -> list[dict]:
    predictions = np.squeeze(output)
    if predictions.ndim != 2:
        raise RuntimeError(f"Unexpected model output shape: {output.shape}")
    if predictions.shape[0] < predictions.shape[1] and predictions.shape[0] <= 128:
        predictions = predictions.T
    if predictions.shape[1] < 5:
        raise RuntimeError(f"Model output has too few columns: {predictions.shape}")

    class_scores = predictions[:, 4:]
    if class_scores.shape[1] != len(CLASS_NAMES):
        raise RuntimeError(f"Expected {len(CLASS_NAMES)} model classes, got {class_scores.shape[1]}")
    class_ids = class_scores.argmax(axis=1)
    scores = class_scores.max(axis=1)
    # The global threshold can be raised by configuration, but never lowered below
    # the per-class precision floors. This prevents weak crack/"other" matches from
    # being presented as reliable road defects.
    accepted = scores >= np.maximum(CONFIDENCE_THRESHOLD, CLASS_CONFIDENCE_FLOORS[class_ids])
    rows = predictions[accepted]
    scores = scores[accepted]
    class_ids = class_ids[accepted]
    if not len(rows):
        return []

    centers = rows[:, :4]
    boxes = np.column_stack((
        centers[:, 0] - centers[:, 2] / 2,
        centers[:, 1] - centers[:, 3] / 2,
        centers[:, 0] + centers[:, 2] / 2,
        centers[:, 1] + centers[:, 3] / 2,
    ))
    order = scores.argsort()[::-1]
    keep: list[int] = []
    while len(order):
        current = int(order[0])
        keep.append(current)
        if len(order) == 1:
            break
        remaining = order[1:]
        overlaps = intersection_over_union(boxes[current], boxes[remaining])
        different_class = class_ids[remaining] != class_ids[current]
        order = remaining[(overlaps < IOU_THRESHOLD) | different_class]

    scale, offset_x, offset_y = transform
    width, height = original
    detections = []
    for index in keep[:20]:
        x1, y1, x2, y2 = boxes[index]
        converted = [
            max(0.0, min(width, (float(x1) - offset_x) / scale)),
            max(0.0, min(height, (float(y1) - offset_y) / scale)),
            max(0.0, min(width, (float(x2) - offset_x) / scale)),
            max(0.0, min(height, (float(y2) - offset_y) / scale)),
        ]
        detections.append({"label": CLASS_NAMES[int(class_ids[index])], "confidence": round(float(scores[index]), 4), "box": [round(value, 1) for value in converted]})
    return detections


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model_ready": MODEL_PATH.exists() and MODEL_PATH.stat().st_size > 1_000_000}


@app.post("/detect")
async def detect(image: UploadFile = File(...), authorization: str | None = Header(default=None)) -> dict:
    if API_KEY and authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="Invalid API key")
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Upload an image")
    content = await image.read(MAX_UPLOAD_BYTES + 1)
    if not content or len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image must be between 1 byte and 8 MB")
    try:
        source = Image.open(io.BytesIO(content))
        tensor, original, transform = prepare_image(source)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise HTTPException(status_code=422, detail="Unreadable image") from error

    started = time.perf_counter()
    detector = get_session()
    input_name = detector.get_inputs()[0].name
    output = detector.run(None, {input_name: tensor})[0]
    detections = decode(output, original, transform)
    return {"detections": detections, "duration_ms": round((time.perf_counter() - started) * 1000, 1), "image": {"width": original[0], "height": original[1]}}
