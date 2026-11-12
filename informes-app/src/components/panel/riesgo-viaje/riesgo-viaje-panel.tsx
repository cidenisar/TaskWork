"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BarList } from "@/components/estadisticas/bar-list";
import { RiesgoBadge, EstadoViajeBadge } from "@/components/riesgo-viaje/badges";
import { obtenerUrlPdfRiesgoViajeAction, eliminarEvaluacionRiesgoViajeAction } from "@/app/(app)/riesgo-viaje/actions";
import { Icon } from "@/components/icon";
import { CRITERIOS_RIESGO_VIAJE, type CriterioKey } from "@/lib/riesgo-viaje/criterios";
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
  /** Cuándo salió de viaje — null si todavía está "Sin iniciar". Junto con fechaHora, para detectar viajes activos colgados hace demasiado. */
  iniciadoAt: string | null;
  criterios: Record<CriterioKey, number>;
}

/** Más de esto sin pasar a "Finalizado" (desde que salió, o desde que se cargó si nunca salió) y se marca como colgado. */
const UMBRAL_HORAS_COLGADO = 24;

const CRITERIO_KEYS = Object.keys(CRITERIOS_RIESGO_VIAJE) as CriterioKey[];

function fmtFechaCorta(fechaHora: string) {
  const d = new Date(fechaHora);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function horasDesde(fechaIso: string): number {
  return (Date.now() - new Date(fechaIso).getTime()) / 3_600_000;
}

function Fila({
  e,
  busyId,
  onVerPdf,
  onEliminar,
  esSuperusuario,
  horasColgado,
}: {
  e: EvaluacionPanelRow;
  busyId: string | null;
  onVerPdf: (id: string) => void;
  onEliminar: (id: string) => void;
  esSuperusuario: boolean;
  horasColgado?: number;
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
          {horasColgado != null && (
            <div className="hist-meta" style={{ color: "var(--warn)" }}>
              Hace {Math.floor(horasColgado)}hs sin actualizar su estado
            </div>
          )}
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
        {esSuperusuario && (
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            title="Borrar evaluación"
            disabled={busyId === e.id}
            onClick={() => onEliminar(e.id)}
          >
            <Icon name="trash" size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Panel de Riesgo de Viaje — KPIs generales, rankings de dónde se concentra
 * el riesgo (vehículo/conductor/criterio), aviso de viajes colgados, y el
 * detalle separado en "Activos" y "Finalizados".
 */
export function RiesgoViajePanel({
  evaluaciones: evaluacionesIniciales,
  esSuperusuario,
}: {
  evaluaciones: EvaluacionPanelRow[];
  esSuperusuario: boolean;
}) {
  const [evaluaciones, setEvaluaciones] = useState(evaluacionesIniciales);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [finalizadosAbierto, setFinalizadosAbierto] = useState(false);

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

  // Colgado: activo (no finalizado) hace más de UMBRAL_HORAS_COLGADO desde que salió — o desde que se cargó, si nunca llegó a salir.
  const colgados = useMemo(
    () =>
      activos
        .map((e) => ({ e, horas: horasDesde(e.iniciadoAt ?? e.fechaHora) }))
        .filter(({ horas }) => horas >= UMBRAL_HORAS_COLGADO)
        .sort((a, b) => b.horas - a.horas),
    [activos],
  );

  const rankingVehiculos = useMemo(() => {
    const porVehiculo = new Map<string, { alto: number; total: number }>();
    for (const e of evaluaciones) {
      const actual = porVehiculo.get(e.vehiculoPatente) ?? { alto: 0, total: 0 };
      actual.total++;
      if (e.nivelRiesgo === "alto") actual.alto++;
      porVehiculo.set(e.vehiculoPatente, actual);
    }
    return [...porVehiculo.entries()]
      .filter(([, v]) => v.alto > 0)
      .sort((a, b) => b[1].alto - a[1].alto)
      .slice(0, 5)
      .map(([patente, v]) => ({ label: patente, value: v.alto, displayValue: `${v.alto} de ${v.total}` }));
  }, [evaluaciones]);

  const rankingConductores = useMemo(() => {
    const porConductor = new Map<string, { alto: number; total: number }>();
    for (const e of evaluaciones) {
      const actual = porConductor.get(e.conductorNombre) ?? { alto: 0, total: 0 };
      actual.total++;
      if (e.nivelRiesgo === "alto") actual.alto++;
      porConductor.set(e.conductorNombre, actual);
    }
    return [...porConductor.entries()]
      .filter(([, v]) => v.alto > 0)
      .sort((a, b) => b[1].alto - a[1].alto)
      .slice(0, 5)
      .map(([nombre, v]) => ({ label: nombre, value: v.alto, displayValue: `${v.alto} de ${v.total}` }));
  }, [evaluaciones]);

  // Promedio de cuánto aporta cada criterio al total — para ver qué factor empuja más el riesgo en general, no en un viaje puntual.
  const rankingCriterios = useMemo(() => {
    if (evaluaciones.length === 0) return [];
    return CRITERIO_KEYS.map((key) => {
      const promedio = evaluaciones.reduce((acc, e) => acc + e.criterios[key], 0) / evaluaciones.length;
      return { label: CRITERIOS_RIESGO_VIAJE[key].label, value: promedio, displayValue: promedio.toFixed(1) };
    }).sort((a, b) => b.value - a.value);
  }, [evaluaciones]);

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

  async function eliminar(id: string) {
    const e = evaluaciones.find((ev) => ev.id === id);
    if (!window.confirm(`¿Borrar definitivamente la evaluación "${e?.origen ?? ""} → ${e?.destino ?? ""}"? Esto no se puede deshacer.`)) return;
    setBusyId(id);
    setNotice(null);
    const res = await eliminarEvaluacionRiesgoViajeAction(id);
    setBusyId(null);
    if (!res.success) {
      setNotice(res.error || "No se pudo borrar la evaluación.");
      return;
    }
    setEvaluaciones((prev) => prev.filter((ev) => ev.id !== id));
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Evaluación de Riesgo de Viaje</h1>
        <p>Viajes activos y evaluaciones cargadas, con el resultado de cada una</p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Link href="/panel/riesgo-viaje/nueva" className="btn btn-primary btn-sm">
          + Nueva evaluación
        </Link>
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

      {colgados.length > 0 && (
        <div className="card" style={{ borderColor: "var(--warn)" }}>
          <div className="section-label" style={{ color: "var(--warn)" }}>
            <Icon name="warning" size={14} /> {colgados.length} viaje(s) activo(s) hace más de {UMBRAL_HORAS_COLGADO}hs sin actualizar
          </div>
          <div className="hint" style={{ margin: "-4px 0 10px" }}>
            Pueden ser viajes que ya llegaron pero se olvidaron de marcar &quot;Finalizar&quot;, o algo que haya pasado en el camino — vale
            la pena confirmar con el conductor.
          </div>
          <div className="list-grid">
            {colgados.map(({ e, horas }) => (
              <Fila key={e.id} e={e} busyId={busyId} onVerPdf={verPdf} onEliminar={eliminar} esSuperusuario={esSuperusuario} horasColgado={horas} />
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-label">Viajes activos ({activos.length})</div>
        {activos.length === 0 ? (
          <div className="empty-note">No hay viajes en curso ahora mismo.</div>
        ) : (
          <div className="list-grid">
            {activos.map((e) => (
              <Fila key={e.id} e={e} busyId={busyId} onVerPdf={verPdf} onEliminar={eliminar} esSuperusuario={esSuperusuario} />
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <button
          type="button"
          onClick={() => setFinalizadosAbierto((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            background: "none",
            border: "none",
            padding: 0,
            marginBottom: finalizadosAbierto ? 14 : 0,
            cursor: "pointer",
            color: "inherit",
          }}
        >
          <span className="section-label" style={{ margin: 0 }}>
            Viajes finalizados ({finalizados.length})
          </span>
          <Icon
            name="chevron-right"
            size={14}
            style={{ transform: finalizadosAbierto ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }}
          />
        </button>
        {finalizadosAbierto &&
          (finalizados.length === 0 ? (
            <div className="empty-note">Todavía no hay viajes finalizados.</div>
          ) : (
            <div className="list-grid">
              {finalizados.map((e) => (
                <Fila key={e.id} e={e} busyId={busyId} onVerPdf={verPdf} onEliminar={eliminar} esSuperusuario={esSuperusuario} />
              ))}
            </div>
          ))}
      </div>

      {(rankingVehiculos.length > 0 || rankingConductores.length > 0 || rankingCriterios.length > 0) && (
        <div className="card">
          <div className="section-label">Dónde se concentra el riesgo</div>
          <div className="grid2">
            <div>
              <div className="hint" style={{ marginBottom: 6 }}>
                Vehículos con más viajes de riesgo alto
              </div>
              {rankingVehiculos.length === 0 ? <div className="empty-note">Sin viajes de riesgo alto todavía.</div> : <BarList items={rankingVehiculos} />}
            </div>
            <div>
              <div className="hint" style={{ marginBottom: 6 }}>
                Conductores con más viajes de riesgo alto
              </div>
              {rankingConductores.length === 0 ? (
                <div className="empty-note">Sin viajes de riesgo alto todavía.</div>
              ) : (
                <BarList items={rankingConductores} />
              )}
            </div>
          </div>
          <div className="hint" style={{ margin: "14px 0 6px" }}>
            Qué criterio empuja más el puntaje, en promedio de todos los viajes
          </div>
          <BarList items={rankingCriterios} />
        </div>
      )}
    </div>
  );
}
