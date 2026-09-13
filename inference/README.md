# RoadLens inference service

This service performs road-damage detection with ONNX Runtime. It downloads the configured ONNX model on first use and exposes `POST /detect` plus `GET /health`.

The default model is `vinothvikas1987/pothole-detection-yolov8` from Hugging Face. It screens for longitudinal, transverse, and alligator cracks, potholes, and other road damage. The global confidence threshold defaults to 0.30 and stricter per-class floors prevent weak matches from being presented as reliable defects. Review the model card, training data, and licenses before production use. The `training/` directory contains the reproducible Dushanbe fine-tuning and held-out evaluation workflow.

Set the web worker's `INFERENCE_API_URL` to the deployed HTTPS origin. Set the same `INFERENCE_API_KEY` on both services when authentication is enabled.
