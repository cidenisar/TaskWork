import { estadoVencimiento } from "@/lib/config/fleet-alerts";

const BADGE_LABEL: Record<"ok" | "warn" | "danger", string> = { ok: "Al día", warn: "Próximo a vencer", danger: "Vencido" };
const BADGE_ICON: Record<"ok" | "warn" | "danger", string> = { ok: "🟢", warn: "🟡", danger: "🔴" };

/** Badge 🟢🟡🔴 reutilizado por Vehículos y por "Mis datos" (documentación personal). */
export function VencBadge({ label, fecha }: { label: string; fecha: string | null }) {
  const estado = estadoVencimiento(fecha);
  if (!estado) return <span className="venc-badge">{label}: sin cargar</span>;
  return (
    <span className={`venc-badge ${estado}`}>
      {BADGE_ICON[estado]} {label}: {BADGE_LABEL[estado]}
    </span>
  );
}
