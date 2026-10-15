"use client";

import dynamic from "next/dynamic";
import type { PuntoMapaRelevamiento } from "./mapa-relevamientos-inner";

const MapaRelevamientosInner = dynamic(() => import("./mapa-relevamientos-inner"), {
  ssr: false,
  loading: () => <div className="hint">Cargando mapa...</div>,
});

export function MapaRelevamientosCard({ puntos, totalSitios }: { puntos: PuntoMapaRelevamiento[]; totalSitios: number }) {
  const sitiosConGps = new Set(puntos.map((p) => p.ubicacionId)).size;
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="panel-card-title">
        <h2>Mapa de relevamientos</h2>
        <span className="panel-card-count">
          {sitiosConGps} de {totalSitios} sitio{totalSitios === 1 ? "" : "s"} con GPS cargado · {puntos.length} unidad
          {puntos.length === 1 ? "" : "es"} en el mapa
        </span>
      </div>
      {puntos.length === 0 ? (
        <div className="empty-note">Ningún sitio con equipamiento tiene coordenadas GPS cargadas todavía.</div>
      ) : (
        <MapaRelevamientosInner puntos={puntos} />
      )}
    </div>
  );
}
