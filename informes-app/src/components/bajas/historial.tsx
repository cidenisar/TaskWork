"use client";

import { useMemo, useState } from "react";
import { obtenerUrlPdfBajaAction } from "@/app/(app)/bajas/historial/actions";
import { Icon } from "@/components/icon";
import { MOTIVO_BAJA_LABEL, TIPO_EQUIPO_BAJA_LABEL } from "./types";
import type { MotivoBaja, TipoEquipoBaja } from "@/lib/database.types";

export interface HistorialBajaRow {
  id: string;
  numeroGeneracion: string;
  tipoEquipo: TipoEquipoBaja;
  equipoTexto: string;
  equipoCategoria: string;
  motivo: MotivoBaja;
  comentario: string | null;
  fecha: string;
  ubicacionLabel: string;
  pdfDisponible: boolean;
}

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

export function HistorialBajas({ bajas }: { bajas: HistorialBajaRow[] }) {
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bajas;
    return bajas.filter((b) =>
      `${b.numeroGeneracion} ${b.equipoTexto} ${b.equipoCategoria} ${b.ubicacionLabel} ${MOTIVO_BAJA_LABEL[b.motivo]}`
        .toLowerCase()
        .includes(q),
    );
  }, [bajas, query]);

  async function verComprobante(id: string) {
    setBusyId(id);
    setNotice(null);
    const res = await obtenerUrlPdfBajaAction(id);
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
        <h1>Historial de Bajas</h1>
        <p>Equipamiento dado de baja por rotura, ampliación u obsolescencia — comprobante para entregar a depósito</p>
      </div>

      <div className="card">
        <div className="hint" style={{ margin: "0 0 8px" }}>
          <Icon name="search" size={13} /> Buscá por equipo, categoría, sitio o motivo...
        </div>
        <input type="text" className="search-box" placeholder="Buscá..." value={query} onChange={(e) => setQuery(e.target.value)} />

        {notice && <div className="hint" style={{ color: "var(--warn)" }}>{notice}</div>}

        {filtradas.length === 0 ? (
          <div className="empty-note">No se encontraron bajas con esa búsqueda.</div>
        ) : (
          <div className="list-grid">
            {filtradas.map((b) => (
              <div className={`hist-item${b.pdfDisponible ? "" : " archived"}`} key={b.id}>
                <div className="info">
                  <div className="hist-main">
                    <div className="hist-title">
                      {b.equipoTexto}
                      <span className={`hist-status ${b.pdfDisponible ? "ok" : "gone"}`}>
                        {b.pdfDisponible ? "PDF disponible" : "Solo registro"}
                      </span>
                    </div>
                    <div className="hist-meta">
                      {b.numeroGeneracion} · {TIPO_EQUIPO_BAJA_LABEL[b.tipoEquipo]} ({b.equipoCategoria}) · {MOTIVO_BAJA_LABEL[b.motivo]} ·{" "}
                      {b.ubicacionLabel} · {fmtFecha(b.fecha)}
                    </div>
                    {b.comentario && <div className="hist-meta" style={{ marginTop: 4 }}>{b.comentario}</div>}
                  </div>
                </div>
                <div className="hist-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title={b.pdfDisponible ? "Ver comprobante" : "Sin comprobante disponible"}
                    disabled={!b.pdfDisponible || busyId === b.id}
                    onClick={() => verComprobante(b.id)}
                  >
                    {busyId === b.id ? "…" : <Icon name="eye" size={15} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
