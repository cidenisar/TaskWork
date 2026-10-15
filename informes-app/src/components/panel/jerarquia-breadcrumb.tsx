import Link from "next/link";
import { Icon } from "@/components/icon";
import { aQuery, type FiltrosJerarquia } from "@/lib/panel/jerarquia";

const NIVELES: (keyof FiltrosJerarquia)[] = ["region", "provincia", "localidad", "sitio"];

export function JerarquiaBreadcrumb({ filtros }: { filtros: FiltrosJerarquia }) {
  const crumbs: { label: string; filtros: FiltrosJerarquia }[] = [{ label: "Todas las zonas", filtros: {} }];
  let acumulado: FiltrosJerarquia = {};
  for (const nivel of NIVELES) {
    const valor = filtros[nivel];
    if (!valor) break;
    acumulado = { ...acumulado, [nivel]: valor };
    crumbs.push({ label: valor, filtros: acumulado });
  }
  const anterior = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
      {anterior && (
        <Link href={{ pathname: "/panel", query: aQuery(anterior.filtros) }} className="btn btn-secondary btn-sm">
          <Icon name="chevron-left" size={14} /> Volver
        </Link>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", fontSize: 13 }}>
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {i > 0 && <span style={{ opacity: 0.5 }}>›</span>}
            {i === crumbs.length - 1 ? (
              <b>{c.label}</b>
            ) : (
              <Link href={{ pathname: "/panel", query: aQuery(c.filtros) }} style={{ color: "var(--accent)" }}>
                {c.label}
              </Link>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
