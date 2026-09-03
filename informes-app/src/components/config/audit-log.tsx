"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";

export interface AuditLogRow {
  id: string;
  actorNombre: string;
  actorRol: string;
  accion: string;
  createdAt: string;
}

function fmtFechaHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AuditLogCard({ rows }: { rows: AuditLogRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.accion} ${r.actorNombre} ${r.actorRol}`.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <div className="card">
      <div className="section-label">
        <Icon name="note" size={13} /> Registro de Cambios
      </div>
      <div className="hint" style={{ margin: "-4px 0 12px" }}>
        Quién modificó qué en Configuración — útil cuando hay más de un Administrador. Se guardan los
        últimos {rows.length === 100 ? "100" : rows.length} cambios.
      </div>
      {rows.length === 0 ? (
        <div className="empty-note">Todavía no hay cambios registrados.</div>
      ) : (
        <>
          <input
            type="text"
            className="search-box"
            placeholder="Buscá por acción o por quién lo hizo..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          {filtered.length === 0 ? (
            <div className="empty-note">Ningún cambio coincide con esa búsqueda.</div>
          ) : (
            <div className="item-list scroll-list" style={{ marginTop: 0 }}>
              {filtered.map((r) => (
                <div className="list-item" key={r.id} style={{ alignItems: "flex-start" }}>
                  <div>
                    <div className="item-name">{r.accion}</div>
                    <div className="item-sub">
                      {r.actorNombre} · {r.actorRol}
                    </div>
                    <div className="audit-meta">{fmtFechaHora(r.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
