"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EstadoRendicion } from "@/lib/database.types";
import { filtrarRendicionesPorConsulta, type HistorialRendicionBuscable } from "@/lib/rendicion-gastos/nl-search";
import { obtenerUrlPdfRendicionAction } from "@/app/(app)/rendicion-gastos/historial/actions";
import { Icon } from "@/components/icon";

export interface HistorialRendicionRow extends HistorialRendicionBuscable {
  id: string;
  moneda: "ARS" | "USD";
  viaticoRecibido: number;
  totalGastado: number;
  estado: EstadoRendicion;
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

  async function verPdf(id: string, numeroGeneracion: string) {
    setBusyId(id);
    setNotice(null);
    const res = await obtenerUrlPdfRendicionAction(id);
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
        <h1>Historial de Rendiciones</h1>
        <p>El registro queda para siempre y se puede buscar; el PDF es temporal</p>
      </div>

      <div className="banner">
        <Icon name="bell" size={14} /> Una rendición <b>abierta</b> (▶) todavía admite agregar o quitar gastos — segui cargándolos cuando
        quieras hasta hacer el cierre. Una vez <b>cerrada</b> ya no se puede modificar: el{" "}
        <b>registro</b> (motivo, fecha, técnicos, N° de generación, total y saldo) se guarda para siempre, el{" "}
        <b>PDF</b> se conserva solo hasta que lo descargues o hasta el umbral configurado en Configuración, y el
        Excel siempre se puede volver a generar mientras el registro exista.
      </div>

      <div className="card">
        <div className="hint" style={{ margin: "0 0 8px" }}>
          <Icon name="search" size={13} /> Búsqueda en lenguaje natural — ej. &quot;el viaje a YPF de agosto&quot;
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
              const abierta = r.estado === "abierta";
              const estadoLabel = abierta ? "Abierta" : r.pdfDisponible ? "Cerrada" : "Solo registro";
              return (
                <div className={`hist-item${r.pdfDisponible || abierta ? "" : " archived"}`} key={r.id}>
                  <div className="info">
                    <div className="hist-main">
                      <div className="hist-title">
                        {r.motivo}
                        <span className={`hist-status ${abierta ? "warn" : r.pdfDisponible ? "ok" : "gone"}`}>{estadoLabel}</span>
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
                    {abierta ? (
                      <Link href={`/rendicion-gastos/${r.id}`} className="icon-btn" title="Seguir cargando gastos">
                        ▶
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="icon-btn"
                        title={r.pdfDisponible ? "Ver PDF" : "Sin PDF disponible"}
                        disabled={!r.pdfDisponible || busyId === r.id}
                        onClick={() => verPdf(r.id, r.numeroGeneracion)}
                      >
                        {busyId === r.id ? "…" : <Icon name="document" size={15} />}
                      </button>
                    )}
                    <a
                      className="icon-btn"
                      title="Descargar Excel"
                      href={`/api/rendiciones/${r.id}/excel`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon name="chart" size={15} />
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
