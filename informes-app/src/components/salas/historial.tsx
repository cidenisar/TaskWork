"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { obtenerUrlPdfSalaAction, eliminarSalaAction } from "@/app/(app)/salas/historial/actions";
import { Icon } from "@/components/icon";
import { SALA_TIPO_CONSTRUCCION_LABEL } from "./types";
import type { SalaTipoConstruccion } from "@/lib/database.types";

export interface HistorialSalaRow {
  id: string;
  numeroGeneracion: string;
  denominacion: string;
  tipoConstruccion: SalaTipoConstruccion;
  ubicacionLabel: string;
  fecha: string;
  pdfDisponible: boolean;
}

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

export function HistorialSalas({ salas, esAdmin }: { salas: HistorialSalaRow[]; esAdmin: boolean }) {
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lista, setLista] = useState(salas);

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lista;
    return lista.filter((s) =>
      `${s.numeroGeneracion} ${s.denominacion} ${s.ubicacionLabel} ${SALA_TIPO_CONSTRUCCION_LABEL[s.tipoConstruccion]}`.toLowerCase().includes(q),
    );
  }, [lista, query]);

  async function verPdf(id: string) {
    setBusyId(id);
    setNotice(null);
    const res = await obtenerUrlPdfSalaAction(id);
    setBusyId(null);
    if (!res.url) {
      setNotice(res.error || "No se pudo abrir el PDF.");
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function eliminar(id: string, denominacion: string) {
    if (!window.confirm(`¿Borrar definitivamente la sala "${denominacion}"? Esto no se puede deshacer.`)) return;
    setBusyId(id);
    setNotice(null);
    const res = await eliminarSalaAction(id);
    setBusyId(null);
    if (!res.success) {
      setNotice(res.error || "No se pudo borrar la sala.");
      return;
    }
    setLista((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Historial de Salas</h1>
        <p>Salas, shelters y containers relevados — el mantenimiento de cada uno queda en el Plan de Mantenimiento</p>
      </div>

      <div className="card">
        <div className="hint" style={{ margin: "0 0 8px" }}>
          <Icon name="search" size={13} /> Buscá por denominación, tipo o sitio...
        </div>
        <input type="text" className="search-box" placeholder="Buscá..." value={query} onChange={(e) => setQuery(e.target.value)} />

        {notice && <div className="hint" style={{ color: "var(--warn)" }}>{notice}</div>}

        {filtradas.length === 0 ? (
          <div className="empty-note">No se encontraron salas con esa búsqueda.</div>
        ) : (
          <div className="list-grid">
            {filtradas.map((s) => (
              <div className={`hist-item${s.pdfDisponible ? "" : " archived"}`} key={s.id}>
                <div className="info">
                  <div className="hist-main">
                    <div className="hist-title">
                      {s.denominacion}
                      <span className={`hist-status ${s.pdfDisponible ? "ok" : "gone"}`}>
                        {s.pdfDisponible ? "PDF disponible" : "Sin PDF"}
                      </span>
                    </div>
                    <div className="hist-meta">
                      {s.numeroGeneracion} · {SALA_TIPO_CONSTRUCCION_LABEL[s.tipoConstruccion]} · {s.ubicacionLabel} · {fmtFecha(s.fecha)}
                    </div>
                  </div>
                </div>
                <div className="hist-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title={s.pdfDisponible ? "Ver PDF" : "Sin PDF disponible"}
                    disabled={!s.pdfDisponible || busyId === s.id}
                    onClick={() => verPdf(s.id)}
                  >
                    {busyId === s.id ? "…" : <Icon name="eye" size={15} />}
                  </button>
                  {esAdmin && (
                    <Link href={`/salas/editar/${s.id}`} className="icon-btn" title="Editar sala">
                      <Icon name="edit" size={15} />
                    </Link>
                  )}
                  {esAdmin && (
                    <button
                      type="button"
                      className="icon-btn icon-btn-danger"
                      title="Eliminar"
                      disabled={busyId === s.id}
                      onClick={() => eliminar(s.id, s.denominacion)}
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
