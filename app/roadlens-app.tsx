"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Check, ChevronRight, CircleAlert, Crosshair, LocateFixed, Map, Navigation, OctagonAlert, Route, ShieldCheck, Sparkles, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Issue = {
  id: string;
  street: string;
  detail: string;
  severity: "Critical" | "High" | "Medium";
  confidence: number | null;
  confirmations: number;
  position: { x: number; y: number };
  fresh?: boolean;
};

const initialIssues: Issue[] = [
  { id: "RL-1042", street: "Rudaki Avenue", detail: "Deep pothole · northbound", severity: "Critical", confidence: 97, confirmations: 6, position: { x: 63, y: 34 } },
  { id: "RL-1038", street: "Ismoili Somoni Avenue", detail: "Broken asphalt · right lane", severity: "High", confidence: 93, confirmations: 4, position: { x: 39, y: 58 } },
  { id: "RL-1029", street: "Nusratullo Makhsum Street", detail: "Surface cracking · 12 m section", severity: "Medium", confidence: 89, confirmations: 3, position: { x: 72, y: 69 } },
];

const severityStyle = { Critical: "critical", High: "high", Medium: "medium" };

export function RoadLensApp() {
  const [issues, setIssues] = useState(initialIssues);
  const [selectedId, setSelectedId] = useState(initialIssues[0].id);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanStep, setScanStep] = useState<"ready" | "locating" | "analyzing" | "found" | "noissue" | "unavailable" | "saving">("ready");
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [location, setLocation] = useState("Location not captured");
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [detection, setDetection] = useState<{ confidence: number; severity: Issue["severity"] } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState<boolean | null>(null);
  const [offline, setOffline] = useState(false);
  const [mapMode, setMapMode] = useState<"live" | "route">("live");
  const fileRef = useRef<HTMLInputElement>(null);
  const analysisRun = useRef(0);
  const locationRun = useRef(0);
  const selected = useMemo(() => issues.find((issue) => issue.id === selectedId) ?? issues[0], [issues, selectedId]);

  const resetScan = useCallback(() => {
    analysisRun.current += 1;
    locationRun.current += 1;
    setScanStep("ready");
    setPreview(null);
    setPhoto(null);
    setLocation("Location not captured");
    setCoordinates(null);
    setDetection(null);
    setFileError(null);
    if (fileRef.current) fileRef.current.value = "";
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
        .then((response) => response.ok ? response.json() : Promise.reject())
        .then((payload: { reports?: Array<{ id: string; street: string; detail: string; severity: string; confidence: number | null; confirmations: number; latitude: number; longitude: number }> }) => {
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
            position: {
              x: Math.max(4, Math.min(96, ((report.longitude - 68.73) / 0.14) * 100)),
              y: Math.max(4, Math.min(96, 100 - ((report.latitude - 38.52) / 0.11) * 100)),
            },
          }));
          setIssues((current) => [...saved, ...current.filter((sample) => !saved.some((report) => report.id === sample.id))]);
        })
        .catch(() => { if (active) setStorageReady(false); });
    };
    loadReports();
    window.addEventListener("online", loadReports);
    return () => { active = false; window.removeEventListener("online", loadReports); };
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
    if (!navigator.geolocation) { setLocation("Dushanbe · approximate location"); setScanStep("ready"); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { if (run !== locationRun.current) return; setCoordinates({ latitude: coords.latitude, longitude: coords.longitude }); setLocation(`${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`); setScanStep("ready"); },
      () => { if (run !== locationRun.current) return; setCoordinates(null); setLocation("Location permission is needed to submit"); setScanStep("ready"); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function selectPhoto(file?: File) {
    if (!file) return;
    analysisRun.current += 1;
    locationRun.current += 1;
    setScanStep("ready");
    setPhoto(null);
    setPreview(null);
    setCoordinates(null);
    setLocation("Location not captured");
    setDetection(null);
    const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
    if (!supportedTypes.has(file.type.toLowerCase())) {
      setFileError("Use a JPEG, PNG, WebP, HEIC, or HEIF photo.");
      return;
    }
    if (file.size === 0 || file.size > 8_000_000) {
      setFileError("The photo must be smaller than 8 MB.");
      return;
    }
    setFileError(null);
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    locate();
  }

  async function analyze() {
    if (!photo) return;
    const run = ++analysisRun.current;
    setScanStep("analyzing");
    const form = new FormData();
    form.set("image", photo);
    try {
      const response = await fetch("/api/analyze", { method: "POST", body: form });
      if (run !== analysisRun.current) return;
      if (!response.ok) { setScanStep("unavailable"); return; }
      const result = await response.json() as { detections?: Array<{ confidence?: number }> };
      const best = [...(result.detections ?? [])].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
      if (!best || typeof best.confidence !== "number") { setDetection(null); setScanStep("noissue"); return; }
      const confidence = Math.max(0, Math.min(100, Math.round(best.confidence <= 1 ? best.confidence * 100 : best.confidence)));
      const severity: Issue["severity"] = confidence >= 90 ? "Critical" : confidence >= 72 ? "High" : "Medium";
      setDetection({ confidence, severity });
      setScanStep("found");
    } catch { if (run === analysisRun.current) setScanStep("unavailable"); }
  }

  async function saveDetection() {
    if (!photo || !coordinates) return;
    setScanStep("saving");
    const form = new FormData();
    form.set("image", photo);
    form.set("latitude", String(coordinates.latitude));
    form.set("longitude", String(coordinates.longitude));
    form.set("severity", detection?.severity ?? "Medium");
    form.set("detail", detection ? "Probable pothole · model screened" : "Road damage · awaiting review");
    if (detection) form.set("confidence", String(detection.confidence));
    try {
      const response = await fetch("/api/reports", { method: "POST", body: form });
      const result = await response.json() as { report?: { id: string } };
      if (!response.ok || !result.report) { if (response.status >= 500) setStorageReady(false); setScanStep("unavailable"); return; }
      const issue: Issue = { id: result.report.id, street: "Current road segment", detail: detection ? "Probable pothole · model screened" : "Road damage · awaiting review", severity: detection?.severity ?? "Medium", confidence: detection?.confidence ?? null, confirmations: 1, position: { x: Math.max(4, Math.min(96, ((coordinates.longitude - 68.73) / 0.14) * 100)), y: Math.max(4, Math.min(96, 100 - ((coordinates.latitude - 38.52) / 0.11) * 100)) }, fresh: true };
      setStorageReady(true); setIssues((current) => [issue, ...current]); setSelectedId(issue.id); closeScan();
    } catch { setStorageReady(false); setScanStep("unavailable"); }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="RoadLens home"><span className="brand-mark"><Route aria-hidden="true" /></span><span>RoadLens</span><span className="city-label">DUSHANBE</span></div>
        <div className="topbar-center"><span className={`live-dot ${storageReady === false ? "warning" : ""}`} /><span>{storageReady === false ? "Reporting temporarily unavailable" : storageReady === null ? "Checking report network…" : "Road reporting active"}</span><span className="signal-meta">{issues.length} visible reports</span></div>
        <div className="topbar-actions">{offline && <span className="offline-pill"><WifiOff /> Offline · submission paused</span>}<Button className="scan-button" onClick={openScan}><Camera /> Start road scan</Button></div>
      </header>

      <section className="workspace">
        <aside className="control-panel">
          <div className="eyebrow"><Crosshair /> Operations overview</div>
          <h1>Road health,<br />as it happens.</h1>
          <p className="intro">Phone cameras become a shared early-warning system for safer, faster repairs.</p>
          <div className="metrics-grid">
            <article><strong>{issues.length + 21}</strong><span>Open issues</span><em>+3 today</em></article>
            <article><strong>82%</strong><span>Verified</span><em className="good">↑ 7%</em></article>
            <article><strong>4.2 km</strong><span>Road scanned</span><em>This week</em></article>
            <article><strong>31 h</strong><span>Avg. response</span><em className="good">↓ 12 h</em></article>
          </div>
          <div className="section-heading"><span>Priority queue</span><small>{Math.min(issues.length, 4)} shown</small></div>
          <div className="issue-list">
            {issues.slice(0, 4).map((issue) => (
              <button key={issue.id} className={`issue-row ${selectedId === issue.id ? "active" : ""}`} onClick={() => setSelectedId(issue.id)}>
                <span className={`severity-icon ${severityStyle[issue.severity]}`}>{issue.severity === "Critical" ? <OctagonAlert /> : <CircleAlert />}</span>
                <span className="issue-copy"><strong>{issue.street}</strong><small>{issue.detail}</small></span>
                <span className="issue-score">{issue.confidence === null ? "Review" : `${issue.confidence}%`}<small>{issue.confirmations} confirms</small></span>
              </button>
            ))}
          </div>
        </aside>

        <section className="map-panel" aria-label="Dushanbe road issue map">
          <div className="map-toolbar"><div className="map-tabs"><button className={mapMode === "live" ? "active" : ""} onClick={() => setMapMode("live")}><Map /> Live map</button><button className={mapMode === "route" ? "active" : ""} onClick={() => setMapMode("route")}><Route /> Inspection route</button></div><button className="map-action" onClick={() => setSelectedId(issues[0].id)}><LocateFixed /> Focus priority</button></div>
          <div className="map-canvas">
            <div className="map-grid" />
            <svg className="road-network" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
              <path className="road major" d="M-40 590 C180 480 260 410 430 280 S760 80 1040 120" /><path className="road major" d="M490 -40 C500 170 540 260 590 370 S670 590 720 760" /><path className="road" d="M30 220 C240 250 330 330 480 390 S790 500 1030 440" /><path className="road" d="M150 -20 C190 180 260 280 350 390 S490 620 500 750" /><path className="road" d="M760 -20 C730 160 700 270 650 360 S570 570 600 740" /><path className="river" d="M-30 110 C250 160 270 70 520 150 S830 260 1030 190" />
              {mapMode === "route" && <path className="inspection-route" d="M390 406 C460 350 545 330 630 238 S685 380 720 483" />}
            </svg>
            <div className="district-label label-1">SINO</div><div className="district-label label-2">ISMOILI SOMONI</div><div className="district-label label-3">SHOHMANSUR</div><div className="street-label street-1">Rudaki Avenue</div><div className="street-label street-2">Ismoili Somoni Ave</div>
            {issues.map((issue, index) => <button key={issue.id} className={`map-marker ${severityStyle[issue.severity]} ${selectedId === issue.id ? "selected" : ""} ${issue.fresh ? "fresh" : ""}`} style={{ left: `${issue.position.x}%`, top: `${issue.position.y}%` }} onClick={() => setSelectedId(issue.id)} aria-label={`${issue.severity} issue on ${issue.street}`}><span>{index + 1}</span></button>)}
            {mapMode === "route" && <div className="route-summary"><Navigation /><span><strong>Inspection route</strong><small>3 stops · 4.8 km · 22 min</small></span></div>}
            <div className="map-legend"><span><i className="legend-dot critical" /> Critical</span><span><i className="legend-dot high" /> High</span><span><i className="legend-dot medium" /> Medium</span></div>
          </div>
          <article className="issue-detail">
            <div className="detail-main"><span className={`severity-badge ${severityStyle[selected.severity]}`}>{selected.severity}</span><div><small>{selected.id}</small><h2>{selected.street}</h2><p>{selected.detail}</p></div></div>
            <div className="confidence-ring" style={{ "--score": `${(selected.confidence ?? 0) * 3.6}deg` } as React.CSSProperties}><span>{selected.confidence === null ? "Review" : `${selected.confidence}%`}</span><small>{selected.confidence === null ? "pending" : "confidence"}</small></div>
            <div className="verification"><ShieldCheck /><span><strong>{selected.confirmations} independent passes</strong><small>Last seen 8 min ago</small></span></div>
            <Button className="route-button" onClick={() => setMapMode("route")}><Navigation /> Plan inspection</Button>
          </article>
        </section>
      </section>

      {scanOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeScan()}>
        <section className="scan-modal" role="dialog" aria-modal="true" aria-labelledby="scan-title">
          <div className="scan-head"><div><span className="eyebrow"><Sparkles /> New observation</span><h2 id="scan-title">Scan road damage</h2></div><button className="icon-button" onClick={closeScan} aria-label="Close"><X /></button></div>
          {!preview ? <button className="capture-zone" onClick={() => fileRef.current?.click()}><span className="capture-icon"><Camera /></span><strong>Take a clear road photo</strong><small>Keep the damaged area centered and avoid people or license plates.</small></button> : <div className="photo-preview"><Image src={preview} alt="Road damage awaiting analysis" fill unoptimized /><button onClick={() => fileRef.current?.click()}>Retake</button></div>}
          <input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; selectPhoto(file); }} />
          {fileError && <div className="result-card warning"><span><CircleAlert /></span><div><strong>Photo cannot be used</strong><small>{fileError}</small></div></div>}
          <div className="location-row"><LocateFixed /><div><strong>{scanStep === "locating" ? "Finding your location…" : location}</strong><small>Coordinates are attached only to this road report.</small></div><button onClick={locate}>Refresh</button></div>
          {scanStep === "analyzing" && <div className="analysis-state"><span className="scanner" /><div><strong>Inspecting road surface</strong><small>Checking shape, depth cues, and pavement boundaries…</small></div></div>}
          {scanStep === "found" && detection && <div className="result-card"><span><Check /></span><div><strong>Probable pothole detected</strong><small>{detection.severity} priority · {detection.confidence}% model confidence · review recommended</small></div></div>}
          {scanStep === "noissue" && <div className="result-card neutral"><span><Check /></span><div><strong>No pothole detected</strong><small>You can still submit the observation for human review.</small></div></div>}
          {scanStep === "unavailable" && <div className="result-card warning"><span><CircleAlert /></span><div><strong>Automatic detection is unavailable</strong><small>Your photo is still here. Submit it for human review or try analysis again.</small></div></div>}
          <div className="scan-footer"><span className="privacy-note"><ShieldCheck /> Faces and plates should be removed before long-term retention</span>{["found", "noissue", "unavailable", "saving"].includes(scanStep) ? <Button disabled={!coordinates || scanStep === "saving"} onClick={saveDetection}>{scanStep === "saving" ? "Saving…" : "Submit observation"} <ChevronRight /></Button> : <Button disabled={!preview || scanStep === "analyzing" || scanStep === "locating"} onClick={analyze}>{scanStep === "analyzing" ? "Analyzing…" : "Analyze photo"}</Button>}</div>
        </section>
      </div>}
    </main>
  );
}
