"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { BarChart3, Camera, Check, ChevronRight, CircleAlert, Crosshair, LocateFixed, Map, Navigation, OctagonAlert, Route, ShieldCheck, Sparkles, Upload, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { flushQueuedReports, queueReport, queuedReportCount } from "@/app/offline-queue";
import { preparePrivateImage } from "@/app/image-privacy";

const DushanbeMap = dynamic(() => import("@/app/dushanbe-map").then((module) => module.DushanbeMap), {
  ssr: false,
  loading: () => <div className="map-loading">Loading Dushanbe street map…</div>,
});

type Issue = {
  id: string;
  street: string;
  detail: string;
  severity: "Critical" | "High" | "Medium";
  confidence: number | null;
  confirmations: number;
  coordinates: { latitude: number; longitude: number };
  status: "pending_review" | "verified" | "scheduled" | "repairing" | "repaired";
  locationAccuracy: number | null;
  locationSource: "gps" | "approximate" | "reviewer";
  defectType: string;
  aiExplanation: string;
  duplicateCount: number;
  updatedAt: string;
  createdAt: string;
  fresh?: boolean;
};

type Detection = {
  confidence: number;
  severity: Issue["severity"];
  label: string;
  certainty: "probable" | "possible";
  explanation: string;
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
const statusLabel: Record<Issue["status"], string> = { pending_review: "Needs review", verified: "Confirmed", scheduled: "Scheduled", repairing: "Repairing", repaired: "Repaired" };

export function RoadLensApp() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanStep, setScanStep] = useState<"ready" | "locating" | "analyzing" | "found" | "possible" | "noissue" | "unavailable" | "saving" | "submiterror">("ready");
  const [preview, setPreview] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [location, setLocation] = useState("Location not captured");
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource | null>(null);
  const [locationHint, setLocationHint] = useState("Coordinates are attached only to this road report.");
  const [detection, setDetection] = useState<Detection | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState<boolean | null>(null);
  const [offline, setOffline] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [metadataRemoved, setMetadataRemoved] = useState(false);
  const [mapMode, setMapMode] = useState<"live" | "route">("live");
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const analysisRun = useRef(0);
  const locationRun = useRef(0);
  const selected = useMemo(() => issues.find((issue) => issue.id === selectedId) ?? issues[0] ?? null, [issues, selectedId]);
  const mapIssues = useMemo(() => issues.filter((issue) => issue.locationSource !== "approximate" && (issue.locationAccuracy === null || issue.locationAccuracy <= 100)), [issues]);
  const metrics = useMemo(() => ({
    open: issues.filter((issue) => issue.status !== "repaired").length,
    pending: issues.filter((issue) => issue.status === "pending_review").length,
    verified: issues.filter((issue) => issue.status === "verified").length,
    repairing: issues.filter((issue) => issue.status === "scheduled" || issue.status === "repairing").length,
    repaired: issues.filter((issue) => issue.status === "repaired").length,
    today: issues.filter((issue) => new Date(issue.createdAt).toDateString() === new Date().toDateString()).length,
  }), [issues]);
  const severityCounts = useMemo(() => ({
    Critical: issues.filter((issue) => issue.severity === "Critical" && issue.status !== "repaired").length,
    High: issues.filter((issue) => issue.severity === "High" && issue.status !== "repaired").length,
    Medium: issues.filter((issue) => issue.severity === "Medium" && issue.status !== "repaired").length,
  }), [issues]);
  const severityTotal = Math.max(1, severityCounts.Critical + severityCounts.High + severityCounts.Medium);

  const resetScan = useCallback(() => {
    analysisRun.current += 1;
    locationRun.current += 1;
    setScanStep("ready");
    setPreview(null);
    setPhoto(null);
    setLocation("Location not captured");
    setCoordinates(null);
    setLocationAccuracy(null);
    setLocationSource(null);
    setLocationHint("Coordinates are attached only to this road report.");
    setDetection(null);
    setFileError(null);
    setAnalysisError(null);
    setSubmitError(null);
    setMetadataRemoved(false);
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
    let active = true;
    const refreshQueued = () => queuedReportCount().then((count) => { if (active) setQueuedCount(count); }).catch(() => undefined);
    const sync = () => {
      if (!navigator.onLine) return;
      flushQueuedReports().then(({ sent, remaining }) => {
        if (!active) return;
        setQueuedCount(remaining);
        if (sent) setSyncMessage(`${sent} offline ${sent === 1 ? "report" : "reports"} uploaded.`);
      }).catch(() => undefined);
    };
    void refreshQueued();
    window.addEventListener("online", sync);
    sync();
    return () => { active = false; window.removeEventListener("online", sync); };
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
          return await response.json() as { reports?: Array<{ id: string; street: string; detail: string; severity: string; confidence: number | null; confirmations: number; latitude: number; longitude: number; locationAccuracy: number | null; locationSource: string; defectType: string | null; aiExplanation: string | null; duplicateCount: number; status: string; createdAt: string; updatedAt: string }> };
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
            status: report.status === "verified" || report.status === "scheduled" || report.status === "repairing" || report.status === "repaired" ? report.status : "pending_review",
            locationAccuracy: report.locationAccuracy,
            locationSource: report.locationSource === "gps" || report.locationSource === "reviewer" ? report.locationSource : "approximate",
            defectType: report.defectType || "road damage",
            aiExplanation: report.aiExplanation || report.detail,
            duplicateCount: Number(report.duplicateCount) || 0,
            updatedAt: report.updatedAt || report.createdAt,
            createdAt: report.createdAt,
            coordinates: { latitude: report.latitude, longitude: report.longitude },
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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeScan();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", closeOnEscape); };
  }, [scanOpen, closeScan]);

  function locate() {
    const run = ++locationRun.current;
    setScanStep("locating");
    setLocationHint("Requesting location from your phone…");
    const setApproximateLocation = (error?: GeolocationPositionError) => {
      if (run !== locationRun.current) return;
      setCoordinates(DUSHANBE_FALLBACK);
      setLocationAccuracy(null);
      setLocationSource("approximate");
      setLocation("Dushanbe center · approximate");
      setLocationHint(error?.code === 1
        ? "Location is blocked for this website. Allow it in your browser settings, then tap Refresh."
        : error?.code === 2
          ? "Your phone could not get a location fix. Move near a window and tap Refresh."
          : error?.code === 3
            ? "Location took too long. Tap Refresh to try again."
            : "This browser did not provide GPS. A reviewer must confirm the road location.");
      setScanStep("ready");
    };
    if (!navigator.geolocation) { setApproximateLocation(); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (run !== locationRun.current) return;
        setCoordinates({ latitude: coords.latitude, longitude: coords.longitude });
        setLocationAccuracy(coords.accuracy);
        setLocationSource("gps");
        setLocation(`${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)} · ±${Math.max(1, Math.round(coords.accuracy))} m`);
        setLocationHint(coords.accuracy <= 50 ? "Precise enough to publish after review." : coords.accuracy <= 100 ? "Usable location. Keep the phone still and refresh for better precision." : "Low GPS precision. A reviewer must correct the marker before publication.");
        setScanStep("ready");
      },
      setApproximateLocation,
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 0 },
    );
  }

  async function selectPhoto(file?: File) {
    if (!file) return;
    const normalizedFile = normalizeImageFile(file);
    analysisRun.current += 1;
    locationRun.current += 1;
    setScanStep("ready");
    setPhoto(null);
    setPreview(null);
    setCoordinates(null);
    setLocationAccuracy(null);
    setLocationSource(null);
    setLocationHint("Requesting location from your phone…");
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
    const prepared = await preparePrivateImage(normalizedFile);
    setMetadataRemoved(prepared.metadataRemoved);
    setPhoto(prepared.file);
    setPreview(URL.createObjectURL(prepared.file));
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
      const explanation = confidence >= 72
        ? `The detector found a strong ${label} pattern with broken pavement edges and contrasting surface texture.`
        : `The detector found a possible ${label} pattern, but lighting, distance, or surface texture makes the result uncertain.`;
      setDetection({ confidence, severity, label, certainty, explanation });
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
    const publishableLocation = locationSource === "gps" && (locationAccuracy === null || locationAccuracy <= 100);
    const reportStreet = publishableLocation ? "Current road segment" : "Dushanbe · location needs verification";
    const locationNote = publishableLocation ? "" : " · location needs verification";
    const detectionDetail = detection ? `${detection.certainty === "probable" ? "Probable" : "Possible"} ${detection.label} · model screened${locationNote}` : `Road damage · awaiting review${locationNote}`;
    const form = new FormData();
    form.set("image", photo);
    form.set("latitude", String(coordinates.latitude));
    form.set("longitude", String(coordinates.longitude));
    if (locationAccuracy !== null) form.set("locationAccuracy", String(locationAccuracy));
    form.set("locationSource", locationSource ?? "approximate");
    form.set("severity", detection?.severity ?? "Medium");
    form.set("street", reportStreet);
    form.set("detail", detectionDetail);
    form.set("defectType", detection?.label ?? "road damage");
    form.set("aiExplanation", detection?.explanation ?? "Automatic analysis was unavailable; a reviewer must inspect the photo.");
    if (detection) form.set("confidence", String(detection.confidence));
    const saveOffline = async () => {
      await queueReport(form);
      const count = await queuedReportCount();
      setQueuedCount(count);
      setSyncMessage("Saved safely on this phone. It will upload when RoadLens is online.");
      closeScan();
    };
    if (!navigator.onLine) { try { await saveOffline(); } catch { setSubmitError("This browser could not save the offline report."); setScanStep("submiterror"); } return; }
    try {
      const response = await fetch("/api/reports", { method: "POST", body: form });
      const result = await response.json() as { report?: { id: string; duplicateOf: string | null; status: "pending_review"; createdAt: string }; error?: string };
      if (!response.ok || !result.report) {
        if (response.status >= 500) setStorageReady(false);
        setSubmitError(result.error || "The report was not submitted. Keep this screen open and try again.");
        setScanStep("submiterror");
        return;
      }
      setStorageReady(true);
      if (result.report.duplicateOf) {
        setIssues((current) => current.map((issue) => issue.id === result.report!.duplicateOf ? { ...issue, duplicateCount: issue.duplicateCount + 1 } : issue));
        setSelectedId(result.report.duplicateOf);
        setSyncMessage(`Matched nearby report ${result.report.duplicateOf}; its evidence count increased.`);
      } else {
        const issue: Issue = { id: result.report.id, street: reportStreet, detail: detectionDetail, severity: detection?.severity ?? "Medium", confidence: detection?.confidence ?? null, confirmations: 0, status: result.report.status, locationAccuracy, locationSource: locationSource ?? "approximate", defectType: detection?.label ?? "road damage", aiExplanation: detection?.explanation ?? "Awaiting visual confirmation.", duplicateCount: 0, updatedAt: result.report.createdAt, createdAt: result.report.createdAt, coordinates, fresh: true };
        setIssues((current) => [issue, ...current]); setSelectedId(issue.id);
      }
      closeScan();
    } catch {
      setStorageReady(false);
      try { await saveOffline(); } catch { setSubmitError("The report could not be uploaded or saved offline. Keep this screen open and try again."); setScanStep("submiterror"); }
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="RoadLens home"><span className="brand-mark"><Route aria-hidden="true" /></span><span>RoadLens</span><span className="city-label">DUSHANBE</span></div>
        <div className="topbar-center"><span className={`live-dot ${storageReady === false ? "warning" : ""}`} /><span>{storageReady === false ? "Reporting temporarily unavailable" : storageReady === null ? "Checking report network…" : "Road reporting active"}</span><span className="signal-meta">{issues.length} live reports</span></div>
        <div className="topbar-actions">{(offline || queuedCount > 0) && <span className="offline-pill"><WifiOff /> {offline ? "Offline" : "Syncing"} · {queuedCount} queued</span>}<Link className="review-link" href="/review">Operations</Link><Button className="scan-button" onClick={openScan}><Camera /> Start road scan</Button></div>
      </header>

      {syncMessage && <button className="sync-banner" onClick={() => setSyncMessage(null)}><Check /> {syncMessage}<X /></button>}

      <section className="workspace">
        <aside className="control-panel">
          <div className="eyebrow"><Crosshair /> Operations overview</div>
          <h1>Dushanbe road<br />operations</h1>
          <p className="intro">From phone evidence to a verified repair queue.</p>
          <div className="metrics-grid">
            <article><strong>{metrics.open}</strong><span>Open reports</span><em>{metrics.today} today</em></article>
            <article><strong>{metrics.pending}</strong><span>Awaiting review</span><em>Human queue</em></article>
            <article><strong>{metrics.repairing}</strong><span>In repair flow</span><em>Scheduled or active</em></article>
            <article><strong>{metrics.repaired}</strong><span>Repaired</span><em className="good">Completed work</em></article>
          </div>
          <div className="network-pulse"><div className="section-heading"><span><BarChart3 /> Active severity</span><small>{metrics.open} unresolved</small></div>{(["Critical", "High", "Medium"] as const).map((severity) => <div className="severity-bar" key={severity}><span>{severity}</span><i><b className={severity.toLowerCase()} style={{ width: `${severityCounts[severity] / severityTotal * 100}%` }} /></i><strong>{severityCounts[severity]}</strong></div>)}</div>
          <div className="section-heading"><span>Priority queue</span><small>{Math.min(issues.length, 4)} shown</small></div>
          <div className="issue-list">
            {!issues.length && <div className="issue-empty"><Map /><strong>No reports yet</strong><small>Upload the first road observation to begin.</small></div>}
            {issues.slice(0, 4).map((issue) => (
              <button key={issue.id} className={`issue-row ${selectedId === issue.id ? "active" : ""}`} onClick={() => setSelectedId(issue.id)}>
                <span className={`severity-icon ${severityStyle[issue.severity]}`}>{issue.severity === "Critical" ? <OctagonAlert /> : <CircleAlert />}</span>
                <span className="issue-copy"><strong>{issue.street}</strong><small>{issue.detail}</small></span>
                <span className="issue-score">{statusLabel[issue.status]}<small>{issue.duplicateCount ? `${issue.duplicateCount + 1} observations` : issue.status === "pending_review" ? "pending" : `${issue.confirmations} confirms`}</small></span>
              </button>
            ))}
          </div>
        </aside>

        <section className="map-panel" aria-label="Dushanbe road issue map">
          <div className="map-toolbar"><div className="map-tabs"><button className={mapMode === "live" ? "active" : ""} onClick={() => setMapMode("live")}><Map /> Live map</button><button className={mapMode === "route" ? "active" : ""} onClick={() => setMapMode("route")}><Route /> Inspection route</button></div><button className="map-action" disabled={!mapIssues.length} onClick={() => setSelectedId(mapIssues[0]?.id ?? null)}><LocateFixed /> Focus priority</button></div>
          <div className="map-canvas">
            <DushanbeMap issues={mapIssues} selectedId={selectedId} mode={mapMode} onSelect={setSelectedId} />
            {issues.length > mapIssues.length && <div className="map-location-note"><LocateFixed /> {issues.length - mapIssues.length} {issues.length - mapIssues.length === 1 ? "report needs" : "reports need"} location verification</div>}
            {mapMode === "route" && mapIssues.length > 0 && <div className="route-summary"><Navigation /><span><strong>Inspection route</strong><small>{Math.min(3, mapIssues.length)} priority {mapIssues.length === 1 ? "stop" : "stops"}</small></span></div>}
            <div className="map-legend"><span><i className="legend-dot critical" /> Critical</span><span><i className="legend-dot high" /> High</span><span><i className="legend-dot medium" /> Medium</span></div>
          </div>
          {selected ? <article className="issue-detail">
            <div className="detail-main"><span className={`severity-badge ${severityStyle[selected.severity]}`}>{selected.severity}</span><div><small>{selected.id} · {statusLabel[selected.status]}</small><h2>{selected.street}</h2><p>{selected.aiExplanation}</p></div></div>
            <div className="confidence-ring" style={{ "--score": `${(selected.confidence ?? (selected.status === "verified" ? 100 : 0)) * 3.6}deg` } as React.CSSProperties}><span>{selected.confidence === null ? "Human" : `${selected.confidence}%`}</span><small>assessment</small></div>
            <div className="verification"><ShieldCheck /><span><strong>{selected.duplicateCount ? `${selected.duplicateCount + 1} nearby observations` : statusLabel[selected.status]}</strong><small>Updated {new Date(selected.updatedAt).toLocaleString()}</small></span></div>
            <Button className="route-button" onClick={() => setMapMode("route")}><Navigation /> Plan inspection</Button>
          </article> : <article className="issue-detail empty-detail"><Map /><div><h2>No road reports</h2><p>New submissions will appear here with their review status.</p></div></article>}
        </section>
      </section>

      {scanOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeScan()}>
        <section className="scan-modal" role="dialog" aria-modal="true" aria-labelledby="scan-title">
          <div className="scan-head"><div><span className="eyebrow"><Sparkles /> New observation</span><h2 id="scan-title">Scan road damage</h2></div><button className="icon-button" onClick={closeScan} aria-label="Close"><X /></button></div>
          {!preview ? <div className="capture-zone"><span className="capture-icon"><Camera /></span><strong>Add a clear road photo</strong><small>Keep the damaged area centered and avoid people or license plates.</small><div className="capture-actions"><Button onClick={() => cameraRef.current?.click()}><Camera /> Take photo</Button><Button variant="outline" onClick={() => uploadRef.current?.click()}><Upload /> Upload photo</Button></div></div> : <div className="photo-preview"><Image src={preview} alt="Road damage awaiting analysis" fill unoptimized /><div className="photo-actions"><button onClick={() => cameraRef.current?.click()}><Camera /> Retake</button><button onClick={() => uploadRef.current?.click()}><Upload /> Replace</button></div></div>}
          <input ref={cameraRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void selectPhoto(file); }} />
          <input ref={uploadRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void selectPhoto(file); }} />
          {fileError && <div className="result-card warning"><span><CircleAlert /></span><div><strong>Photo cannot be used</strong><small>{fileError}</small></div></div>}
          <div className={`location-row ${locationSource === "approximate" || (locationAccuracy !== null && locationAccuracy > 100) ? "approximate" : ""}`}><LocateFixed /><div><strong>{scanStep === "locating" ? "Finding your precise location…" : location}</strong><small>{locationHint}</small>{locationAccuracy !== null && <span className="accuracy-meter"><i style={{ width: `${Math.max(8, Math.min(100, 100 - locationAccuracy / 2))}%` }} /> GPS precision</span>}</div><button onClick={locate}>Refresh</button></div>
          {scanStep === "analyzing" && <div className="analysis-state"><span className="scanner" /><div><strong>Inspecting road surface</strong><small>Checking shape, depth cues, and pavement boundaries…</small></div></div>}
          {scanStep === "found" && detection && <div className="result-card"><span><Check /></span><div><strong>Probable {detection.label} detected</strong><small>{detection.severity} priority · {detection.confidence}% model confidence</small><p>{detection.explanation}</p></div></div>}
          {scanStep === "possible" && detection && <div className="result-card warning"><span><CircleAlert /></span><div><strong>Possible {detection.label}</strong><small>Low-confidence match ({detection.confidence}%)</small><p>{detection.explanation}</p></div></div>}
          {scanStep === "noissue" && <div className="result-card neutral"><span><Check /></span><div><strong>No confident road damage found</strong><small>This is not a guarantee. You can still submit the observation for human review.</small></div></div>}
          {scanStep === "unavailable" && <div className="result-card warning actionable"><span><CircleAlert /></span><div><strong>Automatic detection is unavailable</strong><small>{analysisError || "Your photo is still here and can be reviewed by a person."}</small><button type="button" onClick={analyze}>Try automatic analysis again</button></div></div>}
          {scanStep === "submiterror" && <div className="result-card error"><span><CircleAlert /></span><div><strong>Report not submitted</strong><small>{submitError}</small></div></div>}
          <div className="scan-footer"><span className="privacy-note"><ShieldCheck /> {metadataRemoved ? "Photo metadata removed · reviewers only" : "Evidence is available only to authorized reviewers"}</span>{["found", "possible", "noissue", "unavailable", "saving", "submiterror"].includes(scanStep) ? <Button disabled={!coordinates || scanStep === "saving"} onClick={saveDetection}>{scanStep === "saving" ? (offline ? "Saving offline…" : "Submitting…") : scanStep === "submiterror" ? "Try submission again" : "Submit for human review"} <ChevronRight /></Button> : <Button disabled={!preview || scanStep === "analyzing" || scanStep === "locating"} onClick={analyze}>{scanStep === "analyzing" ? "Analyzing…" : "Analyze photo"}</Button>}</div>
        </section>
      </div>}
    </main>
  );
}
