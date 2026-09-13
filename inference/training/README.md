# Dushanbe fine-tuning

RoadLens can be fine-tuned only after locally representative images have been reviewed and annotated. Each image needs a matching YOLO label file containing `class x_center y_center width height`, with normalized coordinates.

Use this split to prevent misleading results:

- `dataset/images/train` and `dataset/labels/train`: 70% of locations
- `dataset/images/val` and `dataset/labels/val`: 15% of locations
- `dataset/images/test` and `dataset/labels/test`: 15% of locations

Split by road/location, not by random near-duplicate photos, so the test set measures generalization. Include clean roads, shadows, puddles, repairs, night scenes, rain, and distant damage as hard negatives.

Install `requirements-training.txt`, then run `python training/train.py --device 0` on a CUDA machine or `--device cpu` for a slow local run. The script trains deterministically, evaluates the held-out split, and exports a candidate ONNX file. Do not replace the deployed model unless per-class recall and false-positive rates improve on the Dushanbe test set.
