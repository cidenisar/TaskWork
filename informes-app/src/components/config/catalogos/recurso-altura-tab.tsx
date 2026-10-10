"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { guardarRecursoAlturaAction } from "@/app/(app)/configuracion/actions/recurso-altura";
import { TIPO_MONTAJE_OPCIONES, TIPO_MONTAJE_LABEL, RECURSO_ALTURA_OPCIONES, RECURSO_ALTURA_LABEL } from "@/lib/equipos/recurso-altura";
import type { TipoMontajeCamara, RecursoAlturaMantenimiento } from "@/lib/database.types";

export interface RecursoAlturaItem {
  tipoMontaje: TipoMontajeCamara;
  recursoFijo: RecursoAlturaMantenimiento | null;
  umbralEscaleraM: number | null;
}

/**
 * Qué recurso hace falta para el mantenimiento de una cámara/domo según
 * dónde está montada (Equipos Individuales → Montaje, al relevarla) — ver
 * `lib/equipos/recurso-altura.ts`. Una fila fija por tipo de montaje,
 * mismo patrón que TorreTramosTab/mantenimiento_intervalos: "Recurso fijo"
 * ignora la altura (torre → siempre Grupo de altura); dejándolo en "Según
 * altura" se usa el umbral de Escalera para decidir entre Escalera y
 * Andamio/Manlift.
 */
export function RecursoAlturaTab({
  items,
  setItems,
}: {
  items: RecursoAlturaItem[];
  setItems: Dispatch<SetStateAction<RecursoAlturaItem[]>>;
}) {
  const [recursoFijo, setRecursoFijo] = useState<Record<TipoMontajeCamara, RecursoAlturaMantenimiento | "">>(() => {
    const init = {} as Record<TipoMontajeCamara, RecursoAlturaMantenimiento | "">;
    for (const t of TIPO_MONTAJE_OPCIONES) init[t] = items.find((x) => x.tipoMontaje === t)?.recursoFijo ?? "";
    return init;
  });
  const [umbral, setUmbral] = useState<Record<TipoMontajeCamara, string>>(() => {
    const init = {} as Record<TipoMontajeCamara, string>;
    for (const t of TIPO_MONTAJE_OPCIONES) init[t] = items.find((x) => x.tipoMontaje === t)?.umbralEscaleraM?.toString() ?? "";
    return init;
  });
  const [busy, setBusy] = useState<TipoMontajeCamara | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function guardar(tipoMontaje: TipoMontajeCamara) {
    setBusy(tipoMontaje);
    setError(null);
    const res = await guardarRecursoAlturaAction(tipoMontaje, recursoFijo[tipoMontaje], umbral[tipoMontaje]);
    setBusy(null);
    if (!res.success) {
      setError(res.error || "No se pudo guardar.");
      return;
    }
    const fijo = recursoFijo[tipoMontaje] || null;
    const u = fijo || umbral[tipoMontaje].trim() === "" ? null : Number(umbral[tipoMontaje]);
    setItems((prev) => [...prev.filter((x) => x.tipoMontaje !== tipoMontaje), { tipoMontaje, recursoFijo: fijo, umbralEscaleraM: u }]);
  }

  return (
    <div>
      <div className="hint" style={{ margin: "0 0 10px" }}>
        Qué recurso hace falta para hacer el mantenimiento de una cámara/domo, según dónde está montada — se completa junto con la altura
        al relevar el equipo en Equipos Individuales. &ldquo;Recurso fijo&rdquo; ignora la altura (ej. Torre siempre necesita el grupo de
        altura); dejándolo en &ldquo;Según altura&rdquo; se usa el umbral de Escalera para decidir entre Escalera y Andamio/Manlift.
      </div>
      <div className="item-list">
        {TIPO_MONTAJE_OPCIONES.map((tipo) => (
          <div className="list-item" key={tipo} style={{ flexWrap: "wrap", gap: 8 }}>
            <div className="info">
              <div>
                <div className="item-name">{TIPO_MONTAJE_LABEL[tipo]}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={recursoFijo[tipo]}
                onChange={(e) => setRecursoFijo((prev) => ({ ...prev, [tipo]: e.target.value as RecursoAlturaMantenimiento | "" }))}
                disabled={busy === tipo}
                style={{ width: 160 }}
              >
                <option value="">Según altura</option>
                {RECURSO_ALTURA_OPCIONES.map((r) => (
                  <option key={r} value={r}>
                    Siempre: {RECURSO_ALTURA_LABEL[r]}
                  </option>
                ))}
              </select>
              {!recursoFijo[tipo] && (
                <>
                  <span className="item-sub">Hasta</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Ej: 4"
                    value={umbral[tipo]}
                    onChange={(e) => setUmbral((prev) => ({ ...prev, [tipo]: e.target.value }))}
                    disabled={busy === tipo}
                    style={{ width: 70 }}
                  />
                  <span className="item-sub">m → Escalera, más alto → Andamio/Manlift</span>
                </>
              )}
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
