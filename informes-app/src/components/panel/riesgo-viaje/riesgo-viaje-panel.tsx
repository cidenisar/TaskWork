"use client";

import { useMemo, useState } from "react";
import { RiesgoBadge, EstadoViajeBadge } from "@/components/riesgo-viaje/badges";
import { obtenerUrlPdfRiesgoViajeAction } from "@/app/(app)/riesgo-viaje/actions";
import { Icon } from "@/components/icon";
import type { EstadoViaje, NivelRiesgoViaje } from "@/lib/database.types";

export interface EvaluacionPanelRow {
  id: string;
  vehiculoPatente: string;
  conductorNombre: string;
  fechaHora: string;
  origen: string;
  destino: string;
  total: number;
  nivelRiesgo: NivelRiesgoViaje;
  estadoViaje: EstadoViaje;
  pdfDisponible: boolean;
  climaDescripcion: string | null;
}

function fmtFechaCorta(fechaHora: string) {
  const d = new Date(fechaHora);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function Fila({
  e,
  busyId,
  onVerPdf,
}: {
  e: EvaluacionPanelRow;
  busyId: string | null;
  onVerPdf: (id: string) => void;
}) {
  return (
    <div className="hist-item">
      <div className="info">
        <div className="hist-main">
          <div className="hist-title">
            {e.origen} → {e.destino}
          </div>
          <div className="hist-meta">
            {e.vehiculoPatente} · {e.conductorNombre} · {fmtFechaCorta(e.fechaHora)}
          </div>
          {e.climaDescripcion && <div className="hist-meta">Pronóstico usado: {e.climaDescripcion}</div>}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
            <RiesgoBadge nivel={e.nivelRiesgo} total={e.total} />
            <EstadoViajeBadge estado={e.estadoViaje} />
          </div>
        </div>
      </div>
      <div className="hist-actions">
        <button
          type="button"
          className="icon-btn"
          title={e.pdfDisponible ? "Ver PDF" : "Sin PDF disponible"}
          disabled={!e.pdfDisponible || busyId === e.id}
          onClick={() => onVerPdf(e.id)}
        >
          {busyId === e.id ? "…" : <Icon name="eye" size={15} />}
        </button>
      </div>
    </div>
  );
}

/**
 * Panel de Riesgo de Viaje — KPIs generales + el detalle separado en
 * "Activos" (todavía no llegaron) y "Finalizados" (ya terminaron), para que
 * un viaje en curso no se pierda mezclado entre decenas de viajes viejos.
 */
export function RiesgoViajePanel({ evaluaciones }: { evaluaciones: EvaluacionPanelRow[] }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const kpis = useMemo(() => {
    const total = evaluaciones.length;
    const promedio = total > 0 ? Math.round(evaluaciones.reduce((acc, e) => acc + e.total, 0) / total) : 0;
    const porNivel = { bajo: 0, medio: 0, alto: 0 };
    for (const e of evaluaciones) porNivel[e.nivelRiesgo]++;
    return { total, promedio, ...porNivel };
  }, [evaluaciones]);

  const activos = useMemo(
    () => evaluaciones.filter((e) => e.estadoViaje !== "finalizado").sort((a, b) => b.fechaHora.localeCompare(a.fechaHora)),
    [evaluaciones],
  );
  const finalizados = useMemo(
    () => evaluaciones.filter((e) => e.estadoViaje === "finalizado").sort((a, b) => b.fechaHora.localeCompare(a.fechaHora)),
    [evaluaciones],
  );

  async function verPdf(id: string) {
    setBusyId(id);
    setNotice(null);
    const res = await obtenerUrlPdfRiesgoViajeAction(id);
    setBusyId(null);
    if (!res.url) {
      setNotice(res.error || "No se pudo abrir el PDF.");
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Evaluación de Riesgo de Viaje</h1>
        <p>Viajes activos y evaluaciones cargadas, con el resultado de cada una</p>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-value">{kpis.total}</div>
          <div className="kpi-label">Viajes evaluados</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{kpis.promedio}</div>
          <div className="kpi-label">Puntaje promedio</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: "var(--ok)" }}>
            {kpis.bajo}
          </div>
          <div className="kpi-label">Riesgo bajo</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: "var(--warn)" }}>
            {kpis.medio}
          </div>
          <div className="kpi-label">Riesgo medio</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value" style={{ color: "var(--accent-2)" }}>
            {kpis.alto}
          </div>
          <div className="kpi-label">Riesgo alto</div>
        </div>
      </div>

      {notice && (
        <div className="hint" style={{ color: "var(--warn)" }}>
          {notice}
        </div>
      )}

      <div className="card">
        <div className="section-label">Viajes activos ({activos.length})</div>
        {activos.length === 0 ? (
          <div className="empty-note">No hay viajes en curso ahora mismo.</div>
        ) : (
          <div className="list-grid">
            {activos.map((e) => (
              <Fila key={e.id} e={e} busyId={busyId} onVerPdf={verPdf} />
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-label">Viajes finalizados ({finalizados.length})</div>
        {finalizados.length === 0 ? (
          <div className="empty-note">Todavía no hay viajes finalizados.</div>
        ) : (
          <div className="list-grid">
            {finalizados.map((e) => (
              <Fila key={e.id} e={e} busyId={busyId} onVerPdf={verPdf} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
