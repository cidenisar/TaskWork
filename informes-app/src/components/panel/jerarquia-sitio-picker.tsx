import Link from "next/link";
import { aQuery, type FiltrosJerarquia } from "@/lib/panel/jerarquia";
import type { PanelSitioResumen } from "@/lib/panel/overview";

/** Cuando un mismo "sitio" tiene más de una Ubicación cargada (varias plantas/oficinas del mismo complejo) — hay que elegir cuál ver. */
export function JerarquiaSitioPicker({ sitios, filtros }: { sitios: PanelSitioResumen[]; filtros: FiltrosJerarquia }) {
  return (
    <div>
      <div className="hint" style={{ margin: "0 0 10px" }}>
        Este sitio tiene más de un lugar relevado — elegí cuál ver.
      </div>
      <div className="item-list">
        {sitios.map((s) => (
          <Link
            key={s.id}
            href={{ pathname: "/panel", query: { ...aQuery(filtros), id: s.id } }}
            className="list-item"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div className="item-name">{s.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
