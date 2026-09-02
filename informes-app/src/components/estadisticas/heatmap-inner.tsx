"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import type { HeatmapPoint } from "@/lib/estadisticas/aggregates";

export default function HeatmapInner({ points }: { points: HeatmapPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: [number, number] = points.length
      ? [points.reduce((s, p) => s + p.lat, 0) / points.length, points.reduce((s, p) => s + p.lon, 0) / points.length]
      : [-34.6, -58.4]; // fallback: Buenos Aires

    const map = L.map(containerRef.current, {
      center,
      zoom: points.length ? 10 : 4,
      scrollWheelZoom: false,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    if (points.length > 0) {
      const heat = L.heatLayer(
        points.map((p) => [p.lat, p.lon, 1]),
        { radius: 28, blur: 22, maxZoom: 17 },
      );
      heat.addTo(map);

      if (points.length > 1) {
        map.fitBounds(
          L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number])),
          { padding: [24, 24] },
        );
      }
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- el mapa se crea una sola vez; los puntos no cambian en esta vista
  }, []);

  return <div ref={containerRef} style={{ height: 320, borderRadius: "var(--radius)", overflow: "hidden" }} />;
}
