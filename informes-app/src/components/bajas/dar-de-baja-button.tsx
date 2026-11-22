"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { darDeBajaAction } from "@/app/(app)/ubicaciones/actions";
import { MOTIVO_BAJA_OPCIONES, MOTIVO_BAJA_LABEL } from "./types";
import type { MotivoBaja, TipoEquipoBaja } from "@/lib/database.types";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Botón "Dar de baja" para una fila de equipamiento (tablero, rack o
 * equipo individual) en la ficha de Sitio — self-contained, sin estado
 * compartido con el resto de la página: un modal chico pide motivo/fecha/
 * comentario y, al confirmar, genera el comprobante y sacá el equipo de
 * la lista de activos. Elegido en vez de una fila expandible dentro de la
 * tabla porque estas tablas ya tienen 9-11 columnas — un formulario dentro
 * de una celda quedaría apretado en cualquier pantalla.
 */
export function DarDeBajaButton({
  tipoEquipo,
  equipoId,
  equipoTexto,
}: {
  tipoEquipo: TipoEquipoBaja;
  equipoId: string;
  equipoTexto: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState<MotivoBaja>("rotura");
  const [comentario, setComentario] = useState("");
  const [fecha, setFecha] = useState(hoyISO);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cerrar() {
    if (busy) return;
    setOpen(false);
    setMotivo("rotura");
    setComentario("");
    setFecha(hoyISO());
    setError(null);
  }

  async function confirmar() {
    setBusy(true);
    setError(null);
    const res = await darDeBajaAction({ tipoEquipo, equipoId, motivo, comentario, fecha });
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo dar de baja el equipo.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="icon-btn" title="Dar de baja" onClick={() => setOpen(true)}>
        <Icon name="box" size={15} />
      </button>
      {open && (
        <div className="modal-overlay" onClick={cerrar}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="section-label" style={{ marginBottom: 4 }}>
              Dar de baja
            </div>
            <p className="hint" style={{ margin: "0 0 14px" }}>
              {equipoTexto}
            </p>

            <div className="field">
              <label>Motivo</label>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoBaja)} disabled={busy}>
                {MOTIVO_BAJA_OPCIONES.map((m) => (
                  <option key={m} value={m}>
                    {MOTIVO_BAJA_LABEL[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={busy} />
            </div>
            <div className="field">
              <label>
                Comentario <span className="opt">(opcional)</span>
              </label>
              <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} disabled={busy} rows={2} />
            </div>

            {error && <div className="error-text">{error}</div>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={cerrar} disabled={busy}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={confirmar} disabled={busy}>
                {busy ? "Generando..." : "Confirmar baja"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
