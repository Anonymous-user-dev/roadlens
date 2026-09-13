"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Camera, Check, ChevronRight, CircleAlert, Crosshair, LocateFixed, Map, Navigation, OctagonAlert, Route, ShieldCheck, Sparkles, Upload, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Issue = {
  id: string;
  street: string;
  detail: string;
  severity: "Critical" | "High" | "Medium";
  confidence: number | null;
  confirmations: number;
  position: { x: number; y: number };
  status: "pending_review" | "model_screened" | "verified";
  createdAt: string;
  fresh?: boolean;
};

type Detection = {
  confidence: number;
  severity: Issue["severity"];
  label: string;
  certainty: "probable" | "possible";
};

type LocationSource = "gps" | "approximate";

const DUSHANBE_FALLBACK = { latitude: 38.5737, longitude: 68.7738 };
const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const imageTypesByExtension: Record<string, string> = {
  jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif",
};

function normalizeImageFile(file: File) {
  if (supportedImageTypes.has(file.type.toLowerCase())) return file;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const inferredType = imageTypesByExtension[extension];
  return inferredType ? new File([file], file.name, { type: inferredType, lastModified: file.lastModified }) : null;
}

const severityStyle = { Critical: "critical", High: "high", Medium: "medium" };

export function RoadLensApp() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanStep, setScanStep] = useState<"ready" | "locating" | "analyzing" | "found" | "possible" | "noissue" | "unavailable" | "saving" | "submiterror">("ready");
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [location, setLocation] = useState("Location not captured");
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource | null>(null);
  const [detection, setDetection] = useState<Detection | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState<boolean | null>(null);
  const [offline, setOffline] = useState(false);
  const [mapMode, setMapMode] = useState<"live" | "route">("live");
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const analysisRun = useRef(0);
  const locationRun = useRef(0);
  const selected = useMemo(() => issues.find((issue) => issue.id === selectedId) ?? issues[0] ?? null, [issues, selectedId]);
  const metrics = useMemo(() => ({
    open: issues.filter((issue) => issue.status !== "verified").length,
    pending: issues.filter((issue) => issue.status === "pending_review").length,
    verified: issues.filter((issue) => issue.status === "verified").length,
    today: issues.filter((issue) => new Date(issue.createdAt).toDateString() === new Date().toDateString()).length,
  }), [issues]);

  const resetScan = useCallback(() => {
    analysisRun.current += 1;
    locationRun.current += 1;
    setScanStep("ready");
    setPreview(null);
    setPhoto(null);
    setLocation("Location not captured");
    setCoordinates(null);
    setLocationSource(null);
    setDetection(null);
    setFileError(null);
    setAnalysisError(null);
    setSubmitError(null);
    if (cameraRef.current) cameraRef.current.value = "";
    if (uploadRef.current) uploadRef.current.value = "";
  }, []);

  const openScan = useCallback(() => {
    resetScan();
    setScanOpen(true);
  }, [resetScan]);

  const closeScan = useCallback(() => {
    setScanOpen(false);
    resetScan();
  }, [resetScan]);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    const loadReports = () => {
      fetch("/api/reports")
        .then(async (response) => {
          if (!response.ok) throw new Error("Unable to load reports");
          return await response.json() as { reports?: Array<{ id: string; street: string; detail: string; severity: string; confidence: number | null; confirmations: number; latitude: number; longitude: number; status: string; createdAt: string }> };
        })
        .then((payload) => {
          if (!active) return;
          setStorageReady(true);
          if (!payload.reports?.length) return;
          const saved = payload.reports.map((report): Issue => ({
            id: report.id,
            street: report.street,
            detail: report.detail,
            severity: report.severity === "Critical" || report.severity === "High" ? report.severity : "Medium",
            confidence: report.confidence,
            confirmations: report.confirmations,
            status: report.status === "verified" || report.status === "model_screened" ? report.status : "pending_review",
            createdAt: report.createdAt,
            position: {
              x: Math.max(4, Math.min(96, ((report.longitude - 68.73) / 0.14) * 100)),
              y: Math.max(4, Math.min(96, 100 - ((report.latitude - 38.52) / 0.11) * 100)),
            },
          }));
          setIssues(saved);
          setSelectedId((current) => current && saved.some((report) => report.id === current) ? current : saved[0]?.id ?? null);
        })
        .catch(() => { if (active) setStorageReady(false); });
    };
    loadReports();
    const refreshTimer = window.setInterval(loadReports, 30_000);
    window.addEventListener("online", loadReports);
    return () => { active = false; window.clearInterval(refreshTimer); window.removeEventListener("online", loadReports); };
  }, []);

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: { registerTool?: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(modelContext.registerTool({
      name: "start_road_scan",
      title: "Start road scan",
      description: "Open the RoadLens capture flow so the user can photograph and locate road damage.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: unknown) => {
        if (typeof input !== "object" || input === null || Array.isArray(input) || Object.keys(input).length) throw new Error("start_road_scan accepts an empty object");
        openScan(); return { status: "capture_ready" };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [openScan]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    if (!scanOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeScan();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [scanOpen, closeScan]);

  function locate() {
    const run = ++locationRun.current;
    setScanStep("locating");
    const setApproximateLocation = () => {
      if (run !== locationRun.current) return;
      setCoordinates(DUSHANBE_FALLBACK);
      setLocationSource("approximate");
      setLocation("Dushanbe center · approximate");
      setScanStep("ready");
    };
    if (!navigator.geolocation) { setApproximateLocation(); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { if (run !== locationRun.current) return; setCoordinates({ latitude: coords.latitude, longitude: coords.longitude }); setLocationSource("gps"); setLocation(`${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`); setScanStep("ready"); },
      setApproximateLocation,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function selectPhoto(file?: File) {
    if (!file) return;
    const normalizedFile = normalizeImageFile(file);
    analysisRun.current += 1;
    locationRun.current += 1;
    setScanStep("ready");
    setPhoto(null);
    setPreview(null);
    setCoordinates(null);
    setLocationSource(null);
    setLocation("Location not captured");
    setDetection(null);
    setAnalysisError(null);
    setSubmitError(null);
    if (!normalizedFile) {
      setFileError("Use a JPEG, PNG, WebP, HEIC, or HEIF photo.");
      return;
    }
    if (normalizedFile.size === 0 || normalizedFile.size > 8_000_000) {
      setFileError("The photo must be smaller than 8 MB.");
      return;
    }
    setFileError(null);
    setPhoto(normalizedFile);
    setPreview(URL.createObjectURL(normalizedFile));
    locate();
  }

  async function analyze() {
    if (!photo) return;
    const run = ++analysisRun.current;
    setScanStep("analyzing");
    setAnalysisError(null);
    setSubmitError(null);
    const form = new FormData();
    form.set("image", photo);
    try {
      const response = await fetch("/api/analyze", { method: "POST", body: form });
      if (run !== analysisRun.current) return;
      if (!response.ok) {
        const failure = await response.json().catch(() => null) as { error?: string } | null;
        setAnalysisError(failure?.error || "The detector did not respond. Please try again.");
        setScanStep("unavailable");
        return;
      }
      const result = await response.json() as { detections?: Array<{ confidence?: number; label?: string }> };
      const best = [...(result.detections ?? [])].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
      if (!best || typeof best.confidence !== "number") { setDetection(null); setScanStep("noissue"); return; }
      const confidence = Math.max(0, Math.min(100, Math.round(best.confidence <= 1 ? best.confidence * 100 : best.confidence)));
      const severity: Issue["severity"] = confidence >= 90 ? "Critical" : confidence >= 72 ? "High" : "Medium";
      const label = best.label?.trim() || "road damage";
      const certainty: Detection["certainty"] = confidence >= 40 ? "probable" : "possible";
      setDetection({ confidence, severity, label, certainty });
      setScanStep(certainty === "probable" ? "found" : "possible");
    } catch {
      if (run === analysisRun.current) {
        setAnalysisError("The detector could not be reached. Check your connection and try again.");
        setScanStep("unavailable");
      }
    }
  }

  async function saveDetection() {
    if (!photo || !coordinates) return;
    setScanStep("saving");
    setSubmitError(null);
    const form = new FormData();
    form.set("image", photo);
    form.set("latitude", String(coordinates.latitude));
    form.set("longitude", String(coordinates.longitude));
    form.set("severity", detection?.severity ?? "Medium");
    const locationNote = locationSource === "approximate" ? " · approximate location" : "";
    const detectionDetail = detection ? `${detection.certainty === "probable" ? "Probable" : "Possible"} ${detection.label} · model screened${locationNote}` : `Road damage · awaiting review${locationNote}`;
    form.set("street", locationSource === "gps" ? "Current road segment" : "Dushanbe · location needs verification");
    form.set("detail", detectionDetail);
    form.set("reviewRequested", "true");
    if (detection) form.set("confidence", String(detection.confidence));
    try {
      const response = await fetch("/api/reports", { method: "POST", body: form });
      const result = await response.json() as { report?: { id: string; status: "pending_review"; createdAt: string } };
      if (!response.ok || !result.report) {
        if (response.status >= 500) setStorageReady(false);
        setSubmitError("The report was not submitted. Keep this screen open and try again.");
        setScanStep("submiterror");
        return;
      }
      const issue: Issue = { id: result.report.id, street: locationSource === "gps" ? "Current road segment" : "Dushanbe · location needs verification", detail: detectionDetail, severity: detection?.severity ?? "Medium", confidence: detection?.confidence ?? null, confirmations: 0, status: result.report.status, createdAt: result.report.createdAt, position: { x: Math.max(4, Math.min(96, ((coordinates.longitude - 68.73) / 0.14) * 100)), y: Math.max(4, Math.min(96, 100 - ((coordinates.latitude - 38.52) / 0.11) * 100)) }, fresh: true };
      setStorageReady(true); setIssues((current) => [issue, ...current]); setSelectedId(issue.id); closeScan();
    } catch {
      setStorageReady(false);
      setSubmitError("The report was not submitted. Check your connection and try again.");
      setScanStep("submiterror");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="RoadLens home"><span className="brand-mark"><Route aria-hidden="true" /></span><span>RoadLens</span><span className="city-label">DUSHANBE</span></div>
        <div className="topbar-center"><span className={`live-dot ${storageReady === false ? "warning" : ""}`} /><span>{storageReady === false ? "Reporting temporarily unavailable" : storageReady === null ? "Checking report network…" : "Road reporting active"}</span><span className="signal-meta">{issues.length} live reports</span></div>
        <div className="topbar-actions">{offline && <span className="offline-pill"><WifiOff /> Offline · submission paused</span>}<Link className="review-link" href="/review">Review queue</Link><Button className="scan-button" onClick={openScan}><Camera /> Start road scan</Button></div>
      </header>

      <section className="workspace">
        <aside className="control-panel">
          <div className="eyebrow"><Crosshair /> Operations overview</div>
          <h1>Road health,<br />as it happens.</h1>
          <p className="intro">Phone cameras become a shared early-warning system for safer, faster repairs.</p>
          <div className="metrics-grid">
            <article><strong>{metrics.open}</strong><span>Open reports</span><em>{metrics.today} today</em></article>
            <article><strong>{metrics.pending}</strong><span>Awaiting review</span><em>Human queue</em></article>
            <article><strong>{metrics.verified}</strong><span>Verified</span><em className="good">Confirmed damage</em></article>
            <article><strong>{issues.length}</strong><span>Total reports</span><em>Live database</em></article>
          </div>
          <div className="section-heading"><span>Priority queue</span><small>{Math.min(issues.length, 4)} shown</small></div>
          <div className="issue-list">
            {!issues.length && <div className="issue-empty"><Map /><strong>No reports yet</strong><small>Upload the first road observation to begin.</small></div>}
            {issues.slice(0, 4).map((issue) => (
              <button key={issue.id} className={`issue-row ${selectedId === issue.id ? "active" : ""}`} onClick={() => setSelectedId(issue.id)}>
                <span className={`severity-icon ${severityStyle[issue.severity]}`}>{issue.severity === "Critical" ? <OctagonAlert /> : <CircleAlert />}</span>
                <span className="issue-copy"><strong>{issue.street}</strong><small>{issue.detail}</small></span>
                <span className="issue-score">{issue.status === "pending_review" ? "Review" : issue.confidence === null ? "Verified" : `${issue.confidence}%`}<small>{issue.status === "pending_review" ? "pending" : `${issue.confirmations} confirms`}</small></span>
              </button>
            ))}
          </div>
        </aside>

        <section className="map-panel" aria-label="Dushanbe road issue map">
          <div className="map-toolbar"><div className="map-tabs"><button className={mapMode === "live" ? "active" : ""} onClick={() => setMapMode("live")}><Map /> Live map</button><button className={mapMode === "route" ? "active" : ""} onClick={() => setMapMode("route")}><Route /> Inspection route</button></div><button className="map-action" disabled={!issues.length} onClick={() => setSelectedId(issues[0]?.id ?? null)}><LocateFixed /> Focus priority</button></div>
          <div className="map-canvas">
            <div className="map-grid" />
            <svg className="road-network" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
              <path className="road major" d="M-40 590 C180 480 260 410 430 280 S760 80 1040 120" /><path className="road major" d="M490 -40 C500 170 540 260 590 370 S670 590 720 760" /><path className="road" d="M30 220 C240 250 330 330 480 390 S790 500 1030 440" /><path className="road" d="M150 -20 C190 180 260 280 350 390 S490 620 500 750" /><path className="road" d="M760 -20 C730 160 700 270 650 360 S570 570 600 740" /><path className="river" d="M-30 110 C250 160 270 70 520 150 S830 260 1030 190" />
              {mapMode === "route" && <path className="inspection-route" d="M390 406 C460 350 545 330 630 238 S685 380 720 483" />}
            </svg>
            <div className="district-label label-1">SINO</div><div className="district-label label-2">ISMOILI SOMONI</div><div className="district-label label-3">SHOHMANSUR</div><div className="street-label street-1">Rudaki Avenue</div><div className="street-label street-2">Ismoili Somoni Ave</div>
            {issues.map((issue, index) => <button key={issue.id} className={`map-marker ${severityStyle[issue.severity]} ${selectedId === issue.id ? "selected" : ""} ${issue.fresh ? "fresh" : ""}`} style={{ left: `${issue.position.x}%`, top: `${issue.position.y}%` }} onClick={() => setSelectedId(issue.id)} aria-label={`${issue.severity} issue on ${issue.street}`}><span>{index + 1}</span></button>)}
            {mapMode === "route" && issues.length > 0 && <div className="route-summary"><Navigation /><span><strong>Inspection route</strong><small>{Math.min(3, issues.length)} priority {issues.length === 1 ? "stop" : "stops"}</small></span></div>}
            <div className="map-legend"><span><i className="legend-dot critical" /> Critical</span><span><i className="legend-dot high" /> High</span><span><i className="legend-dot medium" /> Medium</span></div>
          </div>
          {selected ? <article className="issue-detail">
            <div className="detail-main"><span className={`severity-badge ${severityStyle[selected.severity]}`}>{selected.severity}</span><div><small>{selected.id}</small><h2>{selected.street}</h2><p>{selected.detail}</p></div></div>
            <div className="confidence-ring" style={{ "--score": `${(selected.confidence ?? (selected.status === "verified" ? 100 : 0)) * 3.6}deg` } as React.CSSProperties}><span>{selected.status === "pending_review" ? "Review" : selected.confidence === null ? "Verified" : `${selected.confidence}%`}</span><small>{selected.status === "pending_review" ? "pending" : selected.confidence === null ? "human" : "confidence"}</small></div>
            <div className="verification"><ShieldCheck /><span><strong>{selected.status === "pending_review" ? "Awaiting human review" : `${selected.confirmations} independent passes`}</strong><small>{new Date(selected.createdAt).toLocaleString()}</small></span></div>
            <Button className="route-button" onClick={() => setMapMode("route")}><Navigation /> Plan inspection</Button>
          </article> : <article className="issue-detail empty-detail"><Map /><div><h2>No road reports</h2><p>New submissions will appear here with their review status.</p></div></article>}
        </section>
      </section>

      {scanOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeScan()}>
        <section className="scan-modal" role="dialog" aria-modal="true" aria-labelledby="scan-title">
          <div className="scan-head"><div><span className="eyebrow"><Sparkles /> New observation</span><h2 id="scan-title">Scan road damage</h2></div><button className="icon-button" onClick={closeScan} aria-label="Close"><X /></button></div>
          {!preview ? <div className="capture-zone"><span className="capture-icon"><Camera /></span><strong>Add a clear road photo</strong><small>Keep the damaged area centered and avoid people or license plates.</small><div className="capture-actions"><Button onClick={() => cameraRef.current?.click()}><Camera /> Take photo</Button><Button variant="outline" onClick={() => uploadRef.current?.click()}><Upload /> Upload photo</Button></div></div> : <div className="photo-preview"><Image src={preview} alt="Road damage awaiting analysis" fill unoptimized /><div className="photo-actions"><button onClick={() => cameraRef.current?.click()}><Camera /> Retake</button><button onClick={() => uploadRef.current?.click()}><Upload /> Replace</button></div></div>}
          <input ref={cameraRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; selectPhoto(file); }} />
          <input ref={uploadRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; selectPhoto(file); }} />
          {fileError && <div className="result-card warning"><span><CircleAlert /></span><div><strong>Photo cannot be used</strong><small>{fileError}</small></div></div>}
          <div className={`location-row ${locationSource === "approximate" ? "approximate" : ""}`}><LocateFixed /><div><strong>{scanStep === "locating" ? "Finding your location…" : location}</strong><small>{locationSource === "approximate" ? "GPS was unavailable. A reviewer must confirm the road location." : "Coordinates are attached only to this road report."}</small></div><button onClick={locate}>Refresh</button></div>
          {scanStep === "analyzing" && <div className="analysis-state"><span className="scanner" /><div><strong>Inspecting road surface</strong><small>Checking shape, depth cues, and pavement boundaries…</small></div></div>}
          {scanStep === "found" && detection && <div className="result-card"><span><Check /></span><div><strong>Probable {detection.label} detected</strong><small>{detection.severity} priority · {detection.confidence}% model confidence · review recommended</small></div></div>}
          {scanStep === "possible" && detection && <div className="result-card warning"><span><CircleAlert /></span><div><strong>Possible {detection.label}</strong><small>Low-confidence match ({detection.confidence}%) · submit for human review.</small></div></div>}
          {scanStep === "noissue" && <div className="result-card neutral"><span><Check /></span><div><strong>No confident road damage found</strong><small>This is not a guarantee. You can still submit the observation for human review.</small></div></div>}
          {scanStep === "unavailable" && <div className="result-card warning actionable"><span><CircleAlert /></span><div><strong>Automatic detection is unavailable</strong><small>{analysisError || "Your photo is still here and can be reviewed by a person."}</small><button type="button" onClick={analyze}>Try automatic analysis again</button></div></div>}
          {scanStep === "submiterror" && <div className="result-card error"><span><CircleAlert /></span><div><strong>Report not submitted</strong><small>{submitError}</small></div></div>}
          <div className="scan-footer"><span className="privacy-note"><ShieldCheck /> Evidence is available only to authorized reviewers</span>{["found", "possible", "noissue", "unavailable", "saving", "submiterror"].includes(scanStep) ? <Button disabled={!coordinates || scanStep === "saving"} onClick={saveDetection}>{scanStep === "saving" ? "Submitting…" : scanStep === "submiterror" ? "Try submission again" : "Submit for human review"} <ChevronRight /></Button> : <Button disabled={!preview || scanStep === "analyzing" || scanStep === "locating"} onClick={analyze}>{scanStep === "analyzing" ? "Analyzing…" : "Analyze photo"}</Button>}</div>
        </section>
      </div>}
    </main>
  );
}
