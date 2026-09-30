"use client";

import { useMemo, useState } from "react";
import { obtenerUrlFotoGeneralRackAction, obtenerUrlPdfRelevamientoAction } from "@/app/(app)/racks/historial/actions";
import { Icon } from "@/components/icon";

export interface HistorialRelevamientoRow {
  id: string;
  numeroGeneracion: string;
  fecha: string;
  denominacion: string;
  sitio: string;
  pdfDisponible: boolean;
  fotoDisponible: boolean;
}

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

export function HistorialRacks({ relevamientos }: { relevamientos: HistorialRelevamientoRow[] }) {
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return relevamientos;
    return relevamientos.filter((r) => `${r.numeroGeneracion} ${r.denominacion} ${r.sitio}`.toLowerCase().includes(q));
  }, [relevamientos, query]);

  async function verDescargarPdf(id: string, numeroGeneracion: string) {
    setBusyId(id);
    setNotice(null);
    const res = await obtenerUrlPdfRelevamientoAction(id);
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

  async function verFoto(id: string) {
    setBusyId(id);
    setNotice(null);
    const res = await obtenerUrlFotoGeneralRackAction(id);
    setBusyId(null);
    if (!res.url) {
      setNotice(res.error || "No se pudo abrir la foto.");
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Historial de Relevamiento de Equipamiento</h1>
        <p>Relevamientos cargados por rack — sitios, salas y shelters</p>
      </div>

      <div className="card">
        <div className="hint" style={{ margin: "0 0 8px" }}>
          <Icon name="search" size={13} /> Buscá por rack, sitio o N° de generación...
        </div>
        <input
          type="text"
          className="search-box"
          placeholder="Buscá..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {notice && <div className="hint" style={{ color: "var(--warn)" }}>{notice}</div>}

        {filtrados.length === 0 ? (
          <div className="empty-note">No se encontraron relevamientos con esa búsqueda.</div>
        ) : (
          <div>
            {filtrados.map((r) => (
              <div className={`hist-item${r.pdfDisponible ? "" : " archived"}`} key={r.id}>
                <div className="info">
                  <div className="hist-main">
                    <div className="hist-title">
                      {r.denominacion}
                      <span className={`hist-status ${r.pdfDisponible ? "ok" : "gone"}`}>
                        {r.pdfDisponible ? "PDF disponible" : "Solo registro"}
                      </span>
                    </div>
                    <div className="hist-meta">
                      {r.numeroGeneracion} · {r.sitio} · {fmtFecha(r.fecha)}
                    </div>
                  </div>
                </div>
                <div className="hist-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title={r.fotoDisponible ? "Ver foto general" : "Sin foto general"}
                    disabled={!r.fotoDisponible || busyId === r.id}
                    onClick={() => verFoto(r.id)}
                  >
                    {busyId === r.id ? "…" : <Icon name="camera" size={15} />}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title={r.pdfDisponible ? "Ver / descargar PDF" : "Sin PDF disponible"}
                    disabled={!r.pdfDisponible || busyId === r.id}
                    onClick={() => verDescargarPdf(r.id, r.numeroGeneracion)}
                  >
                    {busyId === r.id ? "…" : <Icon name="download" size={15} />}
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
