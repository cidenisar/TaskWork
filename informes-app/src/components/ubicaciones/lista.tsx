"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import type { Ubicacion } from "./types";

export interface UbicacionRow extends Ubicacion {
  cantTableros: number;
  cantRacks: number;
  cantEquipos: number;
}

export function ListaUbicaciones({ ubicaciones }: { ubicaciones: UbicacionRow[] }) {
  const [query, setQuery] = useState("");

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ubicaciones;
    return ubicaciones.filter((u) =>
      `${u.sitio} ${u.planta ?? ""} ${u.oficina ?? ""} ${u.localidad ?? ""} ${u.provincia} ${u.region}`.toLowerCase().includes(q),
    );
  }, [ubicaciones, query]);

  return (
    <div>
      <div className="page-heading">
        <h1>Ubicaciones</h1>
        <p>Provincia → Sector/Oficina → Sala — abrí una para ver todo el equipamiento relevado en ese lugar.</p>
      </div>

      <div className="card">
        <div className="hint" style={{ margin: "0 0 8px" }}>
          <Icon name="search" size={13} /> Buscá por sala, sector/oficina o provincia...
        </div>
        <input type="text" className="search-box" placeholder="Buscá..." value={query} onChange={(e) => setQuery(e.target.value)} />

        {filtradas.length === 0 ? (
          <div className="empty-note">
            {ubicaciones.length === 0
              ? "Todavía no hay ninguna ubicación cargada — se crean al relevar un tablero, un rack o un equipo."
              : "No se encontraron ubicaciones con esa búsqueda."}
          </div>
        ) : (
          <div>
            {filtradas.map((u) => (
              <Link href={`/ubicaciones/${u.id}`} className="hist-item" key={u.id} style={{ textDecoration: "none", color: "inherit" }}>
                <div className="info">
                  <div className="hist-main">
                    <div className="hist-title">{u.sitio}</div>
                    <div className="hist-meta">
                      {[u.planta, u.localidad, u.provincia, u.region].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
                <div className="hist-actions" style={{ gap: 6 }}>
                  {u.cantTableros > 0 && (
                    <span className="chip">
                      {u.cantTableros} tablero{u.cantTableros === 1 ? "" : "s"}
                    </span>
                  )}
                  {u.cantRacks > 0 && (
                    <span className="chip">
                      {u.cantRacks} rack{u.cantRacks === 1 ? "" : "s"}
                    </span>
                  )}
                  {u.cantEquipos > 0 && (
                    <span className="chip">
                      {u.cantEquipos} equipo{u.cantEquipos === 1 ? "" : "s"}
                    </span>
                  )}
                  {u.cantTableros === 0 && u.cantRacks === 0 && u.cantEquipos === 0 && <span className="chip">Sin equipamiento</span>}
                  <Icon name="chevron-right" size={15} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
