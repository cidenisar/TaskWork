"use client";

import { useState } from "react";
import { obtenerUrlPdfEntregaAction } from "@/app/(app)/entregas-deposito/historial/actions";
import { Icon } from "@/components/icon";

/** Botón para ver el comprobante de una entrega a depósito — para usar en la ficha de Sitio sin traer el resto del Historial. */
export function VerComprobanteEntregaBoton({ entregaId }: { entregaId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verComprobante() {
    setBusy(true);
    setError(null);
    const res = await obtenerUrlPdfEntregaAction(entregaId);
    setBusy(false);
    if (!res.url) {
      setError(res.error || "No se pudo abrir el PDF.");
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <button type="button" className="icon-btn" title="Ver comprobante" disabled={busy} onClick={verComprobante}>
        {busy ? "…" : <Icon name="eye" size={15} />}
      </button>
      {error && <div className="hint" style={{ color: "var(--warn)" }}>{error}</div>}
    </>
  );
}
