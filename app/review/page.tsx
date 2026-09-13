"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Check, CircleAlert, ClipboardCheck, Clock3, Construction, LoaderCircle, MapPin, Route, ShieldCheck, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const ReviewLocationMap = dynamic(() => import("@/app/review/review-location-map").then((module) => module.ReviewLocationMap), { ssr: false });

type WorkflowStatus = "pending_review" | "verified" | "scheduled" | "repairing" | "repaired";
type ReviewReport = {
  id: string; street: string; detail: string; severity: "Critical" | "High" | "Medium";
  confidence: number | null; confirmations: number; latitude: number; longitude: number;
  locationAccuracy: number | null; locationSource: "gps" | "approximate" | "reviewer";
  defectType: string | null; aiExplanation: string | null; duplicateOf: string | null;
  reviewerNote: string | null; status: WorkflowStatus; createdAt: string; updatedAt: string; hasImage: number;
};

type Edits = Pick<ReviewReport, "street" | "severity" | "latitude" | "longitude"> & { defectType: string; reviewerNote: string };

const workflow: Array<{ status: WorkflowStatus; label: string }> = [
  { status: "pending_review", label: "Review" }, { status: "verified", label: "Confirmed" },
  { status: "scheduled", label: "Scheduled" }, { status: "repairing", label: "Repairing" }, { status: "repaired", label: "Repaired" },
];

function ReviewImage({ id, token }: { id: string; token: string }) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true; let objectUrl: string | null = null;
    fetch(`/api/review/image?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.ok ? response.blob() : Promise.reject())
      .then((blob) => { if (!active) return; objectUrl = URL.createObjectURL(blob); setSource(objectUrl); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, token]);
  if (failed) return <div className="review-image-fallback"><CircleAlert /> Image unavailable</div>;
  if (!source) return <div className="review-image-fallback"><LoaderCircle className="review-spinner" /> Loading evidence…</div>;
  return <Image className="review-image" src={source} alt={`Road evidence for report ${id}`} width={960} height={640} unoptimized />;
}

function ReportEditor({ report, token, working, onUpdate }: { report: ReviewReport; token: string; working: boolean; onUpdate: (report: ReviewReport, update: Record<string, unknown>) => Promise<void> }) {
  const [edits, setEdits] = useState<Edits>({ street: report.street, severity: report.severity, defectType: report.defectType || "road damage", latitude: report.latitude, longitude: report.longitude, reviewerNote: report.reviewerNote || "" });
  const patch = (values: Partial<Edits>) => setEdits((current) => ({ ...current, ...values }));
  const correction = { street: edits.street, severity: edits.severity, defectType: edits.defectType, latitude: edits.latitude, longitude: edits.longitude, reviewerNote: edits.reviewerNote };
  const next = report.status === "verified" ? { status: "scheduled", label: "Schedule repair", icon: <Clock3 /> }
    : report.status === "scheduled" ? { status: "repairing", label: "Start repair", icon: <Construction /> }
      : report.status === "repairing" ? { status: "repaired", label: "Mark repaired", icon: <Wrench /> } : null;

  return <article className={`review-card status-${report.status}`}>
    <div className="review-evidence">
      {report.hasImage ? <ReviewImage id={report.id} token={token} /> : <div className="review-image-fallback"><CircleAlert /> No evidence image</div>}
      <span className={`workflow-chip ${report.status}`}>{workflow.find((item) => item.status === report.status)?.label}</span>
    </div>
    <div className="review-card-body">
      <div className="review-card-meta"><span>{report.id}</span><span>{new Date(report.createdAt).toLocaleString()}</span>{report.duplicateOf && <span className="duplicate-chip">Nearby report · {report.duplicateOf}</span>}</div>
      <div className="review-fields two-columns">
        <label>Road or landmark<input value={edits.street} maxLength={120} onChange={(event) => patch({ street: event.target.value })} /></label>
        <label>Damage type<input value={edits.defectType} maxLength={60} onChange={(event) => patch({ defectType: event.target.value })} /></label>
        <label>Severity<select value={edits.severity} onChange={(event) => patch({ severity: event.target.value as Edits["severity"] })}><option>Critical</option><option>High</option><option>Medium</option></select></label>
        <label>Model confidence<input value={report.confidence === null ? "Not available" : `${report.confidence}%`} disabled /></label>
      </div>
      <div className="ai-explanation"><ShieldCheck /><div><strong>Model assessment</strong><span>{report.aiExplanation || report.detail}</span></div></div>
      <ReviewLocationMap latitude={edits.latitude} longitude={edits.longitude} onChange={(latitude, longitude) => patch({ latitude, longitude })} />
      <div className="coordinate-row"><MapPin /><span>{edits.latitude.toFixed(6)}, {edits.longitude.toFixed(6)}</span><strong>{report.locationSource === "approximate" ? "Needs correction" : report.locationAccuracy === null ? "Accuracy unknown" : `±${Math.round(report.locationAccuracy)} m captured`}</strong></div>
      <label className="review-note">Reviewer note<textarea value={edits.reviewerNote} maxLength={240} placeholder="Add a repair instruction or location landmark" onChange={(event) => patch({ reviewerNote: event.target.value })} /></label>
      <div className="review-actions">
        {report.status === "pending_review" && <><Button disabled={working} onClick={() => onUpdate(report, { ...correction, decision: "verify" })}><Check /> Confirm and publish</Button><Button variant="outline" disabled={working} onClick={() => onUpdate(report, { decision: "reject" })}><X /> Reject</Button></>}
        {next && <Button disabled={working} onClick={() => onUpdate(report, { ...correction, status: next.status })}>{next.icon}{next.label}</Button>}
        {report.status === "repaired" && <span className="repair-complete"><Check /> Repair completed</span>}
      </div>
    </div>
  </article>;
}

export default function ReviewPage() {
  const [accessCode, setAccessCode] = useState("");
  const [token, setToken] = useState("");
  const [reports, setReports] = useState<ReviewReport[]>([]);
  const [state, setState] = useState<"locked" | "loading" | "ready" | "error">("locked");
  const [message, setMessage] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"review" | "work" | "done">("review");

  const loadQueue = useCallback(async (reviewerToken: string) => {
    setState("loading"); setMessage("");
    try {
      const response = await fetch("/api/review", { headers: { Authorization: `Bearer ${reviewerToken}` } });
      const payload = await response.json() as { reports?: ReviewReport[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to open the review queue.");
      setReports(payload.reports ?? []); setToken(reviewerToken); setState("ready");
    } catch (error) { setToken(""); setState("error"); setMessage(error instanceof Error ? error.message : "Unable to open the review queue."); }
  }, []);

  const visible = useMemo(() => reports.filter((report) => filter === "review" ? report.status === "pending_review" : filter === "done" ? report.status === "repaired" : ["verified", "scheduled", "repairing"].includes(report.status)), [filter, reports]);
  const counts = useMemo(() => Object.fromEntries(workflow.map(({ status }) => [status, reports.filter((report) => report.status === status).length])), [reports]);

  async function updateReport(report: ReviewReport, update: Record<string, unknown>) {
    setWorkingId(report.id); setMessage("");
    try {
      const response = await fetch("/api/review", { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: report.id, ...update }) });
      const payload = await response.json() as { report?: { status: WorkflowStatus | "rejected" }; error?: string };
      if (!response.ok || !payload.report) throw new Error(payload.error || "The review update could not be saved.");
      if (payload.report.status === "rejected") setReports((current) => current.filter((item) => item.id !== report.id));
      else setReports((current) => current.map((item) => item.id === report.id ? { ...item, ...update, status: payload.report!.status, locationSource: update.latitude !== undefined ? "reviewer" : item.locationSource, locationAccuracy: update.latitude !== undefined ? 0 : item.locationAccuracy, updatedAt: new Date().toISOString() } as ReviewReport : item));
      setMessage(`${report.id} moved to ${payload.report.status.replace("_", " ")}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The review update could not be saved."); }
    finally { setWorkingId(null); }
  }

  return <main className="review-shell">
    <header className="review-topbar"><Link className="brand" href="/"><span className="brand-mark"><Route aria-hidden="true" /></span><span>RoadLens</span><span className="city-label">OPERATIONS</span></Link>{token && <button className="review-lock" onClick={() => { setToken(""); setReports([]); setAccessCode(""); setState("locked"); }}>Lock workspace</button>}</header>
    {!token ? <section className="review-login"><span className="review-login-icon"><ClipboardCheck /></span><h1>Road operations</h1><p>Authorized reviewers can validate evidence, correct map locations, and track each repair to completion.</p><form onSubmit={(event) => { event.preventDefault(); if (accessCode.trim()) void loadQueue(accessCode.trim()); }}><label htmlFor="review-code">Reviewer access code</label><input id="review-code" type="password" autoComplete="current-password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} required /><Button type="submit" disabled={state === "loading"}>{state === "loading" ? "Opening…" : "Open workspace"}</Button></form>{state === "error" && <div className="review-message error"><CircleAlert /> {message}</div>}</section>
      : <section className="review-workspace">
        <div className="review-heading"><div><span className="eyebrow"><ClipboardCheck /> Operations desk</span><h1>Evidence to repair</h1><p>Correct locations, validate damage, and move confirmed work through completion.</p></div><Button variant="outline" onClick={() => void loadQueue(token)}>Refresh</Button></div>
        <div className="workflow-overview">{workflow.map((item) => <article key={item.status}><span>{item.label}</span><strong>{counts[item.status] || 0}</strong></article>)}</div>
        <div className="review-tabs"><button className={filter === "review" ? "active" : ""} onClick={() => setFilter("review")}>Needs review · {counts.pending_review || 0}</button><button className={filter === "work" ? "active" : ""} onClick={() => setFilter("work")}>Repair work · {(counts.verified || 0) + (counts.scheduled || 0) + (counts.repairing || 0)}</button><button className={filter === "done" ? "active" : ""} onClick={() => setFilter("done")}>Completed · {counts.repaired || 0}</button></div>
        {message && <div className="review-message"><Check /> {message}</div>}
        {!visible.length ? <div className="review-empty"><ClipboardCheck /><h2>Nothing in this stage</h2><p>Reports will appear here as the workflow advances.</p></div> : <div className="review-grid">{visible.map((report) => <ReportEditor key={report.id} report={report} token={token} working={workingId === report.id} onUpdate={updateReport} />)}</div>}
      </section>}
  </main>;
}
