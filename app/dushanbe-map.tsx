"use client";

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Feature, LineString } from "geojson";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

type MapIssue = {
  id: string;
  street: string;
  severity: "Critical" | "High" | "Medium";
  coordinates: { latitude: number; longitude: number };
};

type DushanbeMapProps = {
  issues: MapIssue[];
  selectedId: string | null;
  mode: "live" | "route";
  onSelect: (id: string) => void;
};

const DUSHANBE_CENTER: [number, number] = [68.7738, 38.5737];

maplibregl.setWorkerUrl(workerUrl);

export function DushanbeMap({ issues, selectedId, mode, onSelect }: DushanbeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRefs = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: DUSHANBE_CENTER,
      zoom: 11.6,
      minZoom: 9,
      maxZoom: 19,
      maxBounds: [[68.53, 38.39], [69.04, 38.78]],
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true, timeout: 20_000, maximumAge: 300_000 },
      trackUserLocation: true,
      fitBoundsOptions: { maxZoom: 16 },
    }), "top-right");
    const loadTimer = window.setTimeout(() => { if (!map.loaded()) setFailed(true); }, 15_000);
    map.on("load", () => { window.clearTimeout(loadTimer); setFailed(false); setReady(true); });
    map.on("idle", () => {
      if (containerRef.current) containerRef.current.dataset.renderedFeatures = String(map.queryRenderedFeatures().length);
    });
    mapRef.current = map;
    return () => {
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current = [];
      window.clearTimeout(loadTimer);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    markerRefs.current.forEach((marker) => marker.remove());
    markerRefs.current = issues.map((issue, index) => {
      const markerElement = document.createElement("button");
      markerElement.type = "button";
      markerElement.className = `real-map-marker ${issue.severity.toLowerCase()} ${selectedId === issue.id ? "selected" : ""}`;
      const markerLabel = document.createElement("span");
      markerLabel.textContent = String(index + 1);
      markerElement.appendChild(markerLabel);
      markerElement.setAttribute("aria-label", `${issue.severity} report on ${issue.street}`);
      markerElement.addEventListener("click", () => onSelect(issue.id));
      return new maplibregl.Marker({ element: markerElement, anchor: "bottom" })
        .setLngLat([issue.coordinates.longitude, issue.coordinates.latitude])
        .addTo(map);
    });

    const routeCoordinates = issues.length > 1
      ? issues.map((issue) => [issue.coordinates.longitude, issue.coordinates.latitude])
      : [DUSHANBE_CENTER, DUSHANBE_CENTER];
    const routeData: Feature<LineString> = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: routeCoordinates },
    };
    const existingSource = map.getSource("inspection-route") as maplibregl.GeoJSONSource | undefined;
    if (existingSource) existingSource.setData(routeData);
    else {
      map.addSource("inspection-route", { type: "geojson", data: routeData });
      map.addLayer({ id: "inspection-route", type: "line", source: "inspection-route", paint: { "line-color": "#b7f451", "line-width": 4, "line-opacity": 0.85, "line-dasharray": [2, 2] } });
    }
    map.setLayoutProperty("inspection-route", "visibility", mode === "route" && issues.length > 1 ? "visible" : "none");
  }, [issues, mode, onSelect, ready, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    const selected = issues.find((issue) => issue.id === selectedId);
    if (!map || !ready || !selected) return;
    map.easeTo({ center: [selected.coordinates.longitude, selected.coordinates.latitude], zoom: Math.max(map.getZoom(), 14), duration: 650 });
  }, [issues, ready, selectedId]);

  return <div className="real-map" ref={containerRef}>{failed && <div className="map-load-error">Street map unavailable. Check your connection and reload.</div>}</div>;
}
