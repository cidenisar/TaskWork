"use client";

import dynamic from "next/dynamic";
import type { HeatmapPoint } from "@/lib/estadisticas/aggregates";
import { Icon } from "@/components/icon";

const HeatmapInner = dynamic(() => import("./heatmap-inner"), {
  ssr: false,
  loading: () => <div className="hint">Cargando mapa...</div>,
});

export function HeatmapCard({ points }: { points: HeatmapPoint[] }) {
  return (
    <div className="card">
      <div className="section-label">
        <Icon name="map" size={15} /> Mapa de calor de intervenciones
      </div>
      <div className="hint" style={{ margin: "-4px 0 12px" }}>
        Usa la geolocalización guardada en cada foto (spec sección 6.3) para mostrar dónde se concentran los
        trabajos.
      </div>
      {points.length === 0 ? (
        <div className="empty-note">Todavía no hay fotos con ubicación registrada.</div>
      ) : (
        <HeatmapInner points={points} />
      )}
    </div>
  );
}
