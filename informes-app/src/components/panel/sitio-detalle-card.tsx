import Link from "next/link";
import { Icon } from "@/components/icon";
import { fmtVisitaRelativa } from "@/lib/panel/format";
import type { PanelSitioResumen } from "@/lib/panel/overview";

const URGENCIA_CLASE: Record<string, string> = {
  vencido: "danger",
  nunca: "danger",
  proximo: "warn",
  ok: "",
};

/** Detalle del nivel final de la jerarquía — un sitio concreto (una Ubicación puntual) con su equipamiento y estado. */
export function SitioDetalleCard({ sitio }: { sitio: PanelSitioResumen }) {
  const modulos = Object.entries(sitio.porModulo).filter(([, cantidad]) => cantidad > 0);

  return (
    <div>
      <div className="item-name" style={{ fontSize: 16, marginBottom: 10 }}>
        {sitio.nombreFino}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {modulos.map(([modulo, cantidad]) => (
          <span className="venc-badge" key={modulo}>
            {modulo}: {cantidad}
          </span>
        ))}
      </div>

      {sitio.consumoW != null && (
        <div className="item-sub" style={{ marginBottom: 4 }}>
          Consumo estimado: {Math.round(sitio.consumoW).toLocaleString("es-AR")} W
          {sitio.equiposSinConsumo > 0 &&
            ` (${sitio.equiposSinConsumo} equipo${sitio.equiposSinConsumo === 1 ? "" : "s"} sin estimar)`}
        </div>
      )}

      {sitio.masUrgente && (
        <>
          <div className="item-sub" style={{ marginBottom: 4 }}>
            Última visita: {sitio.ultimaVisita ? fmtVisitaRelativa(sitio.ultimaVisita) : "sin registro"}
          </div>
          <div className={`venc-badge ${URGENCIA_CLASE[sitio.masUrgente.urgencia]}`} style={{ marginBottom: 8 }}>
            <Icon name="warning" size={11} /> {sitio.masUrgente.tipoEquipoLabel} · {sitio.masUrgente.texto}: {sitio.masUrgente.mensaje}
          </div>
        </>
      )}

      <div style={{ marginTop: 8 }}>
        <Link href={`/ubicaciones/${sitio.id}`} className="btn btn-secondary btn-sm">
          Ver ficha completa del sitio
        </Link>
      </div>
    </div>
  );
}
