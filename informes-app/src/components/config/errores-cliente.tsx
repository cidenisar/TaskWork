"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";

export interface ErrorClienteRow {
  id: string;
  mensaje: string;
  contexto: string | null;
  usuarioNombre: string | null;
  usuarioEmail: string | null;
  url: string | null;
  userAgent: string | null;
  stack: string | null;
  createdAt: string;
}

function fmtFechaHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Recorta el user-agent a lo legible (navegador + SO), sin el resto del ruido. */
function fmtDispositivo(ua: string | null) {
  if (!ua) return "Dispositivo desconocido";
  return ua.length > 90 ? ua.slice(0, 90) + "…" : ua;
}

export function ErroresClienteCard({ rows }: { rows: ErrorClienteRow[] }) {
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.mensaje} ${r.contexto ?? ""} ${r.usuarioNombre ?? ""} ${r.usuarioEmail ?? ""} ${r.userAgent ?? ""}`.toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="card">
      <div className="section-label">
        <Icon name="warning" size={13} /> Errores del dispositivo
      </div>
      <div className="hint" style={{ margin: "-4px 0 12px" }}>
        Errores que ocurrieron en el navegador de alguien usando la app — útil para ver qué está
        fallando en un celular o navegador que nosotros no probamos directamente. Se guardan los
        últimos {rows.length === 200 ? "200" : rows.length}.
      </div>
      {rows.length === 0 ? (
        <div className="empty-note">Todavía no se reportó ningún error — buena señal.</div>
      ) : (
        <>
          <input
            type="text"
            className="search-box"
            placeholder="Buscá por mensaje, pantalla o quién lo tuvo..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          {filtered.length === 0 ? (
            <div className="empty-note">Ningún error coincide con esa búsqueda.</div>
          ) : (
            <div className="item-list scroll-list" style={{ marginTop: 0 }}>
              {filtered.map((r) => {
                const expanded = expandedId === r.id;
                return (
                  <div className="list-item" key={r.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : r.id)}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        textAlign: "left",
                        cursor: "pointer",
                        color: "inherit",
                        font: "inherit",
                      }}
                    >
                      <div className="item-name">{r.mensaje}</div>
                      <div className="item-sub">
                        {r.contexto || "sin contexto"} · {r.usuarioNombre || "usuario no identificado"}
                      </div>
                      <div className="audit-meta">
                        {fmtFechaHora(r.createdAt)} · {fmtDispositivo(r.userAgent)}
                      </div>
                    </button>
                    {expanded && (
                      <div className="desc-box" style={{ fontSize: 11, fontFamily: "monospace", whiteSpace: "pre-wrap", marginTop: 4 }}>
                        {r.url && (
                          <div>
                            URL: {r.url}
                          </div>
                        )}
                        {r.usuarioEmail && <div>Usuario: {r.usuarioEmail}</div>}
                        {r.stack ? r.stack : "Sin detalle técnico adicional (stack no disponible)."}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
