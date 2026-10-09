"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { programarMantenimientoAction } from "@/app/(app)/ubicaciones/actions";
import type { TipoEquipoBaja } from "@/lib/database.types";

/**
 * Botón "Programar mantenimiento" para una fila de equipamiento (Rack o
 * Equipo Individual) en la ficha de Sitio — fija a mano una fecha futura
 * (y opcionalmente quién la va a hacer), para cuando la visita real no
 * coincide con lo que da el cálculo del intervalo (ver
 * `lib/mantenimiento/types.ts`). Mismo patrón modal self-contained que
 * RegistrarMantenimientoButton, sin gate de rol — es planificación de
 * campo normal.
 */
export function ProgramarMantenimientoButton({
  tipoEquipo,
  equipoId,
  equipoTexto,
  tecnicos,
  programacionActual,
}: {
  tipoEquipo: TipoEquipoBaja;
  equipoId: string;
  equipoTexto: string;
  tecnicos: { id: string; nombreCompleto: string }[];
  programacionActual: { fechaProgramada: string; asignadoA: string | null; nota: string | null } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fecha, setFecha] = useState(programacionActual?.fechaProgramada ?? "");
  const [asignadoA, setAsignadoA] = useState(programacionActual?.asignadoA ?? "");
  const [nota, setNota] = useState(programacionActual?.nota ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cerrar() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  async function confirmar() {
    if (!fecha) {
      setError("Falta la fecha programada.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await programarMantenimientoAction({
      tipoEquipo,
      equipoId,
      fechaProgramada: fecha,
      asignadoA: asignadoA || null,
      nota,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo guardar la programación.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="icon-btn" title="Programar mantenimiento" onClick={() => setOpen(true)}>
        <Icon name="calendar" size={15} />
      </button>
      {open && (
        <div className="modal-overlay" onClick={cerrar}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="section-label" style={{ marginBottom: 4 }}>
              Programar mantenimiento
            </div>
            <p className="hint" style={{ margin: "0 0 14px" }}>
              {equipoTexto}
            </p>

            <div className="field">
              <label>Fecha programada</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={busy} />
            </div>
            <div className="field">
              <label>
                Técnico asignado <span className="opt">(opcional)</span>
              </label>
              <select value={asignadoA} onChange={(e) => setAsignadoA(e.target.value)} disabled={busy}>
                <option value="">Sin asignar</option>
                {tecnicos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombreCompleto}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>
                Nota <span className="opt">(opcional)</span>
              </label>
              <textarea value={nota} onChange={(e) => setNota(e.target.value)} disabled={busy} rows={2} />
            </div>

            {error && <div className="error-text">{error}</div>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={cerrar} disabled={busy}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={confirmar} disabled={busy}>
                {busy ? "Guardando..." : "Guardar programación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
