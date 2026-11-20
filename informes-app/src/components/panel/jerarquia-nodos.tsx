import Link from "next/link";
import { Icon } from "@/components/icon";
import { aQuery, type FiltrosJerarquia, type NodoJerarquia } from "@/lib/panel/jerarquia";

const LABEL_NIVEL: Record<string, string> = {
  region: "zona",
  provincia: "provincia",
  localidad: "localidad",
  sitio: "sitio",
};

/** Lista de nodos de un nivel de la jerarquía (región/provincia/localidad/sitio) — cada uno agrega todo lo que cuelga debajo y lleva al nivel siguiente. */
export function JerarquiaNodos({
  nodos,
  filtrosBase,
  paramSiguiente,
}: {
  nodos: NodoJerarquia[];
  filtrosBase: FiltrosJerarquia;
  paramSiguiente: keyof FiltrosJerarquia;
}) {
  if (nodos.length === 0) {
    return <div className="empty-note">No hay equipamiento cargado en ninguna {LABEL_NIVEL[paramSiguiente]} de acá.</div>;
  }
  return (
    <div className="item-list">
      {nodos.map((n) => (
        <Link
          key={n.nombre}
          href={{ pathname: "/panel", query: aQuery({ ...filtrosBase, [paramSiguiente]: n.nombre }) }}
          className="list-item"
          style={{ flexDirection: "column", alignItems: "stretch", gap: 6, textDecoration: "none", color: "inherit" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div className="item-name">{n.nombre}</div>
            <Icon name="chevron-right" size={14} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 12.5 }}>
            <span className="venc-badge">
              {n.cantidadSitios} sitio{n.cantidadSitios === 1 ? "" : "s"}
            </span>
            <span className="venc-badge">{n.cantidadEquipamiento} equipos</span>
            {n.mantenimientoVencidos > 0 && (
              <span className="venc-badge danger">
                <Icon name="warning" size={11} /> {n.mantenimientoVencidos} vencido{n.mantenimientoVencidos === 1 ? "" : "s"}
              </span>
            )}
            {n.consumoW != null && (
              <span className="item-sub">Consumo estimado: {Math.round(n.consumoW).toLocaleString("es-AR")} W</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
