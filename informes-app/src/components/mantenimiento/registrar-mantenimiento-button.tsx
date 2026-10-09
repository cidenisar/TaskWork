"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { registrarMantenimientoAction } from "@/app/(app)/ubicaciones/actions";
import type { TipoEquipoBaja, EstadoChecklist } from "@/lib/database.types";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface ChecklistItemConfigurado {
  id: string;
  texto: string;
}

const ESTADO_CHECKLIST_LABEL: Record<EstadoChecklist, string> = { ok: "OK", no_ok: "No OK", no_aplica: "N/A" };

/**
 * Botón "Registrar mantenimiento" para una fila de equipamiento (Rack o
 * Equipo Individual — ver `lib/mantenimiento/types.ts`) en la ficha de
 * Sitio — mismo modal self-contained que DarDeBajaButton/
 * EntregarADepositoButton, pero sin gate de rol: es trabajo de campo
 * normal, no una decisión operativa. Si la categoría del equipo tiene un
 * checklist configurado (`checklistItems`), aparece inline en este mismo
 * modal — no hace falta una pantalla aparte, ya estás parado en el
 * equipo correcto.
 */
export function RegistrarMantenimientoButton({
  tipoEquipo,
  equipoId,
  equipoTexto,
  checklistItems = [],
}: {
  tipoEquipo: TipoEquipoBaja;
  equipoId: string;
  equipoTexto: string;
  checklistItems?: ChecklistItemConfigurado[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fecha, setFecha] = useState(hoyISO);
  const [descripcion, setDescripcion] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const [checklist, setChecklist] = useState<Record<string, { estado: EstadoChecklist | null; observacion: string }>>({});

  function cerrar() {
    if (busy) return;
    setOpen(false);
    setFecha(hoyISO());
    setDescripcion("");
    setFoto(null);
    setError(null);
    setChecklist({});
  }

  function setEstadoItem(itemId: string, estado: EstadoChecklist) {
    setChecklist((prev) => ({ ...prev, [itemId]: { estado, observacion: prev[itemId]?.observacion ?? "" } }));
  }

  function setObservacionItem(itemId: string, observacion: string) {
    setChecklist((prev) => ({ ...prev, [itemId]: { estado: prev[itemId]?.estado ?? null, observacion } }));
  }

  async function confirmar() {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append(
      "payload",
      JSON.stringify({
        tipoEquipo,
        equipoId,
        fecha,
        descripcion,
        checklist: Object.entries(checklist)
          .filter(([, v]) => v.estado !== null)
          .map(([itemId, v]) => ({ itemId, estado: v.estado, observacion: v.observacion })),
      }),
    );
    if (foto) fd.append("foto", foto);

    const res = await registrarMantenimientoAction(fd);
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
              {equipoTexto}
            </p>

            <div className="field">
              <label>Fecha</label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={busy} />
            </div>
            <div className="field">
              <label>
                Descripción <span className="opt">(opcional)</span>
              </label>
              <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} disabled={busy} rows={2} />
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

            {checklistItems.length > 0 && (
              <div className="field">
                <label>
                  Checklist de mantenimiento <span className="opt">(opcional)</span>
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {checklistItems.map((item) => {
                    const valor = checklist[item.id];
                    return (
                      <div key={item.id} style={{ border: "1px solid var(--field-border)", borderRadius: 8, padding: 8 }}>
                        <div style={{ fontSize: 12.5, marginBottom: 6 }}>{item.texto}</div>
                        <div style={{ display: "flex", gap: 4, marginBottom: valor?.estado === "no_ok" ? 6 : 0 }}>
                          {(Object.keys(ESTADO_CHECKLIST_LABEL) as EstadoChecklist[]).map((estado) => (
                            <button
                              key={estado}
                              type="button"
                              className={`btn btn-sm ${valor?.estado === estado ? "btn-primary" : "btn-secondary"}`}
                              onClick={() => setEstadoItem(item.id, estado)}
                              disabled={busy}
                            >
                              {ESTADO_CHECKLIST_LABEL[estado]}
                            </button>
                          ))}
                        </div>
                        {valor?.estado === "no_ok" && (
                          <input
                            type="text"
                            placeholder="Observación (opcional)"
                            value={valor.observacion}
                            onChange={(e) => setObservacionItem(item.id, e.target.value)}
                            disabled={busy}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
