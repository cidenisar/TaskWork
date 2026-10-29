"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { Spinner } from "@/components/spinner";
import { buscarMaterialesAction } from "@/app/(app)/materiales/buscar/actions";
import { obtenerUrlPdfInformeAction } from "@/app/(app)/informe-tecnico/historial/actions";
import type { ResultadoBusquedaMateriales } from "@/lib/materiales/buscar";

function fmtFecha(fecha: string): string {
  if (!fecha) return "—";
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

export function BuscarMateriales() {
  const [query, setQuery] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoBusquedaMateriales | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function buscar(e?: React.FormEvent) {
    e?.preventDefault();
    if (query.trim().length < 2) {
      setNotice("Escribí al menos 2 caracteres.");
      return;
    }
    setNotice(null);
    setBuscando(true);
    const res = await buscarMaterialesAction(query);
    setResultado(res);
    setBuscando(false);
  }

  async function verPdfInforme(informeId: string) {
    setPdfBusyId(informeId);
    const res = await obtenerUrlPdfInformeAction(informeId);
    setPdfBusyId(null);
    if (!res.url) {
      setNotice(res.error || "No se pudo abrir el PDF.");
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  const totalResultados = resultado ? resultado.equipos.length + resultado.materialesRemito.length : null;

  return (
    <div>
      <form onSubmit={buscar} className="card" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="text"
          className="search-box"
          placeholder="N° de serie, etiqueta YPF, descripción del material..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1 }}
        />
        <button type="submit" className="ai-btn" disabled={buscando}>
          {buscando ? <Spinner size={15} /> : <Icon name="search" size={15} />} Buscar
        </button>
      </form>

      {notice && <div className="hint" style={{ color: "var(--warn)" }}>{notice}</div>}

      {totalResultados === 0 && (
        <div className="empty-note">No se encontró ningún equipo ni material con eso — probá con otro texto.</div>
      )}

      {resultado && resultado.equipos.length > 0 && (
        <div className="card">
          <div className="section-label">Equipos ({resultado.equipos.length})</div>
          <div className="list-grid">
            {resultado.equipos.map((eq) => (
              <div className="hist-item" key={eq.id}>
                <div className="info">
                  <div className="hist-main">
                    <div className="hist-title">
                      {eq.texto}
                      <span className={`hist-status ${eq.estadoLabel === "Activo" ? "ok" : "gone"}`}>{eq.estadoLabel}</span>
                    </div>
                    <div className="hist-meta">
                      {eq.categoriaLabel}
                      {eq.marcaModelo ? ` · ${eq.marcaModelo}` : ""}
                      {eq.numeroSerie ? ` · N° serie ${eq.numeroSerie}` : ""}
                      {eq.etiquetaYpf ? ` · Etiqueta YPF ${eq.etiquetaYpf}` : ""}
                    </div>
                    <div className="hist-meta">{eq.ubicacionLabel}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {resultado && resultado.materialesRemito.length > 0 && (
        <div className="card">
          <div className="section-label">Materiales de remito ({resultado.materialesRemito.length})</div>
          <div className="hint" style={{ margin: "-4px 0 8px" }}>
            Material a granel (sin alta de equipo propia) — cantidad usada = esperada − sobrante.
          </div>
          <div className="list-grid">
            {resultado.materialesRemito.map((m) => (
              <div className="hist-item" key={m.id}>
                <div className="info">
                  <div className="hist-main">
                    <div className="hist-title">{m.descripcion}</div>
                    <div className="hist-meta">
                      Usado: {m.cantidadEsperada - m.cantidadSobrante} de {m.cantidadEsperada}
                      {m.cantidadSobrante > 0 ? ` (sobrante: ${m.cantidadSobrante})` : ""}
                    </div>
                    <div className="hist-meta">
                      {m.informeNumeroGeneracion} · {fmtFecha(m.informeFecha)} · {m.ubicacionLabel}
                    </div>
                  </div>
                </div>
                <div className="hist-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title={m.pdfDisponible ? "Ver el Informe Técnico que lo usó" : "Sin PDF disponible"}
                    disabled={!m.pdfDisponible || pdfBusyId === m.informeId}
                    onClick={() => verPdfInforme(m.informeId)}
                  >
                    {pdfBusyId === m.informeId ? <Spinner size={15} /> : <Icon name="eye" size={15} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
