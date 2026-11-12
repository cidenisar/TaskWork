"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { guardarLargoTramoTorreAction } from "@/app/(app)/configuracion/actions/torre-tramos";
import { TIPO_TORRE_LABEL } from "@/components/torres-comunicacion/types";
import type { TorreTipo } from "@/lib/database.types";

export interface TramoTorreItem {
  tipoTorre: TorreTipo;
  largoTramoM: number | null;
}

const TIPOS_CONFIGURABLES: TorreTipo[] = ["autosoportada", "arriostrada", "monopole"];

export function TorreTramosTab({
  tramos,
  setTramos,
}: {
  tramos: TramoTorreItem[];
  setTramos: Dispatch<SetStateAction<TramoTorreItem[]>>;
}) {
  const [valores, setValores] = useState<Record<TorreTipo, string>>(() => {
    const init = {} as Record<TorreTipo, string>;
    for (const t of TIPOS_CONFIGURABLES) {
      init[t] = tramos.find((x) => x.tipoTorre === t)?.largoTramoM?.toString() ?? "";
    }
    return init;
  });
  const [busy, setBusy] = useState<TorreTipo | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function guardar(tipoTorre: TorreTipo) {
    setBusy(tipoTorre);
    setError(null);
    const res = await guardarLargoTramoTorreAction(tipoTorre, valores[tipoTorre]);
    setBusy(null);
    if (!res.success) {
      setError(res.error || "No se pudo guardar.");
      return;
    }
    const largo = valores[tipoTorre].trim() === "" ? null : Number(valores[tipoTorre]);
    setTramos((prev) => {
      const sinEste = prev.filter((x) => x.tipoTorre !== tipoTorre);
      return largo === null ? sinEste : [...sinEste, { tipoTorre, largoTramoM: largo }];
    });
  }

  return (
    <div>
      <div className="hint" style={{ margin: "0 0 10px" }}>
        Largo de tramo (en metros) de cada tipo de torre de comunicaciones — se usa para estimar la altura de una torre por conteo de
        tramos en las fotos del relevamiento (altura ≈ tramos contados × este largo). Dejá el campo vacío y guardá para quitar la
        estimación de ese tipo.
      </div>
      <div className="item-list">
        {TIPOS_CONFIGURABLES.map((tipo) => (
          <div className="list-item" key={tipo}>
            <div className="info">
              <div>
                <div className="item-name">{TIPO_TORRE_LABEL[tipo]}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Ej: 6"
                value={valores[tipo]}
                onChange={(e) => setValores((prev) => ({ ...prev, [tipo]: e.target.value }))}
                disabled={busy === tipo}
                style={{ width: 90 }}
              />
              <span className="item-sub">m</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => guardar(tipo)} disabled={busy === tipo}>
                {busy === tipo ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        ))}
      </div>
      {error && (
        <div className="error-text" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
    </div>
  );
}
