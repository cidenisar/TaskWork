"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import {
  eliminarEquipoDefinitivoAction,
  resumenEliminarEquipoAction,
  type ResumenEliminarEquipo,
} from "@/app/(app)/ubicaciones/eliminar-equipo-actions";

/**
 * Botón "Eliminar definitivamente" para un equipo individual en la ficha
 * del sitio (solo Administrador). A diferencia de "Dar de baja", la fila
 * desaparece: sirve para corregir una carga errónea o repetir pruebas.
 * Al abrir, muestra qué tiene colgado el equipo para que se decida con
 * los datos a la vista.
 */
export function EliminarEquipoButton({ equipoId, equipoTexto }: { equipoId: string; equipoTexto: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [resumen, setResumen] = useState<ResumenEliminarEquipo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function abrir() {
    setOpen(true);
    setError(null);
    setResumen(null);
    const res = await resumenEliminarEquipoAction(equipoId);
    if (res.success && res.resumen) setResumen(res.resumen);
    else setError(res.error || "No se pudo leer lo que tiene asociado el equipo.");
  }

  function cerrar() {
    if (busy) return;
    setOpen(false);
  }

  async function confirmar() {
    setBusy(true);
    setError(null);
    const res = await eliminarEquipoDefinitivoAction(equipoId);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo eliminar el equipo.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  const lineas: string[] = [];
  if (resumen) {
    if (resumen.mantenimientos > 0) lineas.push(`${resumen.mantenimientos} mantenimiento(s) registrado(s) — se borran con su foto y PDF`);
    if (resumen.programaciones > 0) lineas.push("su programación de mantenimiento — se borra");
    if (resumen.lecturasRelevamiento > 0) lineas.push(`${resumen.lecturasRelevamiento} lectura(s) de relevamientos — se borran`);
    if (resumen.tareasVinculadas > 0) lineas.push(`${resumen.tareasVinculadas} tarea(s) pendiente(s) — quedan sin equipo vinculado`);
    if (resumen.materialesDeInforme > 0) lineas.push(`${resumen.materialesDeInforme} línea(s) de materiales de informes — quedan sin equipo vinculado`);
  }
  const conservados: string[] = [];
  if (resumen) {
    if (resumen.bajas > 0) conservados.push(`${resumen.bajas} baja(s)`);
    if (resumen.entregasDeposito > 0) conservados.push(`${resumen.entregasDeposito} entrega(s) a depósito`);
  }

  return (
    <>
      <button type="button" className="icon-btn icon-btn-danger" title="Eliminar definitivamente" onClick={abrir}>
        <Icon name="trash" size={15} />
      </button>
      {open && (
        <div className="modal-overlay" onClick={cerrar}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="section-label" style={{ marginBottom: 4 }}>
              Eliminar definitivamente
            </div>
            <p className="hint" style={{ margin: "0 0 12px" }}>
              {equipoTexto}
            </p>

            <p style={{ margin: "0 0 10px", fontSize: 14 }}>
              El equipo se borra de verdad (no queda como baja) y <strong>no se puede deshacer</strong>. Después lo podés volver a cargar.
            </p>

            {!resumen && !error && <p className="hint">Revisando qué tiene asociado…</p>}
            {resumen && lineas.length > 0 && (
              <>
                <div className="hint" style={{ marginBottom: 4 }}>
                  Lo que tiene asociado:
                </div>
                <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 13 }}>
                  {lineas.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </>
            )}
            {resumen && lineas.length === 0 && <p className="hint">No tiene nada más asociado.</p>}
            {conservados.length > 0 && (
              <p className="hint" style={{ margin: "0 0 10px" }}>
                Se conservan como comprobantes: {conservados.join(" y ")}.
              </p>
            )}

            {error && <div className="error-text">{error}</div>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={cerrar} disabled={busy}>
                Cancelar
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={confirmar} disabled={busy || !resumen}>
                {busy ? "Eliminando..." : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
