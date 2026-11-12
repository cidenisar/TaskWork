"use client";

import { useState } from "react";
import type { EstimarConsumoResult } from "@/app/(app)/ubicaciones/actions";
import { Icon } from "@/components/icon";

/**
 * Backfill de "Consumo estimado (IA)" para equipamiento que ya estaba
 * relevado antes de que existiera este campo — mismo criterio que
 * `VerPdfLink`: la acción pesada se dispara al tocar el botón, con su
 * propio estado de carga/resultado, en vez de correr sola al cargar la
 * página.
 */
export function EstimarConsumoButton({ accion }: { accion: () => Promise<EstimarConsumoResult> }) {
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  async function ejecutar() {
    setBusy(true);
    setResultado(null);
    const res = await accion();
    setBusy(false);
    if (!res.success) {
      setResultado(res.error || "No se pudo estimar el consumo.");
      return;
    }
    const estimados = res.estimados ?? 0;
    const sinDato = res.sinDato ?? 0;
    if (estimados === 0 && sinDato === 0) {
      setResultado("Ya estaba todo estimado.");
    } else {
      setResultado(
        `${estimados} ítem${estimados === 1 ? "" : "s"} estimado${estimados === 1 ? "" : "s"}` +
          (sinDato > 0 ? ` — ${sinDato} sin marca/modelo reconocible, sin estimar.` : "."),
      );
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button
        type="button"
        className="hint"
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", display: "inline-flex", alignItems: "center", gap: 4 }}
        onClick={() => void ejecutar()}
        disabled={busy}
      >
        <Icon name="ai" size={13} /> {busy ? "Estimando con IA..." : "Estimar consumo de lo que falta"}
      </button>
      {resultado && <span className="hint">{resultado}</span>}
    </div>
  );
}
