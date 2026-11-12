"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cerrarPeriodoAction } from "@/app/panel/guardia/liquidacion/actions";
import { Icon } from "@/components/icon";

export function CerrarPeriodoButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cerrar() {
    if (!window.confirm("¿Cerrar este período? Queda congelado: aunque después cambien los parámetros, este resultado no se va a recalcular.")) return;
    setBusy(true);
    setError(null);
    const res = await cerrarPeriodoAction();
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo cerrar el período.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button type="button" className="btn btn-primary btn-sm" onClick={cerrar} disabled={busy}>
        <Icon name="lock" size={13} /> {busy ? "Cerrando..." : "Cerrar período"}
      </button>
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
