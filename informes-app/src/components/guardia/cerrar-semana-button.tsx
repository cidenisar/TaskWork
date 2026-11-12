"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cerrarSemanaAction } from "@/app/panel/guardia/liquidacion/actions";
import { Icon } from "@/components/icon";

export function CerrarSemanaButton({ semanaInicio }: { semanaInicio: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cerrar() {
    if (!window.confirm("¿Cerrar esta semana? Queda congelada: aunque después cambien los parámetros, este resultado no se va a recalcular.")) return;
    setBusy(true);
    setError(null);
    const res = await cerrarSemanaAction(semanaInicio);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo cerrar la semana.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={cerrar} disabled={busy}>
        <Icon name="lock" size={13} /> {busy ? "Cerrando..." : "Cerrar semana"}
      </button>
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
