"use client";

import { useState } from "react";
import { obtenerUrlPdfBajaAction } from "@/app/(app)/bajas/historial/actions";
import { Icon } from "@/components/icon";

/** Botón de descarga de un comprobante de baja individual — misma lógica que el de Historial de Bajas, para usar en la ficha de Sitio sin traer el resto de esa pantalla. */
export function DescargarBajaBoton({ bajaId, numeroGeneracion }: { bajaId: string; numeroGeneracion: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function descargar() {
    setBusy(true);
    setError(null);
    const res = await obtenerUrlPdfBajaAction(bajaId);
    setBusy(false);
    if (!res.url) {
      setError(res.error || "No se pudo abrir el PDF.");
      return;
    }
    const blob = await fetch(res.url).then((r) => r.blob());
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = res.filename || `${numeroGeneracion}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  }

  return (
    <>
      <button type="button" className="icon-btn" title="Descargar comprobante" disabled={busy} onClick={descargar}>
        {busy ? "…" : <Icon name="download" size={15} />}
      </button>
      {error && <div className="hint" style={{ color: "var(--warn)" }}>{error}</div>}
    </>
  );
}
