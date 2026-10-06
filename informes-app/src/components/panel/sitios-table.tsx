"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import type { PanelSitioResumen } from "@/lib/panel/overview";

const MODULOS_COLUMNAS = ["Tableros", "Racks", "Torres", "Equipos Individuales"];

export function SitiosTable({ sitios }: { sitios: PanelSitioResumen[] }) {
  const [query, setQuery] = useState("");

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sitios;
    return sitios.filter((s) => `${s.label} ${s.provincia}`.toLowerCase().includes(q));
  }, [sitios, query]);

  return (
    <>
      <div className="hint" style={{ margin: "0 0 10px" }}>
        <Icon name="search" size={13} /> Buscá por sitio o provincia...
      </div>
      <input
        type="text"
        className="search-box"
        placeholder="Buscá..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      {filtrados.length === 0 ? (
        <div className="empty-note">No se encontraron sitios con esa búsqueda.</div>
      ) : (
        <div className="detalle-table-wrap" style={{ padding: 0 }}>
          <table className="detalle-table">
            <thead>
              <tr>
                <th>Sitio</th>
                <th>Provincia</th>
                {MODULOS_COLUMNAS.map((m) => (
                  <th key={m} style={{ textAlign: "right" }}>
                    {m}
                  </th>
                ))}
                <th style={{ textAlign: "right" }}>Equipos</th>
                <th style={{ textAlign: "right" }}>Consumo estimado (W)</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((s) => (
                <tr key={s.id}>
                  <td>{s.label}</td>
                  <td>{s.provincia}</td>
                  {MODULOS_COLUMNAS.map((m) => (
                    <td key={m} style={{ textAlign: "right" }}>
                      {s.porModulo[m] ?? "—"}
                    </td>
                  ))}
                  <td style={{ textAlign: "right" }}>{s.total}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>
                    {s.consumoW != null ? s.consumoW.toLocaleString("es-AR") : "—"}
                    {s.equiposSinConsumo > 0 && (
                      <span style={{ fontWeight: 400, color: "var(--text-faint)", marginLeft: 4 }}>
                        (+{s.equiposSinConsumo} sin estimar)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
