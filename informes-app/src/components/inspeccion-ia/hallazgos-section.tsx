"use client";

import type { EstadoChecklist } from "@/lib/database.types";
import { HALLAZGO_ESTADO_LABEL, type HallazgoInspeccionIa } from "@/lib/inspeccion-ia/types";

/**
 * Sección de formulario reusada por los 4 módulos que usan Inspección IA
 * (Tableros, Racks, Equipos Individuales, Torres de Comunicación) — se
 * completa al leer fotos con IA (ver /api/<modulo>/leer-foto); el técnico
 * siempre confirma o corrige cada ítem antes de guardar.
 */
export function HallazgosInspeccionIaSection({
  hallazgos,
  onEstado,
  onComentario,
  disabled,
}: {
  hallazgos: HallazgoInspeccionIa[];
  onEstado: (itemId: string, estado: EstadoChecklist) => void;
  onComentario: (itemId: string, comentario: string) => void;
  disabled?: boolean;
}) {
  if (hallazgos.length === 0) return null;

  return (
    <div className="field">
      <label>
        Inspección IA <span className="opt">(revisá y confirmá)</span>
      </label>
      <div className="hint" style={{ margin: "-2px 0 8px" }}>
        Se completa al leer fotos con IA — confirmá o corregí cada ítem antes de guardar (catálogo editable en Configuración).
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {hallazgos.map((h) => (
          <div
            key={h.itemId}
            style={{
              border: `1px solid ${h.estado === "no_ok" ? "var(--warn)" : "var(--field-border)"}`,
              borderRadius: 8,
              padding: 8,
            }}
          >
            <div style={{ fontSize: 12.5, marginBottom: 6 }}>{h.texto}</div>
            <div style={{ display: "flex", gap: 4, marginBottom: h.comentario ? 6 : 0, flexWrap: "wrap" }}>
              {(Object.keys(HALLAZGO_ESTADO_LABEL) as EstadoChecklist[]).map((estado) => (
                <button
                  key={estado}
                  type="button"
                  className={`btn btn-sm ${h.estado === estado ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => onEstado(h.itemId, estado)}
                  disabled={disabled}
                >
                  {HALLAZGO_ESTADO_LABEL[estado]}
                </button>
              ))}
            </div>
            {h.estado && (
              <input
                type="text"
                placeholder="Comentario (opcional)"
                value={h.comentario}
                onChange={(e) => onComentario(h.itemId, e.target.value)}
                disabled={disabled}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
