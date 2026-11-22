"use client";

import { Fragment, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { AdjuntosTablero, type AdjuntoTableroItem } from "@/components/tableros/adjuntos-tablero";

export interface PlanoTableroRow {
  id: string;
  denominacion: string;
  subsistemasLabel: string;
  ubicacionId: string;
  ubicacionLabel: string;
  ultimaFecha: string | null;
  pdfUrl: string | null;
  dxfUrl: string | null;
  adjuntos: AdjuntoTableroItem[];
}

export interface PlanoSalaRow {
  id: string;
  denominacion: string;
  ubicacionId: string;
  ubicacionLabel: string;
  pdfUrl: string | null;
}

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

/** Agrupa filas ya filtradas por sitio, preservando el orden en que llegan (alfabético por denominación, de la consulta original). */
function agruparPorSitio<T extends { ubicacionId: string; ubicacionLabel: string }>(filas: T[]): { ubicacionId: string; ubicacionLabel: string; filas: T[] }[] {
  const grupos = new Map<string, { ubicacionId: string; ubicacionLabel: string; filas: T[] }>();
  for (const f of filas) {
    const grupo = grupos.get(f.ubicacionId);
    if (grupo) grupo.filas.push(f);
    else grupos.set(f.ubicacionId, { ubicacionId: f.ubicacionId, ubicacionLabel: f.ubicacionLabel, filas: [f] });
  }
  return [...grupos.values()].sort((a, b) => a.ubicacionLabel.localeCompare(b.ubicacionLabel));
}

/**
 * Todos los tableros y salas de todos los sitios en una sola pantalla —
 * agrupados por sitio (colapsado por defecto, así no es una lista enorme
 * apenas se carguen muchos) y en filas compactas de tabla en vez de
 * tarjetas grandes. Buscar abre automáticamente los sitios con resultados.
 */
export function PlanosQrView({ tableros, salas, esAdmin }: { tableros: PlanoTableroRow[]; salas: PlanoSalaRow[]; esAdmin: boolean }) {
  const [query, setQuery] = useState("");
  const [sitiosAbiertos, setSitiosAbiertos] = useState<Set<string>>(new Set());
  const [adjuntosAbiertos, setAdjuntosAbiertos] = useState<Set<string>>(new Set());

  const q = query.trim().toLowerCase();
  const buscando = q !== "";

  const tablerosFiltrados = useMemo(
    () => (q ? tableros.filter((t) => `${t.denominacion} ${t.ubicacionLabel} ${t.subsistemasLabel}`.toLowerCase().includes(q)) : tableros),
    [tableros, q],
  );
  const salasFiltradas = useMemo(() => (q ? salas.filter((s) => `${s.denominacion} ${s.ubicacionLabel}`.toLowerCase().includes(q)) : salas), [salas, q]);

  const gruposTableros = useMemo(() => agruparPorSitio(tablerosFiltrados), [tablerosFiltrados]);
  const gruposSalas = useMemo(() => agruparPorSitio(salasFiltradas), [salasFiltradas]);

  function toggleSitio(key: string) {
    setSitiosAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAdjuntos(tableroId: string) {
    setAdjuntosAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(tableroId)) next.delete(tableroId);
      else next.add(tableroId);
      return next;
    });
  }

  return (
    <div>
      <div className="panel-topbar">
        <div>
          <h1>Planos y QR</h1>
          <p>Descargá el QR o manejá los archivos de plano de cualquier tablero/sala, de cualquier sitio, sin entrar a su ficha</p>
        </div>
      </div>

      <div className="card">
        <div className="hint" style={{ margin: "0 0 8px" }}>
          <Icon name="search" size={13} /> Buscá por denominación o sitio...
        </div>
        <input type="text" className="search-box" placeholder="Buscá..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="card">
        <div className="panel-card-title">
          <h2>Tableros</h2>
          <span className="panel-card-count">
            {tablerosFiltrados.length} en {gruposTableros.length} sitio{gruposTableros.length === 1 ? "" : "s"}
          </span>
        </div>
        {gruposTableros.length === 0 ? (
          <div className="empty-note">No hay tableros que coincidan con la búsqueda.</div>
        ) : (
          gruposTableros.map((grupo) => {
            const key = `t:${grupo.ubicacionId}`;
            const abierto = buscando || sitiosAbiertos.has(key);
            return (
              <div key={key} style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => toggleSitio(key)}
                  disabled={buscando}
                  style={{ width: "100%", justifyContent: "space-between", display: "flex" }}
                >
                  <span>{grupo.ubicacionLabel}</span>
                  <span className="hint" style={{ margin: 0 }}>
                    {grupo.filas.length} tablero{grupo.filas.length === 1 ? "" : "s"} {abierto ? "▲" : "▼"}
                  </span>
                </button>
                {abierto && (
                  <div style={{ overflowX: "auto" }}>
                    <table className="detalle-table">
                      <thead>
                        <tr>
                          <th>Tablero</th>
                          <th>Última visita</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grupo.filas.map((t) => (
                          <Fragment key={t.id}>
                            <tr>
                              <td>
                                {t.denominacion}
                                <div className="hint" style={{ margin: 0 }}>
                                  {t.subsistemasLabel}
                                </div>
                              </td>
                              <td>{t.ultimaFecha ? fmtFecha(t.ultimaFecha) : "Sin visitas"}</td>
                              <td>
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                  <a className="icon-btn" title="Descargar QR" href={`/api/tableros/${t.id}/qr`}>
                                    <Icon name="download" size={14} />
                                  </a>
                                  <a className="icon-btn" title="Ver plano" href={`/planos/tablero/${t.id}`} target="_blank" rel="noopener noreferrer">
                                    <Icon name="eye" size={14} />
                                  </a>
                                  {t.pdfUrl && (
                                    <a className="btn btn-secondary btn-sm" href={t.pdfUrl} target="_blank" rel="noopener noreferrer">
                                      PDF
                                    </a>
                                  )}
                                  {t.dxfUrl && (
                                    <a className="btn btn-secondary btn-sm" href={t.dxfUrl}>
                                      DXF
                                    </a>
                                  )}
                                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleAdjuntos(t.id)}>
                                    {adjuntosAbiertos.has(t.id) ? "Ocultar adjuntos" : `Adjuntos (${t.adjuntos.length})`}
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {adjuntosAbiertos.has(t.id) && (
                              <tr>
                                <td colSpan={3} style={{ background: "var(--panel-2)" }}>
                                  <AdjuntosTablero tableroId={t.id} adjuntos={t.adjuntos} esAdmin={esAdmin} />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="card">
        <div className="panel-card-title">
          <h2>Salas / Shelters</h2>
          <span className="panel-card-count">
            {salasFiltradas.length} en {gruposSalas.length} sitio{gruposSalas.length === 1 ? "" : "s"}
          </span>
        </div>
        {gruposSalas.length === 0 ? (
          <div className="empty-note">No hay salas que coincidan con la búsqueda.</div>
        ) : (
          gruposSalas.map((grupo) => {
            const key = `s:${grupo.ubicacionId}`;
            const abierto = buscando || sitiosAbiertos.has(key);
            return (
              <div key={key} style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => toggleSitio(key)}
                  disabled={buscando}
                  style={{ width: "100%", justifyContent: "space-between", display: "flex" }}
                >
                  <span>{grupo.ubicacionLabel}</span>
                  <span className="hint" style={{ margin: 0 }}>
                    {grupo.filas.length} sala{grupo.filas.length === 1 ? "" : "s"} {abierto ? "▲" : "▼"}
                  </span>
                </button>
                {abierto && (
                  <div style={{ overflowX: "auto" }}>
                    <table className="detalle-table">
                      <thead>
                        <tr>
                          <th>Sala</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grupo.filas.map((s) => (
                          <tr key={s.id}>
                            <td>{s.denominacion}</td>
                            <td>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                                <a className="icon-btn" title="Descargar QR" href={`/api/salas/${s.id}/qr`}>
                                  <Icon name="download" size={14} />
                                </a>
                                <a className="icon-btn" title="Ver plano" href={`/planos/sala/${s.id}`} target="_blank" rel="noopener noreferrer">
                                  <Icon name="eye" size={14} />
                                </a>
                                {s.pdfUrl && (
                                  <a className="btn btn-secondary btn-sm" href={s.pdfUrl} target="_blank" rel="noopener noreferrer">
                                    PDF
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
