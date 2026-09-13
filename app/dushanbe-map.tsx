"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as L from "leaflet";

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

const DUSHANBE_CENTER: L.LatLngExpression = [38.5737, 68.7738];
const DUSHANBE_BOUNDS = L.latLngBounds([38.39, 68.53], [38.78, 69.04]);

export function DushanbeMap({ issues, selectedId, mode, onSelect }: DushanbeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const reportLayersRef = useRef<L.Layer[]>([]);
  const locationLayersRef = useRef<L.Layer[]>([]);
  const [ready, setReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

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
    reportLayersRef.current = issues.map((issue, index) => {
      const markerIcon = L.divIcon({
        className: "report-marker-shell",
        html: `<span class="real-map-marker ${issue.severity.toLowerCase()} ${selectedId === issue.id ? "selected" : ""}"><b>${index + 1}</b></span>`,
        iconSize: [42, 42],
        iconAnchor: [21, 42],
      });
      return L.marker([issue.coordinates.latitude, issue.coordinates.longitude], { icon: markerIcon, keyboard: true, title: `${issue.severity} report on ${issue.street}` })
        .on("click", () => onSelect(issue.id))
        .addTo(map);
    });
    if (mode === "route" && issues.length > 1) {
      reportLayersRef.current.push(L.polyline(issues.map((issue) => [issue.coordinates.latitude, issue.coordinates.longitude]), { color: "#79a83b", weight: 5, opacity: 0.9, dashArray: "9 9" }).addTo(map));
    }
  }, [issues, mode, onSelect, ready, selectedId]);

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
  </div>;
}
