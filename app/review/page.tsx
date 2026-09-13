"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Check, CircleAlert, ClipboardCheck, LoaderCircle, MapPin, Route, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type ReviewReport = {
  id: string;
  street: string;
  detail: string;
  severity: "Critical" | "High" | "Medium";
  confidence: number | null;
  confirmations: number;
  latitude: number;
  longitude: number;
  status: string;
  createdAt: string;
  hasImage: number;
};

function ReviewImage({ id, token }: { id: string; token: string }) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    fetch(`/api/review/image?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.ok ? response.blob() : Promise.reject())
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, token]);
  if (failed) return <div className="review-image-fallback"><CircleAlert /> Image unavailable</div>;
  if (!source) return <div className="review-image-fallback"><LoaderCircle className="review-spinner" /> Loading evidence…</div>;
  return <Image className="review-image" src={source} alt={`Road evidence for report ${id}`} width={960} height={640} unoptimized />;
}

export default function ReviewPage() {
  const [accessCode, setAccessCode] = useState("");
  const [token, setToken] = useState("");
  const [reports, setReports] = useState<ReviewReport[]>([]);
  const [state, setState] = useState<"locked" | "loading" | "ready" | "error">("locked");
  const [message, setMessage] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(null);

  const loadQueue = useCallback(async (reviewerToken: string) => {
    setState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/review", { headers: { Authorization: `Bearer ${reviewerToken}` } });
      const payload = await response.json() as { reports?: ReviewReport[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to open the review queue.");
      setReports(payload.reports ?? []);
      setToken(reviewerToken);
      setState("ready");
    } catch (error) {
      setToken("");
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to open the review queue.");
    }
  }, []);

  async function decide(id: string, decision: "verify" | "reject") {
    setWorkingId(id);
    setMessage("");
    try {
      const response = await fetch("/api/review", { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id, decision }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "The review decision could not be saved.");
      setReports((current) => current.filter((report) => report.id !== id));
      setMessage(decision === "verify" ? `${id} was verified.` : `${id} was rejected.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The review decision could not be saved.");
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <main className="review-shell">
      <header className="review-topbar">
        <Link className="brand" href="/"><span className="brand-mark"><Route aria-hidden="true" /></span><span>RoadLens</span><span className="city-label">REVIEW</span></Link>
        {token && <button className="review-lock" onClick={() => { setToken(""); setReports([]); setAccessCode(""); setState("locked"); }}>Lock queue</button>}
      </header>
      {!token ? (
        <section className="review-login">
          <span className="review-login-icon"><ClipboardCheck /></span>
          <h1>Human review queue</h1>
          <p>Enter the reviewer access code to inspect submitted road evidence and record a decision.</p>
          <form onSubmit={(event) => { event.preventDefault(); if (accessCode.trim()) void loadQueue(accessCode.trim()); }}>
            <label htmlFor="review-code">Reviewer access code</label>
            <input id="review-code" type="password" autoComplete="current-password" value={accessCode} onChange={(event) => setAccessCode(event.target.value)} required />
            <Button type="submit" disabled={state === "loading"}>{state === "loading" ? "Opening…" : "Open review queue"}</Button>
          </form>
          {state === "error" && <div className="review-message error"><CircleAlert /> {message}</div>}
        </section>
      ) : (
        <section className="review-workspace">
          <div className="review-heading"><div><span className="eyebrow"><ClipboardCheck /> Human verification</span><h1>Pending reports</h1><p>{reports.length} {reports.length === 1 ? "report" : "reports"} awaiting a decision</p></div><Button variant="outline" onClick={() => void loadQueue(token)}>Refresh</Button></div>
          {message && <div className="review-message"><Check /> {message}</div>}
          {!reports.length ? <div className="review-empty"><ClipboardCheck /><h2>Queue cleared</h2><p>There are no road reports waiting for review.</p></div> : <div className="review-grid">{reports.map((report) => (
            <article className="review-card" key={report.id}>
              {report.hasImage ? <ReviewImage id={report.id} token={token} /> : <div className="review-image-fallback"><CircleAlert /> No evidence image</div>}
              <div className="review-card-body">
                <div className="review-card-meta"><span className={`severity-badge ${report.severity.toLowerCase()}`}>{report.severity}</span><span>{report.id}</span><span>{new Date(report.createdAt).toLocaleString()}</span></div>
                <h2>{report.street}</h2><p>{report.detail}</p>
                <div className="review-location"><MapPin /><span>{report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}</span>{report.confidence !== null && <strong>{report.confidence}% model confidence</strong>}</div>
                <div className="review-actions"><Button disabled={workingId === report.id} onClick={() => void decide(report.id, "verify")}><Check /> Verify damage</Button><Button variant="outline" disabled={workingId === report.id} onClick={() => void decide(report.id, "reject")}><X /> Reject report</Button></div>
              </div>
            </article>
          ))}</div>}
        </section>
      )}
    </main>
  );
}
