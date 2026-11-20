"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { entregarEquipoADepositoAction } from "@/app/(app)/ubicaciones/actions";
import { MOTIVO_ENTREGA_OPCIONES, MOTIVO_ENTREGA_LABEL, CONDICION_OPCIONES, CONDICION_LABEL } from "./types";
import type { CondicionMaterial, MotivoEntregaDeposito, TipoEquipoBaja } from "@/lib/database.types";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Botón "Entregar a depósito" para una fila de equipamiento ya cargado en
 * un sitio — mismo modal self-contained que DarDeBajaButton (de donde se
 * copió la estructura), pero para el caso en que el equipo vuelve nuevo o
 * usado-funcional, no roto/obsoleto.
 */
export function EntregarADepositoButton({
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
  const [condicion, setCondicion] = useState<CondicionMaterial>("usado_funcional");
  const [motivo, setMotivo] = useState<MotivoEntregaDeposito>("reemplazo_funcional");
  const [comentario, setComentario] = useState("");
  const [fecha, setFecha] = useState(hoyISO);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cerrar() {
    if (busy) return;
    setOpen(false);
    setCondicion("usado_funcional");
    setMotivo("reemplazo_funcional");
    setComentario("");
    setFecha(hoyISO());
    setError(null);
  }

  async function confirmar() {
    setBusy(true);
    setError(null);
    const res = await entregarEquipoADepositoAction({ tipoEquipo, equipoId, condicion, motivo, comentario, fecha });
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo entregar el equipo a depósito.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="icon-btn" title="Entregar a depósito" onClick={() => setOpen(true)}>
        <Icon name="truck" size={15} />
      </button>
      {open && (
        <div className="modal-overlay" onClick={cerrar}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="section-label" style={{ marginBottom: 4 }}>
              Entregar a depósito
            </div>
            <p className="hint" style={{ margin: "0 0 14px" }}>
              {equipoTexto}
            </p>

            <div className="field">
              <label>Condición</label>
              <select value={condicion} onChange={(e) => setCondicion(e.target.value as CondicionMaterial)} disabled={busy}>
                {CONDICION_OPCIONES.map((c) => (
                  <option key={c} value={c}>
                    {CONDICION_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Motivo</label>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoEntregaDeposito)} disabled={busy}>
                {MOTIVO_ENTREGA_OPCIONES.map((m) => (
                  <option key={m} value={m}>
                    {MOTIVO_ENTREGA_LABEL[m]}
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
                {busy ? "Generando..." : "Confirmar entrega"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
