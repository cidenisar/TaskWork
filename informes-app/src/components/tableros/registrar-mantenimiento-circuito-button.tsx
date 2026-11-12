"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { crearMantenimientoAction } from "@/app/(app)/tableros/mantenimiento/actions";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Botón "Registrar mantenimiento" para una fila de circuito/elemento de
 * tablero en la ficha de Sitio — mismo criterio que
 * RegistrarMantenimientoButton (Racks/Equipos Individuales), pero contra
 * `tablero_mantenimientos` (log de trabajo realizado, sin grilla de
 * corriente ni PDF — ver `tableros/mantenimiento/actions.ts`), no
 * `mantenimientos_equipamiento`. Tablero y circuito ya se conocen por la
 * fila donde aparece, así que a diferencia de `/tableros/mantenimiento` acá
 * no hace falta elegirlos de nuevo.
 */
export function RegistrarMantenimientoCircuitoButton({
  tableroId,
  circuitoId,
  circuitoTexto,
}: {
  tableroId: string;
  circuitoId: string;
  circuitoTexto: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fecha, setFecha] = useState(hoyISO);
  const [descripcion, setDescripcion] = useState("");
  const [proximoMantenimiento, setProximoMantenimiento] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  function cerrar() {
    if (busy) return;
    setOpen(false);
    setFecha(hoyISO());
    setDescripcion("");
    setProximoMantenimiento("");
    setFoto(null);
    setError(null);
  }

  async function confirmar() {
    if (!descripcion.trim()) {
      setError("Contá qué trabajo se realizó.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("tableroId", tableroId);
    fd.append("circuitoId", circuitoId);
    fd.append("fecha", fecha);
    fd.append("descripcion", descripcion.trim());
    if (proximoMantenimiento) fd.append("proximoMantenimiento", proximoMantenimiento);
    if (foto) fd.append("foto", foto);

    const res = await crearMantenimientoAction(fd);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo registrar el mantenimiento.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="icon-btn" title="Registrar mantenimiento" onClick={() => setOpen(true)}>
        <Icon name="wrench" size={15} />
      </button>
      {open && (
        <div className="modal-overlay" onClick={cerrar}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="section-label" style={{ marginBottom: 4 }}>
              Registrar mantenimiento
            </div>
            <p className="hint" style={{ margin: "0 0 14px" }}>
              {circuitoTexto}
            </p>

            <div className="field">
              <label>Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={busy} />
            </div>
            <div className="field">
              <label>Trabajo realizado</label>
              <textarea
                placeholder="Ej: Se reemplazó el interruptor por uno nuevo de 32A."
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                disabled={busy}
                rows={2}
              />
            </div>
            <div className="field">
              <label>
                Próximo mantenimiento <span className="opt">(opcional)</span>
              </label>
              <input
                type="date"
                value={proximoMantenimiento}
                onChange={(e) => setProximoMantenimiento(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="field">
              <label>
                Foto <span className="opt">(opcional)</span>
              </label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => fotoInputRef.current?.click()} disabled={busy}>
                <Icon name="camera" size={13} /> {foto ? foto.name : "Sacar/subir foto"}
                {foto && <Icon name="check" size={12} style={{ marginLeft: 4 }} />}
              </button>
              <input
                ref={fotoInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
              />
            </div>

            {error && <div className="error-text">{error}</div>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={cerrar} disabled={busy}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={confirmar} disabled={busy}>
                {busy ? "Guardando..." : "Confirmar mantenimiento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
