"""Train and evaluate a RoadLens YOLO model on reviewed Dushanbe imagery."""
from __future__ import annotations

import argparse
from pathlib import Path
import random

import numpy as np
from ultralytics import YOLO


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=Path(__file__).with_name("dushanbe.yaml"))
    parser.add_argument("--model", default="yolov8n.pt")
    parser.add_argument("--epochs", type=int, default=80)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--project", type=Path, default=Path(__file__).with_name("runs"))
    return parser.parse_args()


def validate_dataset(data_file: Path) -> None:
    root = data_file.parent / "dataset"
    required = [root / "images" / split for split in ("train", "val")]
    missing = [str(path) for path in required if not path.exists() or not any(path.iterdir())]
    if missing:
        raise SystemExit("Dataset is not ready. Add reviewed images and YOLO labels first: " + ", ".join(missing))


def main() -> None:
    args = parse_args()
    random.seed(42); np.random.seed(42)
    validate_dataset(args.data)
    model = YOLO(args.model)
    run = model.train(data=str(args.data), epochs=args.epochs, imgsz=640, batch=args.batch, device=args.device, project=str(args.project), name="roadlens-dushanbe", seed=42, deterministic=True, patience=15, plots=True)
    best = Path(run.save_dir) / "weights" / "best.pt"
    evaluated = YOLO(str(best)).val(data=str(args.data), split="test" if (args.data.parent / "dataset" / "images" / "test").exists() else "val", plots=True)
    print(f"mAP50={evaluated.box.map50:.4f} mAP50-95={evaluated.box.map:.4f}")
    exported = YOLO(str(best)).export(format="onnx", imgsz=640, opset=17, simplify=True)
    print(f"Candidate ONNX model: {exported}")
    print("Promote it only after its held-out metrics beat the deployed model.")


if __name__ == "__main__":
    main()
