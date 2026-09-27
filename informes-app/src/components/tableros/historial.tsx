"use client";

import { useMemo, useState } from "react";
import { obtenerUrlPdfMedicionAction } from "@/app/(app)/tableros/historial/actions";
import { Icon } from "@/components/icon";
import { TABLERO_TIPO_LABEL } from "./types";
import type { TableroTipo } from "@/lib/database.types";

export interface HistorialMedicionRow {
  id: string;
  numeroGeneracion: string;
  fecha: string;
  tipo: TableroTipo;
  denominacion: string;
  sitio: string;
  pdfDisponible: boolean;
}

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

export function HistorialTableros({ mediciones }: { mediciones: HistorialMedicionRow[] }) {
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mediciones;
    return mediciones.filter((m) =>
      `${m.numeroGeneracion} ${m.denominacion} ${m.sitio} ${TABLERO_TIPO_LABEL[m.tipo]}`.toLowerCase().includes(q),
    );
  }, [mediciones, query]);

  async function verDescargar(id: string, numeroGeneracion: string) {
    setBusyId(id);
    setNotice(null);
    const res = await obtenerUrlPdfMedicionAction(id);
    setBusyId(null);
    if (!res.url) {
      setNotice(res.error || "No se pudo abrir el PDF.");
      return;
    }
    const blob = await fetch(res.url).then((r) => r.blob());
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = res.filename || `${numeroGeneracion}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Historial de Tableros</h1>
        <p>Mediciones y relevamientos cargados — Energía, CCTV y Control de Acceso</p>
      </div>

      <div className="card">
        <div className="hint" style={{ margin: "0 0 8px" }}>
          <Icon name="search" size={13} /> Buscá por tablero, sitio, tipo o N° de generación...
        </div>
        <input
          type="text"
          className="search-box"
          placeholder="Buscá..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {notice && <div className="hint" style={{ color: "var(--warn)" }}>{notice}</div>}

        {filtered.length === 0 ? (
          <div className="empty-note">No se encontraron mediciones con esa búsqueda.</div>
        ) : (
          <div>
            {filtered.map((m) => (
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
                      {m.numeroGeneracion} · {TABLERO_TIPO_LABEL[m.tipo]} · {m.sitio} · {fmtFecha(m.fecha)}
                    </div>
                  </div>
                </div>
                <div className="hist-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title={m.pdfDisponible ? "Ver / descargar PDF" : "Sin PDF disponible"}
                    disabled={!m.pdfDisponible || busyId === m.id}
                    onClick={() => verDescargar(m.id, m.numeroGeneracion)}
                  >
                    {busyId === m.id ? "…" : <Icon name="download" size={15} />}
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
