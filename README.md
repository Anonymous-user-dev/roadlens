# RoadLens

RoadLens turns phone-captured road observations into a shared, prioritized repair map. The prototype is designed for Dushanbe and includes an installable iPhone-friendly PWA, GPS capture, durable report storage, image evidence, a repair-route view, and a real ONNX pothole detector.

## Architecture

- `app/` — Next.js/Vinext PWA and Cloudflare Worker API routes
- `db/` and `drizzle/` — D1 report schema and migration
- `inference/` — FastAPI + ONNX Runtime detector, ready for container deployment
- `public/` — manifest, service worker, and RoadLens favicon

The browser submits a road image to `/api/analyze`. The Worker proxies it to the configured detector, then `/api/reports` stores the evidence image in R2 and its validated metadata in D1. If the detector is unavailable, the interface says so explicitly and lets the user submit for human review without inventing a confidence score.

## Start the web app locally

Requirements: Node.js 22.13 or newer and npm. In PowerShell, from this `roadlens` directory:

```powershell
npm ci
npm run build
.\node_modules\.bin\wrangler.cmd d1 execute site-creator-d1 --config dist\server\wrangler.json --local --persist-to .wrangler\state --file drizzle\0000_thick_gambit.sql
npm run dev
```

The migration command initializes the local report database on a fresh checkout; run it only once for that local state. Open the local URL printed in the terminal. Stop the server with `Ctrl+C`.

Before a release, run:

```powershell
npm run lint
npm run build
```

Both commands must finish without errors. Generate a new migration after schema changes with `npm run db:generate`; never edit an already deployed migration.

## Detector

Requirements: Python 3.12. In a second PowerShell window:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r inference\requirements.txt
python -m uvicorn inference.server:app --host 127.0.0.1 --port 8000
```

Check `http://127.0.0.1:8000/health`; it should return `{"status":"ok","model_ready":true}` after the model is available. The detector downloads and verifies its default ONNX model on first use.

Create an ignored `.dev.vars` file in the `roadlens` directory, then restart the web server:

```dotenv
INFERENCE_API_URL=http://127.0.0.1:8000
INFERENCE_API_KEY=use-the-same-long-random-secret-on-both-services
```

For local-only use, leave `INFERENCE_API_KEY` blank on both sides. Always use a shared long random key before exposing the detector publicly.

## Hackathon preflight

1. Open the published RoadLens URL in Safari on the iPhone.
2. Confirm the header says **Road reporting active**.
3. Tap **Start road scan**, take a JPEG/HEIC road photo, and allow location access.
4. Tap **Analyze photo**. If the hosted detector is not connected, RoadLens must clearly show that automatic detection is unavailable and offer human review.
5. Tap **Submit observation** and confirm the new marker appears first in the priority queue.
6. Refresh the page and confirm the submitted report is still present.
7. Switch to airplane mode, reopen the installed app, and confirm the shell loads with **Offline · submission paused**. Re-enable connectivity before submitting.
8. Tap **Inspection route**, select each visible marker, and confirm the detail panel updates without errors.

For the live demo, keep the iPhone charged, grant Safari camera and location access beforehand, and have one known-good road photo ready in Photos as a fallback.

The included default model provides a hackathon starting point, not a municipal safety certification. Validate it against local Dushanbe road imagery, measure false positives and false negatives, and fine-tune before operational deployment.
