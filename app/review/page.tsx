"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import "./admin.css";
import { Activity, Check, ChevronRight, CircleAlert, ClipboardCheck, Clock3, Construction, Download, LayoutDashboard, LoaderCircle, MapPin, RefreshCw, Route, Search, ShieldCheck, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const ReviewLocationMap = dynamic(() => import("@/app/review/review-location-map").then((module) => module.ReviewLocationMap), { ssr: false });

type WorkflowStatus = "pending_review" | "verified" | "scheduled" | "repairing" | "repaired";
type QueueFilter = "review" | "work" | "done" | "all";
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
const severityRank = { Critical: 0, High: 1, Medium: 2 };
const statusLabel = Object.fromEntries(workflow.map((item) => [item.status, item.label])) as Record<WorkflowStatus, string>;

function reportAge(date: string) {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 3_600_000));
  if (hours < 1) return "Now";
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function ReviewImage({ id, token }: { id: string; token: string }) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true; let objectUrl: string | null = null;
    fetch(`/api/review/image?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
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

  return <article className={`admin-detail status-${report.status}`}>
    <header className="admin-detail-heading"><div><span className={`admin-severity ${report.severity.toLowerCase()}`}>{report.severity}</span><span className={`workflow-chip-inline ${report.status}`}>{statusLabel[report.status]}</span></div><strong>{report.id}</strong><small>Received {new Date(report.createdAt).toLocaleString()}</small></header>
    <div className="admin-evidence">{report.hasImage ? <ReviewImage id={report.id} token={token} /> : <div className="review-image-fallback"><CircleAlert /> No evidence image</div>}</div>
    <div className="admin-detail-body">
      {report.duplicateOf && <div className="duplicate-notice"><Activity /> Possible duplicate of {report.duplicateOf}</div>}
      <div className="review-fields two-columns">
        <label>Road or landmark<input value={edits.street} maxLength={120} onChange={(event) => patch({ street: event.target.value })} /></label>
        <label>Damage type<input value={edits.defectType} maxLength={60} onChange={(event) => patch({ defectType: event.target.value })} /></label>
        <label>Severity<select value={edits.severity} onChange={(event) => patch({ severity: event.target.value as Edits["severity"] })}><option>Critical</option><option>High</option><option>Medium</option></select></label>
        <label>Model confidence<input value={report.confidence === null ? "Not available" : `${report.confidence}%`} disabled /></label>
      </div>
      <div className="ai-explanation"><ShieldCheck /><div><strong>Model assessment</strong><span>{report.aiExplanation || report.detail}</span></div></div>
      <div className="admin-map-label"><MapPin /> Correct the exact location</div>
      <ReviewLocationMap latitude={edits.latitude} longitude={edits.longitude} onChange={(latitude, longitude) => patch({ latitude, longitude })} />
      <div className="coordinate-row"><span>{edits.latitude.toFixed(6)}, {edits.longitude.toFixed(6)}</span><strong>{report.locationSource === "approximate" ? "Needs correction" : report.locationAccuracy === null ? "Accuracy unknown" : `±${Math.round(report.locationAccuracy)} m captured`}</strong></div>
      <label className="review-note">Reviewer note<textarea value={edits.reviewerNote} maxLength={240} placeholder="Add a landmark or repair instruction" onChange={(event) => patch({ reviewerNote: event.target.value })} /></label>
      <div className="review-actions">
        {report.status === "pending_review" && <><Button disabled={working || !edits.street.trim()} onClick={() => onUpdate(report, { ...correction, decision: "verify" })}><Check /> Confirm report</Button>
          <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" disabled={working}><X /> Reject</Button></AlertDialogTrigger><AlertDialogContent className="admin-confirm-dialog"><AlertDialogHeader><AlertDialogTitle>Reject {report.id}?</AlertDialogTitle><AlertDialogDescription>This permanently removes its evidence image and hides the report from operations. Use this only for invalid or unusable submissions.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep report</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void onUpdate(report, { decision: "reject" })}>Reject report</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
        </>}
        {next && <Button disabled={working} onClick={() => onUpdate(report, { ...correction, status: next.status })}>{next.icon}{next.label}</Button>}
        {report.status === "repaired" && <span className="repair-complete"><Check /> Repair completed</span>}
      </div>
    </div>
  </article>;
}

export default function ReviewPage() {
  const [accessCode, setAccessCode] = useState(""); const [token, setToken] = useState("");
  const [reports, setReports] = useState<ReviewReport[]>([]); const [state, setState] = useState<"locked" | "loading" | "ready" | "error">("locked");
  const [message, setMessage] = useState(""); const [workingId, setWorkingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<QueueFilter>("review"); const [severity, setSeverity] = useState("all"); const [sort, setSort] = useState("priority"); const [query, setQuery] = useState(""); const [selectedId, setSelectedId] = useState<string | null>(null);

  const loadQueue = useCallback(async (reviewerToken: string) => {
    setState("loading"); setMessage("");
    try {
      const response = await fetch("/api/review", { headers: { Authorization: `Bearer ${reviewerToken}` }, cache: "no-store" });
      const payload = await response.json() as { reports?: ReviewReport[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to open the admin workspace.");
      const nextReports = payload.reports ?? []; setReports(nextReports); setToken(reviewerToken); setState("ready");
      setSelectedId((current) => current && nextReports.some((report) => report.id === current) ? current : nextReports[0]?.id ?? null);
    } catch (error) { setToken(""); setState("error"); setMessage(error instanceof Error ? error.message : "Unable to open the admin workspace."); }
  }, []);

  const counts = useMemo(() => Object.fromEntries(workflow.map(({ status }) => [status, reports.filter((report) => report.status === status).length])) as Record<WorkflowStatus, number>, [reports]);
  const visible = useMemo(() => reports.filter((report) => {
    const matchesStage = filter === "all" || (filter === "review" && report.status === "pending_review") || (filter === "done" && report.status === "repaired") || (filter === "work" && ["verified", "scheduled", "repairing"].includes(report.status));
    const matchesSeverity = severity === "all" || report.severity === severity; const term = query.trim().toLowerCase();
    const matchesQuery = !term || [report.id, report.street, report.detail, report.defectType, report.reviewerNote].some((value) => value?.toLowerCase().includes(term));
    return matchesStage && matchesSeverity && matchesQuery;
  }).sort((a, b) => sort === "newest" ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() : sort === "oldest" ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() : severityRank[a.severity] - severityRank[b.severity] || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [filter, query, reports, severity, sort]);
  const selected = visible.find((report) => report.id === selectedId) ?? visible[0] ?? null;
  async function updateReport(report: ReviewReport, update: Record<string, unknown>) {
    setWorkingId(report.id); setMessage("");
    try {
      const response = await fetch("/api/review", { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: report.id, ...update }) });
      const payload = await response.json() as { report?: { status: WorkflowStatus | "rejected" }; error?: string };
      if (!response.ok || !payload.report) throw new Error(payload.error || "The review update could not be saved.");
      if (payload.report.status === "rejected") setReports((current) => current.filter((item) => item.id !== report.id));
      else setReports((current) => current.map((item) => item.id === report.id ? { ...item, ...update, status: payload.report!.status, locationSource: update.latitude !== undefined ? "reviewer" : item.locationSource, locationAccuracy: update.latitude !== undefined ? 0 : item.locationAccuracy, updatedAt: new Date().toISOString() } as ReviewReport : item));
      setMessage(`${report.id} moved to ${payload.report.status.replace("_", " ")}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The review update could not be saved."); } finally { setWorkingId(null); }
  }

  function exportCsv() {
    const safe = (value: unknown) => { const text = String(value ?? ""); const protectedText = /^[=+\-@]/.test(text) ? `'${text}` : text; return `"${protectedText.replaceAll('"', '""')}"`; };
    const headers = ["Report ID", "Road", "Damage type", "Severity", "Stage", "Latitude", "Longitude", "Confidence", "Created", "Reviewer note"];
    const rows = visible.map((report) => [report.id, report.street, report.defectType, report.severity, statusLabel[report.status], report.latitude, report.longitude, report.confidence, report.createdAt, report.reviewerNote]);
    const blob = new Blob([[headers, ...rows].map((row) => row.map(safe).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `roadlens-reports-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  return <main className="review-shell">
    <header className="review-topbar"><Link className="brand" href="/"><span className="brand-mark"><Route aria-hidden="true" /></span><span>RoadLens</span><span className="city-label">ADMIN</span></Link>{token && <div className="admin-top-actions"><span><span className="admin-live-dot" /> Operations online</span><button className="review-lock" onClick={() => { setToken(""); setReports([]); setAccessCode(""); setState("locked"); }}>Lock workspace</button></div>}</header>
    {!token ? <section className="review-login"><span className="review-login-icon"><ShieldCheck /></span><h1>Admin workspace</h1><p>Review road evidence, correct locations, prioritize repairs, and track work through completion.</p><form onSubmit={(event) => { event.preventDefault(); if (accessCode.trim()) void loadQueue(accessCode.trim()); }}><label htmlFor="review-code">Admin access code</label><input id="review-code" type="password" autoComplete="current-password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} required /><Button type="submit" disabled={state === "loading"}>{state === "loading" ? "Opening…" : "Open admin panel"}</Button></form>{state === "error" && <div className="review-message error"><CircleAlert /> {message}</div>}</section>
      : <section className="admin-workspace">
        <div className="admin-heading"><div><span className="eyebrow"><LayoutDashboard /> Operations center</span><h1>Road inspection admin</h1><p>{reports.length} reports across the Dushanbe repair workflow</p></div><div className="admin-heading-actions"><Button variant="outline" onClick={exportCsv} disabled={!visible.length}><Download /> Export CSV</Button><Button variant="outline" onClick={() => void loadQueue(token)} disabled={state === "loading"}><RefreshCw className={state === "loading" ? "review-spinner" : ""} /> Refresh</Button></div></div>
        <div className="admin-kpis"><article><span>Needs decision</span><strong>{counts.pending_review}</strong><small>Waiting for evidence review</small></article><article><span>Active work</span><strong>{counts.verified + counts.scheduled + counts.repairing}</strong><small>Confirmed through repairing</small></article><article><span>Urgent</span><strong>{reports.filter((report) => report.status !== "repaired" && ["Critical", "High"].includes(report.severity)).length}</strong><small>Critical and high priority</small></article><article><span>Completed</span><strong>{counts.repaired}</strong><small>Repairs closed</small></article></div>
        <div className="workflow-overview">{workflow.map((item) => <button key={item.status} onClick={() => setFilter(item.status === "pending_review" ? "review" : item.status === "repaired" ? "done" : "work")}><span>{item.label}</span><strong>{counts[item.status]}</strong></button>)}</div>
        {message && <div className="review-message" role="status"><Check /> {message}</div>}
        <section className="admin-console">
          <div className="admin-queue"><div className="admin-queue-title"><div><h2>Report queue</h2><span>{visible.length} shown</span></div><div className="review-tabs"><button className={filter === "review" ? "active" : ""} onClick={() => setFilter("review")}>Review</button><button className={filter === "work" ? "active" : ""} onClick={() => setFilter("work")}>Work</button><button className={filter === "done" ? "active" : ""} onClick={() => setFilter("done")}>Done</button><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button></div></div>
            <div className="admin-filters"><label className="admin-search"><Search /><Input aria-label="Search reports" placeholder="Search road, ID, or damage" value={query} onChange={(event) => setQuery(event.target.value)} /></label><Select value={severity} onValueChange={(value) => setSeverity(value ?? "all")}><SelectTrigger aria-label="Filter by severity"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All priorities</SelectItem><SelectItem value="Critical">Critical</SelectItem><SelectItem value="High">High</SelectItem><SelectItem value="Medium">Medium</SelectItem></SelectContent></Select><Select value={sort} onValueChange={(value) => setSort(value ?? "priority")}><SelectTrigger aria-label="Sort reports"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="priority">Priority first</SelectItem><SelectItem value="newest">Newest first</SelectItem><SelectItem value="oldest">Oldest first</SelectItem></SelectContent></Select></div>
            {!visible.length ? <div className="admin-queue-empty"><ClipboardCheck /><strong>No matching reports</strong><span>Change the filters or refresh the queue.</span></div> : <Table className="admin-table"><TableHeader><TableRow><TableHead>Report</TableHead><TableHead>Priority</TableHead><TableHead>Stage</TableHead><TableHead><span className="sr-only">Open</span></TableHead></TableRow></TableHeader><TableBody>{visible.map((report) => <TableRow key={report.id} data-state={selected?.id === report.id ? "selected" : undefined} onClick={() => setSelectedId(report.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(report.id); }} tabIndex={0} aria-label={`Open ${report.id}, ${report.street}`}><TableCell><strong>{report.street}</strong><span>{report.id} · {reportAge(report.createdAt)}</span></TableCell><TableCell><span className={`admin-severity ${report.severity.toLowerCase()}`}>{report.severity}</span></TableCell><TableCell><span className={`admin-stage ${report.status}`}>{statusLabel[report.status]}</span></TableCell><TableCell><ChevronRight /></TableCell></TableRow>)}</TableBody></Table>}
          </div>
          <div className="admin-inspector">{selected ? <ReportEditor key={selected.id} report={selected} token={token} working={workingId === selected.id} onUpdate={updateReport} /> : <div className="review-empty"><ClipboardCheck /><h2>Select a report</h2><p>Choose a queue item to inspect its evidence and location.</p></div>}</div>
        </section>
      </section>}
  </main>;
}
