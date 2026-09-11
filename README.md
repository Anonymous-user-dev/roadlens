# RoadLens

RoadLens turns phone-captured road observations into a shared, prioritized repair map. The prototype is designed for Dushanbe and includes an installable iPhone-friendly PWA, GPS capture, durable report storage, image evidence, a repair-route view, and a real ONNX pothole detector.

## Architecture

- `app/` — Next.js/Vinext PWA and Cloudflare Worker API routes
- `db/` and `drizzle/` — D1 report schema and migration
- `inference/` — FastAPI + ONNX Runtime detector, ready for container deployment
- `public/` — manifest, service worker, and RoadLens favicon

The browser submits a road image to `/api/analyze`. The Worker proxies it to the configured detector, then `/api/reports` stores the evidence image in R2 and its validated metadata in D1. If the detector is unavailable, the interface says so explicitly and lets the user submit for human review without inventing a confidence score.

## Local web app

Install dependencies and run the development server:

```powershell
npm ci
npm run dev
```

Generate a migration after schema changes with `npm run db:generate`. See the starter scripts for applying D1 migrations to the local Wrangler state.

## Detector

Create a Python environment, install `inference/requirements.txt`, and start the service:

```powershell
python -m uvicorn inference.server:app --host 127.0.0.1 --port 8000
```

The detector downloads its configured ONNX model on first use. Copy `.env.example` to your local environment configuration and set `INFERENCE_API_URL`. Use the same `INFERENCE_API_KEY` on both services before exposing the detector publicly.

The included default model provides a hackathon starting point, not a municipal safety certification. Validate it against local Dushanbe road imagery, measure false positives and false negatives, and fine-tune before operational deployment.
