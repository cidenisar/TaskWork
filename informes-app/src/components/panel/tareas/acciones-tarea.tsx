"use client";

import { useState } from "react";
import { cerrarTareaAction, reabrirTareaAction } from "@/app/panel/tareas/actions";
import { MOTIVO_CIERRE_LABEL } from "@/lib/tareas/puro";
import type { MotivoCierreTarea } from "@/lib/database.types";

const MOTIVOS_BAJA: MotivoCierreTarea[] = ["equipo_dado_de_baja", "ya_no_aplica", "duplicada"];

/** Botones de una tarea: abierta → Resolver / Dar de baja (con motivo y comentario); cerrada → Reabrir. */
export function AccionesTarea({ id, abierta }: { id: string; abierta: boolean }) {
  const [modo, setModo] = useState<null | "resolver" | "baja">(null);
  const [motivo, setMotivo] = useState<MotivoCierreTarea>("ya_no_aplica");
  const [comentario, setComentario] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function correr(accion: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    try {
      const res = await accion();
      if (!res.success) setError(res.error ?? "No se pudo guardar.");
      else {
        setModo(null);
        setComentario("");
      }
    } catch {
      setError("No se pudo guardar — probá de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  if (!abierta) {
    return (
      <div className="tarea-acciones">
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => correr(() => reabrirTareaAction(id))}>
          Reabrir
        </button>
        {error && <div className="error-text">{error}</div>}
      </div>
    );
  }

  return (
    <div className="tarea-acciones">
      {modo === null ? (
        <>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setModo("resolver")}>
            Resolver
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setModo("baja")}>
            Dar de baja
          </button>
        </>
      ) : (
        <div className="tarea-cierre">
          {modo === "baja" && (
            <select value={motivo} onChange={(e) => setMotivo(e.target.value as MotivoCierreTarea)} disabled={busy} aria-label="Motivo de la baja">
              {MOTIVOS_BAJA.map((m) => (
                <option key={m} value={m}>
                  {MOTIVO_CIERRE_LABEL[m]}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Comentario (opcional)"
            disabled={busy}
            aria-label="Comentario"
          />
          <div className="tarea-cierre-botones">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => correr(() => cerrarTareaAction(id, modo, motivo, comentario))}>
              {busy ? "Guardando…" : modo === "resolver" ? "Confirmar: resuelta" : "Confirmar baja"}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setModo(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}
