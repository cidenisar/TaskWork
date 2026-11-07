"use client";

import { useMemo, useState } from "react";
import { obtenerUrlPdfRiesgoViajeAction, actualizarEstadoViajeAction } from "@/app/(app)/riesgo-viaje/actions";
import { Icon } from "@/components/icon";
import { RiesgoBadge, EstadoViajeBadge } from "./badges";
import type { EstadoViaje, NivelRiesgoViaje } from "@/lib/database.types";

export interface EvaluacionRiesgoViajeRow {
  id: string;
  numeroGeneracion: string;
  vehiculoPatente: string;
  conductorNombre: string;
  fechaHora: string;
  origen: string;
  destino: string;
  tienePuntoMedio: boolean;
  total: number;
  nivelRiesgo: NivelRiesgoViaje;
  mensajeRiesgo: string;
  estadoViaje: EstadoViaje;
  pdfDisponible: boolean;
  /** Si la cargó el usuario logueado — determina si puede avanzar el estado del viaje (Admin/Supervisor siempre puede). */
  esPropia: boolean;
}

const SIGUIENTE_ACCION: Record<EstadoViaje, { accion: "iniciar" | "marcar_punto_medio" | "finalizar"; label: string } | null> = {
  pendiente: { accion: "iniciar", label: "Iniciar viaje" },
  iniciado: { accion: "marcar_punto_medio", label: "Marcar punto medio" },
  en_punto_medio: { accion: "finalizar", label: "Finalizar viaje" },
  finalizado: null,
};

function fmtFechaHora(fechaHora: string) {
  const d = new Date(fechaHora);
  return `${d.toLocaleDateString("es-AR")} ${d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function HistorialRiesgoViaje({ evaluaciones: inicial, esAdmin }: { evaluaciones: EvaluacionRiesgoViajeRow[]; esAdmin: boolean }) {
  const [evaluaciones, setEvaluaciones] = useState(inicial);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return evaluaciones;
    return evaluaciones.filter((e) =>
      `${e.numeroGeneracion} ${e.vehiculoPatente} ${e.conductorNombre} ${e.origen} ${e.destino}`.toLowerCase().includes(q),
    );
  }, [evaluaciones, query]);

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

  async function avanzarEstado(id: string, accion: "iniciar" | "marcar_punto_medio" | "finalizar") {
    setBusyId(id);
    setNotice(null);
    const res = await actualizarEstadoViajeAction(id, accion);
    setBusyId(null);
    if (!res.success) {
      setNotice(res.error || "No se pudo actualizar el viaje.");
      return;
    }
    const estadoSiguiente: Record<typeof accion, EstadoViaje> = {
      iniciar: "iniciado",
      marcar_punto_medio: "en_punto_medio",
      finalizar: "finalizado",
    } as const;
    setEvaluaciones((prev) => prev.map((e) => (e.id === id ? { ...e, estadoViaje: estadoSiguiente[accion] } : e)));
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Historial — Riesgo de Viaje</h1>
        <p>Evaluaciones cargadas y el estado de cada viaje</p>
      </div>

      <div className="card">
        <div className="hint" style={{ margin: "0 0 8px" }}>
          <Icon name="search" size={13} /> Buscá por vehículo, conductor, origen o destino...
        </div>
        <input type="text" className="search-box" placeholder="Buscá..." value={query} onChange={(e) => setQuery(e.target.value)} />

        {notice && (
          <div className="hint" style={{ color: "var(--warn)" }}>
            {notice}
          </div>
        )}

        {filtradas.length === 0 ? (
          <div className="empty-note">No se encontraron evaluaciones con esa búsqueda.</div>
        ) : (
          <div className="list-grid">
            {filtradas.map((e) => {
              // Para un viaje sin punto medio, "iniciado" tiene que pasar directo a Finalizar, no a "Marcar punto medio".
              let siguiente = SIGUIENTE_ACCION[e.estadoViaje];
              if (siguiente && e.estadoViaje === "iniciado" && !e.tienePuntoMedio) {
                siguiente = { accion: "finalizar", label: "Finalizar viaje" };
              }
              const puedeAvanzar = (e.esPropia || esAdmin) && siguiente;

              return (
                <div className="hist-item" key={e.id}>
                  <div className="info">
                    <div className="hist-main">
                      <div className="hist-title">
                        {e.origen} → {e.destino}
                      </div>
                      <div className="hist-meta">
                        {e.numeroGeneracion} · {e.vehiculoPatente} · {e.conductorNombre} · {fmtFechaHora(e.fechaHora)}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                        <RiesgoBadge nivel={e.nivelRiesgo} total={e.total} />
                        <EstadoViajeBadge estado={e.estadoViaje} />
                      </div>
                    </div>
                  </div>
                  <div className="hist-actions" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                    <button
                      type="button"
                      className="icon-btn"
                      title={e.pdfDisponible ? "Ver PDF" : "Sin PDF disponible"}
                      disabled={!e.pdfDisponible || busyId === e.id}
                      onClick={() => verPdf(e.id)}
                    >
                      {busyId === e.id ? "…" : <Icon name="eye" size={15} />}
                    </button>
                    {puedeAvanzar && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={busyId === e.id}
                        onClick={() => avanzarEstado(e.id, siguiente!.accion)}
                      >
                        {busyId === e.id ? "..." : siguiente!.label}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
