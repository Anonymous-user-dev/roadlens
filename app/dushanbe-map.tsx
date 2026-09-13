"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as L from "leaflet";

type MapIssue = {
  id: string;
  street: string;
  severity: "Critical" | "High" | "Medium";
  status: "pending_review" | "verified" | "scheduled" | "repairing" | "repaired";
  coordinates: { latitude: number; longitude: number };
};

type DushanbeMapProps = {
  issues: MapIssue[];
  selectedId: string | null;
  mode: "live" | "route" | "heatmap";
  viewCommand: { kind: "city" | "priority" | "route" | "heatmap"; sequence: number };
  onSelect: (id: string) => void;
};

const DUSHANBE_CENTER: L.LatLngExpression = [38.5737, 68.7738];
const DUSHANBE_BOUNDS = L.latLngBounds([38.39, 68.53], [38.78, 69.04]);

export function DushanbeMap({ issues, selectedId, mode, viewCommand, onSelect }: DushanbeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const reportLayersRef = useRef<L.Layer[]>([]);
  const routeLayersRef = useRef<L.Layer[]>([]);
  const locationLayersRef = useRef<L.Layer[]>([]);
  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [routeStatus, setRouteStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: DUSHANBE_CENTER,
      zoom: 12,
      minZoom: 9,
      maxZoom: 19,
      maxBounds: DUSHANBE_BOUNDS,
      maxBoundsViscosity: 0.8,
      zoomControl: false,
    });
    L.control.zoom({ position: "topright" }).addTo(map);
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    tiles.on("load", () => {
      if (containerRef.current) containerRef.current.dataset.tilesLoaded = "true";
      setMapError(null);
      setReady(true);
    });
    tiles.on("tileerror", () => setMapError("Some map tiles could not load. Check your connection and retry."));
    map.on("locationfound", (event: L.LocationEvent) => {
      locationLayersRef.current.forEach((layer) => layer.remove());
      locationLayersRef.current = [
        L.circle(event.latlng, { radius: event.accuracy, color: "#75aef7", weight: 1, fillColor: "#75aef7", fillOpacity: 0.12 }).addTo(map),
        L.circleMarker(event.latlng, { radius: 7, color: "#ffffff", weight: 3, fillColor: "#277cf4", fillOpacity: 1 }).addTo(map),
      ];
      setLocating(false);
    });
    map.on("locationerror", () => {
      setLocating(false);
      setMapError("Location is unavailable. Allow location for this website, then try again.");
    });
    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => {
      reportLayersRef.current.forEach((layer) => layer.remove());
      routeLayersRef.current.forEach((layer) => layer.remove());
      locationLayersRef.current.forEach((layer) => layer.remove());
      reportLayersRef.current = [];
      locationLayersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    reportLayersRef.current.forEach((layer) => layer.remove());
    if (mode === "heatmap") {
      const clusters = new Map<string, { latitude: number; longitude: number; count: number; weight: number }>();
      issues.forEach((issue) => {
        const key = `${Math.round(issue.coordinates.latitude / 0.006)}:${Math.round(issue.coordinates.longitude / 0.008)}`;
        const current = clusters.get(key) ?? { latitude: 0, longitude: 0, count: 0, weight: 0 };
        current.latitude += issue.coordinates.latitude; current.longitude += issue.coordinates.longitude; current.count += 1;
        current.weight += issue.severity === "Critical" ? 3 : issue.severity === "High" ? 2 : 1; clusters.set(key, current);
      });
      reportLayersRef.current = [...clusters.values()].flatMap((cluster) => {
        const center: L.LatLngExpression = [cluster.latitude / cluster.count, cluster.longitude / cluster.count];
        const circle = L.circle(center, { radius: 220 + cluster.weight * 75, stroke: false, fillColor: cluster.weight >= 4 ? "#ff6554" : cluster.weight >= 2 ? "#ffb24d" : "#e8d85e", fillOpacity: 0.3 }).addTo(map);
        const marker = L.marker(center, { icon: L.divIcon({ className: "hotspot-marker-shell", html: `<span class="hotspot-marker"><b>${cluster.count}</b><small>${cluster.count === 1 ? "report" : "reports"}</small></span>`, iconSize: [64, 42], iconAnchor: [32, 21] }) }).addTo(map);
        return [circle, marker];
      });
      return;
    }
    reportLayersRef.current = issues.map((issue, index) => {
      const markerIcon = L.divIcon({
        className: "report-marker-shell",
        html: `<span class="real-map-marker ${issue.severity.toLowerCase()} status-${issue.status} ${selectedId === issue.id ? "selected" : ""}"><b>${index + 1}</b></span>`,
        iconSize: [42, 42],
        iconAnchor: [21, 42],
      });
      return L.marker([issue.coordinates.latitude, issue.coordinates.longitude], { icon: markerIcon, keyboard: true, title: `${issue.severity} ${issue.status.replace("_", " ")} report on ${issue.street}` })
        .on("click", () => onSelect(issue.id))
        .addTo(map);
    });
  }, [issues, mode, onSelect, ready, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    routeLayersRef.current.forEach((layer) => layer.remove()); routeLayersRef.current = [];
    if (!map || !ready || mode !== "route" || !issues.length) return;
    if (issues.length === 1) {
      routeLayersRef.current = [L.circle([issues[0].coordinates.latitude, issues[0].coordinates.longitude], { radius: 180, color: "#4d9df7", weight: 3, fillColor: "#4d9df7", fillOpacity: 0.12 }).addTo(map)];
      return;
    }
    const controller = new AbortController();
    fetch("/api/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coordinates: issues.map((issue) => issue.coordinates) }), signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error(); return await response.json() as { coordinates: L.LatLngTuple[]; distanceMeters: number; durationSeconds: number }; })
      .then((route) => {
        if (controller.signal.aborted) return;
        routeLayersRef.current = [L.polyline(route.coordinates, { color: "#4d9df7", weight: 6, opacity: 0.92 }).addTo(map)];
        setRouteStatus(`${(route.distanceMeters / 1000).toFixed(1)} km · about ${Math.max(1, Math.round(route.durationSeconds / 60))} min`);
      })
      .catch(() => { if (!controller.signal.aborted) { routeLayersRef.current = [L.polyline(issues.map((issue) => [issue.coordinates.latitude, issue.coordinates.longitude]), { color: "#4d9df7", weight: 4, opacity: 0.8, dashArray: "8 8" }).addTo(map)]; setRouteStatus("Road routing unavailable · showing direct order"); } });
    return () => controller.abort();
  }, [issues, mode, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.stop();
    if (containerRef.current) {
      containerRef.current.dataset.view = viewCommand.kind;
      containerRef.current.dataset.viewSequence = String(viewCommand.sequence);
    }
    if (viewCommand.kind === "city") {
      map.flyTo(DUSHANBE_CENTER, 12, { duration: 0.65 });
      return;
    }
    if (viewCommand.kind === "heatmap") { map.flyTo(DUSHANBE_CENTER, 12, { duration: 0.65 }); return; }
    if (viewCommand.kind === "priority") {
      const target = issues.find((issue) => issue.id === selectedId) ?? issues[0];
      if (target) map.flyTo([target.coordinates.latitude, target.coordinates.longitude], 16, { duration: 0.65 });
      return;
    }
    if (issues.length > 1) {
      map.flyToBounds(L.latLngBounds(issues.map((issue) => [issue.coordinates.latitude, issue.coordinates.longitude])), { padding: [65, 65], maxZoom: 15, duration: 0.65 });
    } else if (issues.length === 1) {
      map.flyTo([issues[0].coordinates.latitude, issues[0].coordinates.longitude], 15, { duration: 0.65 });
    }
  }, [issues, ready, selectedId, viewCommand]);

  const locateUser = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setLocating(true);
    setMapError(null);
    map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true, timeout: 20_000, maximumAge: 300_000 });
  }, []);

  return <div className="real-map-shell">
    <div className="real-map" ref={containerRef} />
    <button type="button" className={`leaflet-location-control ${locating ? "locating" : ""}`} onClick={locateUser} aria-label="Find my location" title="Find my location">◎</button>
    {mapError && <div className="map-load-error">{mapError}</div>}
    {mode === "route" && issues.length > 0 && <div className="route-engine-status">{issues.length === 1 ? "One inspection stop" : routeStatus || "Calculating road route…"}</div>}
  </div>;
}
