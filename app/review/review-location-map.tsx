"use client";

import { useEffect, useRef } from "react";
import * as L from "leaflet";

type Props = {
  latitude: number;
  longitude: number;
  onChange: (latitude: number, longitude: number) => void;
};

export function ReviewLocationMap({ latitude, longitude, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const initialPositionRef = useRef({ latitude, longitude });

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initial = initialPositionRef.current;
    const map = L.map(containerRef.current, { center: [initial.latitude, initial.longitude], zoom: 16, zoomControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const marker = L.marker([initial.latitude, initial.longitude], {
      draggable: true,
      icon: L.divIcon({ className: "review-pin-shell", html: '<span class="review-pin"></span>', iconSize: [30, 38], iconAnchor: [15, 38] }),
    }).addTo(map);
    marker.on("dragend", () => {
      const point = marker.getLatLng();
      onChangeRef.current(point.lat, point.lng);
    });
    map.on("click", (event: L.LeafletMouseEvent) => {
      marker.setLatLng(event.latlng);
      onChangeRef.current(event.latlng.lat, event.latlng.lng);
    });
    mapRef.current = map;
    markerRef.current = marker;
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, []); // The report card owns one stable map instance.

  useEffect(() => {
    markerRef.current?.setLatLng([latitude, longitude]);
  }, [latitude, longitude]);

  return <div className="review-location-map" ref={containerRef} aria-label="Correct report location. Click the map or drag the marker." />;
}
