"use client";

import { useMemo, useState } from "react";
import {
  obtenerUrlFotoMantenimientoAction,
  obtenerUrlPdfMedicionAction,
  eliminarMedicionAction,
  eliminarMantenimientoAction,
} from "@/app/(app)/tableros/historial/actions";
import { Icon } from "@/components/icon";
import { TABLERO_EVENTO_LABEL, labelSubsistemas, type MantenimientoRow } from "./types";
import type { TableroEventoTipo, TableroTipo } from "@/lib/database.types";

export interface HistorialMedicionRow {
  id: string;
  numeroGeneracion: string;
  tipoEvento: TableroEventoTipo;
  fecha: string;
  subsistemas: TableroTipo[];
  denominacion: string;
  ubicacionLabel: string;
  pdfDisponible: boolean;
}

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

export function HistorialTableros({
  mediciones: medicionesIniciales,
  mantenimientos: mantenimientosIniciales,
  esAdmin,
}: {
  mediciones: HistorialMedicionRow[];
  mantenimientos: MantenimientoRow[];
  esAdmin: boolean;
}) {
  const [mediciones, setMediciones] = useState(medicionesIniciales);
  const [mantenimientos, setMantenimientos] = useState(mantenimientosIniciales);
  const [tab, setTab] = useState<"mediciones" | "mantenimientos">("mediciones");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const medicionesFiltradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mediciones;
    return mediciones.filter((m) =>
      `${m.numeroGeneracion} ${m.denominacion} ${m.ubicacionLabel} ${labelSubsistemas(m.subsistemas)} ${TABLERO_EVENTO_LABEL[m.tipoEvento]}`
        .toLowerCase()
        .includes(q),
    );
  }, [mediciones, query]);

  const mantenimientosFiltrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mantenimientos;
    return mantenimientos.filter((m) =>
      `${m.tableroDenominacion} ${m.tableroUbicacion} ${m.circuitoTexto ?? ""} ${m.descripcion}`.toLowerCase().includes(q),
    );
  }, [mantenimientos, query]);

  async function verPdf(id: string) {
    setBusyId(id);
    setNotice(null);
    const res = await obtenerUrlPdfMedicionAction(id);
    setBusyId(null);
    if (!res.url) {
      setNotice(res.error || "No se pudo abrir el PDF.");
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function verFoto(id: string) {
    setBusyId(id);
    setNotice(null);
    const res = await obtenerUrlFotoMantenimientoAction(id);
    setBusyId(null);
    if (!res.url) {
      setNotice(res.error || "No se pudo abrir la foto.");
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function eliminarMedicion(id: string, denominacion: string) {
    if (!window.confirm(`¿Borrar definitivamente la medición de "${denominacion}"? Esto no se puede deshacer.`)) return;
    setBusyId(id);
    setNotice(null);
    const res = await eliminarMedicionAction(id);
    setBusyId(null);
    if (!res.success) {
      setNotice(res.error || "No se pudo borrar la medición.");
      return;
    }
    setMediciones((prev) => prev.filter((m) => m.id !== id));
  }

  async function eliminarMantenimiento(id: string, denominacion: string) {
    if (!window.confirm(`¿Borrar definitivamente el mantenimiento de "${denominacion}"? Esto no se puede deshacer.`)) return;
    setBusyId(id);
    setNotice(null);
    const res = await eliminarMantenimientoAction(id);
    setBusyId(null);
    if (!res.success) {
      setNotice(res.error || "No se pudo borrar el mantenimiento.");
      return;
    }
    setMantenimientos((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Historial de Tableros</h1>
        <p>Mediciones, relevamientos y mantenimientos — Energía, CCTV y Control de Acceso</p>
      </div>

      <div className="navtabs" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className={`navtab${tab === "mediciones" ? " active" : ""}`}
          onClick={() => setTab("mediciones")}
        >
          Mediciones / Relevamientos
        </button>
        <button
          type="button"
          className={`navtab${tab === "mantenimientos" ? " active" : ""}`}
          onClick={() => setTab("mantenimientos")}
        >
          Mantenimientos
        </button>
      </div>

      <div className="card">
        <div className="hint" style={{ margin: "0 0 8px" }}>
          <Icon name="search" size={13} /> Buscá por tablero, sitio, tipo o descripción...
        </div>
        <input
          type="text"
          className="search-box"
          placeholder="Buscá..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {notice && <div className="hint" style={{ color: "var(--warn)" }}>{notice}</div>}

        {tab === "mediciones" ? (
          medicionesFiltradas.length === 0 ? (
            <div className="empty-note">No se encontraron mediciones ni relevamientos con esa búsqueda.</div>
          ) : (
            <div className="list-grid">
              {medicionesFiltradas.map((m) => (
                <div className={`hist-item${m.pdfDisponible ? "" : " archived"}`} key={m.id}>
                  <div className="info">
                    <div className="hist-main">
                      <div className="hist-title">
                        {m.denominacion}
                        <span className={`hist-status ${m.pdfDisponible ? "ok" : "gone"}`}>
                          {m.pdfDisponible ? "PDF disponible" : "Solo registro"}
                        </span>
                      </div>
                      <div className="hist-meta">
                        {m.numeroGeneracion} · {TABLERO_EVENTO_LABEL[m.tipoEvento]} · {labelSubsistemas(m.subsistemas)} · {m.ubicacionLabel} ·{" "}
                        {fmtFecha(m.fecha)}
                      </div>
                    </div>
                  </div>
                  <div className="hist-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title={m.pdfDisponible ? "Ver PDF" : "Sin PDF disponible"}
                      disabled={!m.pdfDisponible || busyId === m.id}
                      onClick={() => verPdf(m.id)}
                    >
                      {busyId === m.id ? "…" : <Icon name="eye" size={15} />}
                    </button>
                    {esAdmin && (
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        title="Borrar medición"
                        disabled={busyId === m.id}
                        onClick={() => eliminarMedicion(m.id, m.denominacion)}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : mantenimientosFiltrados.length === 0 ? (
          <div className="empty-note">No se encontraron mantenimientos con esa búsqueda.</div>
        ) : (
          <div className="list-grid">
            {mantenimientosFiltrados.map((m) => (
              <div className="hist-item" key={m.id}>
                <div className="info">
                  <div className="hist-main">
                    <div className="hist-title">
                      {m.tableroDenominacion}
                      {m.proximoMantenimiento && (
                        <span className="hist-status" style={{ background: "var(--warn-bg, #3a2f1a)", color: "var(--warn)" }}>
                          Próximo: {fmtFecha(m.proximoMantenimiento)}
                        </span>
                      )}
                    </div>
                    <div className="hist-meta">
                      {m.tableroUbicacion} · {fmtFecha(m.fecha)}
                      {m.circuitoTexto ? ` · ${m.circuitoTexto}` : ""}
                    </div>
                    <div className="hist-meta" style={{ marginTop: 4 }}>
                      {m.descripcion}
                    </div>
                  </div>
                </div>
                <div className="hist-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title={m.fotoUrl ? "Ver foto" : "Sin foto"}
                    disabled={!m.fotoUrl || busyId === m.id}
                    onClick={() => verFoto(m.id)}
                  >
                    {busyId === m.id ? "…" : <Icon name="camera" size={15} />}
                  </button>
                  {esAdmin && (
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      title="Borrar mantenimiento"
                      disabled={busyId === m.id}
                      onClick={() => eliminarMantenimiento(m.id, m.tableroDenominacion)}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
