"use client";

import { useMemo, useState } from "react";
import { obtenerUrlPdfInstalacionAction, obtenerUrlFotoRemitoAction } from "@/app/(app)/instalacion/historial/actions";
import { Icon } from "@/components/icon";

export interface HistorialInstalacionRow {
  id: string;
  numeroGeneracion: string;
  descripcion: string;
  categoria: string | null;
  cantidad: number;
  comentario: string | null;
  fecha: string;
  ubicacionLabel: string;
  remitoNumero: string | null;
  remitoFotoDisponible: boolean;
  entregaDepositoNumeroGeneracion: string | null;
  pdfDisponible: boolean;
}

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

export function HistorialInstalacion({ instalaciones }: { instalaciones: HistorialInstalacionRow[] }) {
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return instalaciones;
    return instalaciones.filter((i) =>
      `${i.numeroGeneracion} ${i.descripcion} ${i.categoria ?? ""} ${i.ubicacionLabel} ${i.remitoNumero ?? ""}`.toLowerCase().includes(q),
    );
  }, [instalaciones, query]);

  async function verPdf(id: string) {
    setBusyId(id);
    setNotice(null);
    const res = await obtenerUrlPdfInstalacionAction(id);
    setBusyId(null);
    if (!res.url) {
      setNotice(res.error || "No se pudo abrir el PDF.");
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function verRemito(id: string) {
    setBusyId(id);
    setNotice(null);
    const res = await obtenerUrlFotoRemitoAction(id);
    setBusyId(null);
    if (!res.url) {
      setNotice(res.error || "No se pudo abrir la foto del remito.");
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Historial de Instalaciones</h1>
        <p>Materiales instalados a partir de un remito de depósito</p>
      </div>

      <div className="card">
        <div className="hint" style={{ margin: "0 0 8px" }}>
          <Icon name="search" size={13} /> Buscá por material, categoría, sitio o N° de remito...
        </div>
        <input type="text" className="search-box" placeholder="Buscá..." value={query} onChange={(e) => setQuery(e.target.value)} />

        {notice && <div className="hint" style={{ color: "var(--warn)" }}>{notice}</div>}

        {filtradas.length === 0 ? (
          <div className="empty-note">No se encontraron instalaciones con esa búsqueda.</div>
        ) : (
          <div className="list-grid">
            {filtradas.map((i) => (
              <div className={`hist-item${i.pdfDisponible ? "" : " archived"}`} key={i.id}>
                <div className="info">
                  <div className="hist-main">
                    <div className="hist-title">
                      {i.descripcion}
                      <span className={`hist-status ${i.pdfDisponible ? "ok" : "gone"}`}>{i.pdfDisponible ? "PDF disponible" : "Solo registro"}</span>
                    </div>
                    <div className="hist-meta">
                      {i.numeroGeneracion}
                      {i.categoria ? ` · ${i.categoria}` : ""} · x{i.cantidad} · {i.ubicacionLabel} · {fmtFecha(i.fecha)}
                      {i.remitoNumero ? ` · Remito ${i.remitoNumero}` : ""}
                    </div>
                    {i.entregaDepositoNumeroGeneracion && (
                      <div className="hist-meta" style={{ marginTop: 4 }}>
                        <Icon name="truck" size={11} /> Devolución de sobrantes: {i.entregaDepositoNumeroGeneracion}
                      </div>
                    )}
                    {i.comentario && <div className="hist-meta" style={{ marginTop: 4 }}>{i.comentario}</div>}
                  </div>
                </div>
                <div className="hist-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title={i.remitoFotoDisponible ? "Ver foto del remito" : "Sin foto de remito"}
                    disabled={!i.remitoFotoDisponible || busyId === i.id}
                    onClick={() => verRemito(i.id)}
                  >
                    {busyId === i.id ? "…" : <Icon name="camera" size={15} />}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title={i.pdfDisponible ? "Ver comprobante" : "Sin comprobante disponible"}
                    disabled={!i.pdfDisponible || busyId === i.id}
                    onClick={() => verPdf(i.id)}
                  >
                    {busyId === i.id ? "…" : <Icon name="eye" size={15} />}
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
