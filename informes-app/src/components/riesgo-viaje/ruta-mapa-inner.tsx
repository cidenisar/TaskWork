"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface RutaMapaProps {
  origen: { lat: number; lon: number };
  destino: { lat: number; lon: number };
  /** Puntos [lat, lon] de la geometría real de la ruta — si viene vacío, se traza una línea recta entre origen y destino. */
  geometria: [number, number][];
}

export default function RutaMapaInner({ origen, destino, geometria }: RutaMapaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { scrollWheelZoom: false });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const puntos = geometria.length > 0 ? geometria : ([[origen.lat, origen.lon], [destino.lat, destino.lon]] as [number, number][]);
    L.polyline(puntos, { color: "#0a66c2", weight: 4 }).addTo(map);
    L.marker([origen.lat, origen.lon]).addTo(map).bindTooltip("Origen", { permanent: false });
    L.marker([destino.lat, destino.lon]).addTo(map).bindTooltip("Destino", { permanent: false });
    map.fitBounds(L.latLngBounds(puntos), { padding: [24, 24] });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- el mapa se crea una sola vez con los datos que llegaron en el primer render
  }, []);

  return <div ref={containerRef} style={{ height: 260, borderRadius: "var(--radius)", overflow: "hidden" }} />;
}
