import { StatusDot } from "@/components/icon";
import type { EstadoViaje, NivelRiesgoViaje } from "@/lib/database.types";

const NIVEL_TONO: Record<NivelRiesgoViaje, "ok" | "warn" | "danger"> = { bajo: "ok", medio: "warn", alto: "danger" };
const NIVEL_LABEL: Record<NivelRiesgoViaje, string> = { bajo: "Riesgo bajo", medio: "Riesgo medio", alto: "Riesgo alto" };

/** Mismo criterio visual que VencBadge (ok/warn/danger) — acá mapeado al semáforo de la Evaluación de Riesgo del Viaje. */
export function RiesgoBadge({ nivel, total }: { nivel: NivelRiesgoViaje; total: number }) {
  const tono = NIVEL_TONO[nivel];
  return (
    <span className={`venc-badge ${tono}`}>
      <StatusDot tone={tono} /> {NIVEL_LABEL[nivel]} ({total})
    </span>
  );
}

const ESTADO_LABEL: Record<EstadoViaje, string> = {
  pendiente: "Sin iniciar",
  iniciado: "En viaje",
  en_punto_medio: "En punto medio",
  finalizado: "Finalizado",
};

export function EstadoViajeBadge({ estado }: { estado: EstadoViaje }) {
  const tono = estado === "finalizado" ? "ok" : estado === "pendiente" ? "warn" : "ok";
  return (
    <span className={`venc-badge ${tono}`}>
      <StatusDot tone={tono} /> {ESTADO_LABEL[estado]}
    </span>
  );
}
