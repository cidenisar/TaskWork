"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { AdjuntosTablero, type AdjuntoTableroItem } from "@/components/tableros/adjuntos-tablero";

export interface PlanoTableroRow {
  id: string;
  denominacion: string;
  subsistemasLabel: string;
  ubicacionLabel: string;
  ultimaFecha: string | null;
  pdfUrl: string | null;
  dxfUrl: string | null;
  adjuntos: AdjuntoTableroItem[];
}

export interface PlanoSalaRow {
  id: string;
  denominacion: string;
  ubicacionLabel: string;
  pdfUrl: string | null;
}

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

/**
 * Todos los tableros y salas de todos los sitios en una sola lista, para
 * bajar el QR o manejar sus archivos sin tener que entrar sitio por sitio
 * a la ficha — ver la nota de la página que la llama.
 */
export function PlanosQrView({ tableros, salas, esAdmin }: { tableros: PlanoTableroRow[]; salas: PlanoSalaRow[]; esAdmin: boolean }) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const tablerosFiltrados = useMemo(
    () => (q ? tableros.filter((t) => `${t.denominacion} ${t.ubicacionLabel} ${t.subsistemasLabel}`.toLowerCase().includes(q)) : tableros),
    [tableros, q],
  );
  const salasFiltradas = useMemo(
    () => (q ? salas.filter((s) => `${s.denominacion} ${s.ubicacionLabel}`.toLowerCase().includes(q)) : salas),
    [salas, q],
  );

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
        <div className="section-label">Tableros ({tablerosFiltrados.length})</div>
        {tablerosFiltrados.length === 0 ? (
          <div className="empty-note">No hay tableros que coincidan con la búsqueda.</div>
        ) : (
          <div className="list-grid">
            {tablerosFiltrados.map((t) => (
              <div className="hist-item" key={t.id}>
                <div className="info">
                  <div className="hist-main">
                    <div className="hist-title">{t.denominacion}</div>
                    <div className="hist-meta">
                      {t.subsistemasLabel} · {t.ubicacionLabel}
                      {t.ultimaFecha ? ` · Última visita: ${fmtFecha(t.ultimaFecha)}` : " · Sin visitas registradas"}
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                      <a className="btn btn-secondary btn-sm" href={`/api/tableros/${t.id}/qr`}>
                        <Icon name="download" size={13} /> Descargar QR
                      </a>
                      <a className="btn btn-secondary btn-sm" href={`/planos/tablero/${t.id}`} target="_blank" rel="noopener noreferrer">
                        <Icon name="eye" size={13} /> Ver plano
                      </a>
                      {t.pdfUrl && (
                        <a className="btn btn-secondary btn-sm" href={t.pdfUrl} target="_blank" rel="noopener noreferrer">
                          PDF última visita
                        </a>
                      )}
                      {t.dxfUrl && (
                        <a className="btn btn-secondary btn-sm" href={t.dxfUrl}>
                          DXF última visita
                        </a>
                      )}
                    </div>
                    <AdjuntosTablero tableroId={t.id} adjuntos={t.adjuntos} esAdmin={esAdmin} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-label">Salas / Shelters ({salasFiltradas.length})</div>
        {salasFiltradas.length === 0 ? (
          <div className="empty-note">No hay salas que coincidan con la búsqueda.</div>
        ) : (
          <div className="list-grid">
            {salasFiltradas.map((s) => (
              <div className="hist-item" key={s.id}>
                <div className="info">
                  <div className="hist-main">
                    <div className="hist-title">{s.denominacion}</div>
                    <div className="hist-meta">{s.ubicacionLabel}</div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                      <a className="btn btn-secondary btn-sm" href={`/api/salas/${s.id}/qr`}>
                        <Icon name="download" size={13} /> Descargar QR
                      </a>
                      <a className="btn btn-secondary btn-sm" href={`/planos/sala/${s.id}`} target="_blank" rel="noopener noreferrer">
                        <Icon name="eye" size={13} /> Ver plano
                      </a>
                      {s.pdfUrl && (
                        <a className="btn btn-secondary btn-sm" href={s.pdfUrl} target="_blank" rel="noopener noreferrer">
                          PDF del alta
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
