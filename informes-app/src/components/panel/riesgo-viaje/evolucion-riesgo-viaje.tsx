"use client";

import { useMemo, useState } from "react";
import { BarList } from "@/components/estadisticas/bar-list";
import { RiesgoBadge, EstadoViajeBadge } from "@/components/riesgo-viaje/badges";
import type { EstadoViaje, NivelRiesgoViaje } from "@/lib/database.types";

export interface EvaluacionEvolucionRow {
  id: string;
  vehiculoPatente: string;
  conductorNombre: string;
  fechaHora: string;
  origen: string;
  destino: string;
  total: number;
  nivelRiesgo: NivelRiesgoViaje;
  estadoViaje: EstadoViaje;
}

function fmtFechaCorta(fechaHora: string) {
  const d = new Date(fechaHora);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

/**
 * "Evolución" del riesgo de viaje en el tiempo — mismo criterio visual que
 * Estadísticas (BarList, sin librería de gráficos): se filtra por vehículo o
 * conductor para ver si una ruta/combo específico viene empeorando, en vez
 * de solo mirar el total general.
 */
export function EvolucionRiesgoViaje({ evaluaciones }: { evaluaciones: EvaluacionEvolucionRow[] }) {
  const [vehiculoFiltro, setVehiculoFiltro] = useState("");
  const [conductorFiltro, setConductorFiltro] = useState("");

  const vehiculos = useMemo(() => [...new Set(evaluaciones.map((e) => e.vehiculoPatente))].sort(), [evaluaciones]);
  const conductores = useMemo(() => [...new Set(evaluaciones.map((e) => e.conductorNombre))].sort(), [evaluaciones]);

  const filtradas = useMemo(
    () =>
      evaluaciones.filter(
        (e) => (!vehiculoFiltro || e.vehiculoPatente === vehiculoFiltro) && (!conductorFiltro || e.conductorNombre === conductorFiltro),
      ),
    [evaluaciones, vehiculoFiltro, conductorFiltro],
  );

  const kpis = useMemo(() => {
    const total = filtradas.length;
    const promedio = total > 0 ? Math.round(filtradas.reduce((acc, e) => acc + e.total, 0) / total) : 0;
    const porNivel = { bajo: 0, medio: 0, alto: 0 };
    for (const e of filtradas) porNivel[e.nivelRiesgo]++;
    return { total, promedio, ...porNivel };
  }, [filtradas]);

  // Más recientes primero en la lista de abajo, pero más viejos primero en el gráfico — una evolución se lee de izquierda a derecha.
  const barItems = useMemo(
    () =>
      filtradas.map((e) => ({
        label: `${fmtFechaCorta(e.fechaHora)} ${e.origen}→${e.destino}`,
        value: e.total,
        displayValue: String(e.total),
      })),
    [filtradas],
  );

  return (
    <div>
      <div className="page-heading">
        <h1>Evaluación de Riesgo de Viaje</h1>
        <p>Cómo viene el riesgo de los viajes en el tiempo — filtrá por vehículo o conductor para ver una ruta puntual</p>
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
          <div className="kpi-value" style={{ color: "var(--accent-2)" }}>
            {kpis.alto}
          </div>
          <div className="kpi-label">Riesgo alto</div>
        </div>
      </div>

      <div className="card">
        <div className="section-label">Filtros</div>
        <div className="grid2">
          <div className="field">
            <label>Vehículo</label>
            <select value={vehiculoFiltro} onChange={(e) => setVehiculoFiltro(e.target.value)}>
              <option value="">Todos</option>
              {vehiculos.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Conductor</label>
            <select value={conductorFiltro} onChange={(e) => setConductorFiltro(e.target.value)}>
              <option value="">Todos</option>
              {conductores.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="section-label">Evolución del puntaje</div>
        <BarList items={barItems} />
      </div>

      <div className="card">
        <div className="section-label">Detalle</div>
        {filtradas.length === 0 ? (
          <div className="empty-note">No hay evaluaciones con estos filtros.</div>
        ) : (
          <div className="list-grid">
            {[...filtradas]
              .reverse()
              .map((e) => (
                <div className="hist-item" key={e.id}>
                  <div className="info">
                    <div className="hist-main">
                      <div className="hist-title">
                        {e.origen} → {e.destino}
                      </div>
                      <div className="hist-meta">
                        {e.vehiculoPatente} · {e.conductorNombre} · {fmtFechaCorta(e.fechaHora)}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                        <RiesgoBadge nivel={e.nivelRiesgo} total={e.total} />
                        <EstadoViajeBadge estado={e.estadoViaje} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
