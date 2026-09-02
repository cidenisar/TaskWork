"use client";

import { useMemo, useState } from "react";
import { filtrarRendicionesPorConsulta, type HistorialRendicionBuscable } from "@/lib/rendicion-gastos/nl-search";
import { obtenerUrlPdfRendicionAction } from "@/app/(app)/rendicion-gastos/historial/actions";

export interface HistorialRendicionRow extends HistorialRendicionBuscable {
  id: string;
  moneda: "ARS" | "USD";
  viaticoRecibido: number;
  totalGastado: number;
  pdfDisponible: boolean;
}

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}
function fmtMonto(monto: number, moneda: string) {
  return `${moneda} ${monto.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function HistorialRendiciones({ rendiciones }: { rendiciones: HistorialRendicionRow[] }) {
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => filtrarRendicionesPorConsulta(rendiciones, query), [rendiciones, query]);

  async function verPdf(id: string) {
    setBusyId(id);
    setNotice(null);
    const res = await obtenerUrlPdfRendicionAction(id);
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
        <h1>Historial de Rendiciones</h1>
        <p>El registro queda para siempre y se puede buscar; el PDF es temporal</p>
      </div>

      <div className="banner">
        🔔 El <b>registro</b> (motivo, fecha, técnicos, N° de generación, total y saldo) se guarda para siempre. El{" "}
        <b>PDF</b> se conserva solo hasta que lo descargues o hasta el umbral configurado en Configuración — el
        Excel siempre se puede volver a generar mientras el registro exista.
      </div>

      <div className="card">
        <div className="hint" style={{ margin: "0 0 8px" }}>
          🔍 Búsqueda en lenguaje natural — ej. &quot;el viaje a YPF de agosto&quot;
        </div>
        <input
          type="text"
          className="search-box"
          placeholder="Buscá por motivo, proyecto/cliente, técnico o N° de rendición..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {notice && <div className="hint" style={{ color: "var(--warn)" }}>{notice}</div>}

        {filtered.length === 0 ? (
          <div className="empty-note">No se encontraron rendiciones con esa búsqueda.</div>
        ) : (
          <div>
            {filtered.map((r) => {
              const saldo = r.viaticoRecibido - r.totalGastado;
              return (
                <div className={`hist-item${r.pdfDisponible ? "" : " archived"}`} key={r.id}>
                  <div className="info">
                    <div className="hist-main">
                      <div className="hist-title">
                        {r.motivo}
                        <span className={`hist-status ${r.pdfDisponible ? "ok" : "gone"}`}>
                          {r.pdfDisponible ? "PDF disponible" : "Solo registro"}
                        </span>
                      </div>
                      <div className="hist-meta">
                        {r.numeroGeneracion} · {fmtFecha(r.fecha)} · Total {fmtMonto(r.totalGastado, r.moneda)} · Saldo{" "}
                        <span style={{ color: saldo >= 0 ? "var(--ok)" : "var(--accent-2)", fontWeight: 600 }}>
                          {fmtMonto(Math.abs(saldo), r.moneda)}
                          {saldo >= 0 ? " a favor" : " a reintegrar"}
                        </span>
                        {r.tecnicos.length ? ` · ${r.tecnicos.join(", ")}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="hist-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title={r.pdfDisponible ? "Ver PDF" : "Sin PDF disponible"}
                      disabled={!r.pdfDisponible || busyId === r.id}
                      onClick={() => verPdf(r.id)}
                    >
                      {busyId === r.id ? "…" : "📄"}
                    </button>
                    <a
                      className="icon-btn"
                      title="Descargar Excel"
                      href={`/api/rendiciones/${r.id}/excel`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      📊
                    </a>
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
