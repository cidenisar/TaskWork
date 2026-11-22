"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { actualizarEstadoViajeAction } from "@/app/(app)/riesgo-viaje/actions";

/**
 * Marca un viaje como finalizado ("ya llegó") desde cualquier estado, sin pasar
 * por los pasos intermedios. Pide confirmación porque cierra el seguimiento.
 * La acción valida quién puede (quien lo cargó, o Admin/Supervisor/Superusuario).
 */
export function CerrarViajeButton({ evaluacionId, label = "Marcar llegada", onCerrado }: { evaluacionId: string; label?: string; onCerrado?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cerrar() {
    if (!window.confirm("¿Confirmás que este viaje ya llegó a destino? Se va a marcar como finalizado.")) return;
    setBusy(true);
    setError(null);
    const res = await actualizarEstadoViajeAction(evaluacionId, "cerrar");
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo cerrar el viaje.");
      return;
    }
    onCerrado?.();
    router.refresh();
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2, alignItems: "flex-end" }}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={cerrar} disabled={busy}>
        {busy ? "Cerrando..." : label}
      </button>
      {error && <span className="error-text" style={{ fontSize: 11 }}>{error}</span>}
    </span>
  );
}
