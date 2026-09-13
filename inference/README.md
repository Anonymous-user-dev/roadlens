# RoadLens inference service

This service performs road-damage detection with ONNX Runtime. It downloads the configured ONNX model on first use and exposes `POST /detect` plus `GET /health`.

The default model is `vinothvikas1987/pothole-detection-yolov8` from Hugging Face. It screens for longitudinal, transverse, and alligator cracks, potholes, and other road damage at a default confidence threshold of 0.15. Review the model card, training data, and licenses before production use. Local road imagery should be used to validate and fine-tune the detector before operational deployment in Dushanbe.

Set the web worker's `INFERENCE_API_URL` to the deployed HTTPS origin. Set the same `INFERENCE_API_KEY` on both services when authentication is enabled.
