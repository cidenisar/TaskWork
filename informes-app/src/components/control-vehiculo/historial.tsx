"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";

export interface ControlVehiculoRow {
  id: string;
  vehiculoPatente: string;
  fecha: string;
  kilometraje: number;
  estadoGeneral: string | null;
  tieneDanios: boolean | null;
  inconsistenciasDetectadas: string | null;
  fotos: string[];
}

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

export function HistorialControlVehiculo({ controles }: { controles: ControlVehiculoRow[] }) {
  const [query, setQuery] = useState("");
  const [galeriaAbierta, setGaleriaAbierta] = useState<Set<string>>(new Set());

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return controles;
    return controles.filter((c) => c.vehiculoPatente.toLowerCase().includes(q));
  }, [controles, query]);

  function toggleGaleria(id: string) {
    setGaleriaAbierta((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Historial — Control de Vehículo</h1>
        <p>Controles periódicos cargados por cualquier técnico</p>
      </div>

      <div className="card">
        <div className="hint" style={{ margin: "0 0 8px" }}>
          <Icon name="search" size={13} /> Buscá por patente...
        </div>
        <input type="text" className="search-box" placeholder="Buscá..." value={query} onChange={(e) => setQuery(e.target.value)} />

        {filtrados.length === 0 ? (
          <div className="empty-note">No se encontraron controles con esa búsqueda.</div>
        ) : (
          <div className="list-grid">
            {filtrados.map((c) => (
              <div className="hist-item" key={c.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                <div className="info">
                  <div className="hist-main">
                    <div className="hist-title">{c.vehiculoPatente}</div>
                    <div className="hist-meta">
                      {fmtFecha(c.fecha)} · {c.kilometraje.toLocaleString("es-AR")} km
                    </div>
                    {c.estadoGeneral && <div className="hist-meta">{c.estadoGeneral}</div>}
                    {c.inconsistenciasDetectadas && (
                      <div className="hist-meta" style={{ color: "var(--warn)" }}>
                        <Icon name="warning" size={11} /> {c.inconsistenciasDetectadas}
                      </div>
                    )}
                  </div>
                </div>
                {c.fotos.length > 0 && (
                  <div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleGaleria(c.id)}>
                      <Icon name="camera" size={11} /> {galeriaAbierta.has(c.id) ? "Ocultar fotos" : `Ver fotos (${c.fotos.length})`}
                    </button>
                    {galeriaAbierta.has(c.id) && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {c.fotos.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal, no apta para el optimizador de next/image */}
                            <img
                              src={url}
                              alt=""
                              style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--field-border)" }}
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
