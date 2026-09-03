import { estadoVencimiento } from "@/lib/config/fleet-alerts";
import { StatusDot } from "@/components/icon";

const BADGE_LABEL: Record<"ok" | "warn" | "danger", string> = { ok: "Al día", warn: "Próximo a vencer", danger: "Vencido" };

/** Badge de estado reutilizado por Vehículos y por "Mis datos" (documentación personal). */
export function VencBadge({ label, fecha }: { label: string; fecha: string | null }) {
  const estado = estadoVencimiento(fecha);
  if (!estado) return <span className="venc-badge">{label}: sin cargar</span>;
  return (
    <span className={`venc-badge ${estado}`}>
      <StatusDot tone={estado} /> {label}: {BADGE_LABEL[estado]}
    </span>
  );
}
