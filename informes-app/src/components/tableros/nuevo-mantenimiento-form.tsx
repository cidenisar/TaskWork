"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { crearMantenimientoAction } from "@/app/(app)/tableros/mantenimiento/actions";
import { actualizarMantenimientoAction } from "@/app/(app)/tableros/mantenimiento/editar/[id]/actions";
import { reportarErrorCliente } from "@/lib/client-error-report";
import { ErrorNote, SuccessNote } from "@/components/notes";
import { Icon } from "@/components/icon";
import { labelSubsistemas, type TableroConCircuitos } from "./types";

export interface MantenimientoInitialValues {
  tableroId: string;
  circuitoId: string;
  fecha: string;
  descripcion: string;
  proximoMantenimiento: string;
}

export function NuevoMantenimientoForm({
  tableros,
  tableroIdInicial,
  modo = "nuevo",
  mantenimientoId,
  initialValues,
  fotoActualUrl,
}: {
  tableros: TableroConCircuitos[];
  tableroIdInicial?: string | null;
  /** "editar": precarga un mantenimiento existente y guarda con actualizarMantenimientoAction (solo Administrador) en vez de crear uno nuevo. */
  modo?: "nuevo" | "editar";
  mantenimientoId?: string;
  initialValues?: MantenimientoInitialValues;
  /** Link firmado de la foto ya guardada (modo editar) — se muestra como referencia; si se elige una foto nueva, la reemplaza. */
  fotoActualUrl?: string | null;
}) {
  const router = useRouter();
  const esEdicion = modo === "editar";
  // Deep-link desde el QR del tablero (ver /planos/tablero/[id]): llega con
  // ?tableroId= y ya se arranca con ese tablero elegido.
  const [tableroId, setTableroId] = useState(
    () => initialValues?.tableroId ?? (tableroIdInicial && tableros.some((t) => t.id === tableroIdInicial) ? tableroIdInicial : ""),
  );
  const [circuitoId, setCircuitoId] = useState(initialValues?.circuitoId ?? "");
  const [fecha, setFecha] = useState(() => initialValues?.fecha ?? new Date().toISOString().slice(0, 10));
  const [descripcion, setDescripcion] = useState(initialValues?.descripcion ?? "");
  const [proximoMantenimiento, setProximoMantenimiento] = useState(initialValues?.proximoMantenimiento ?? "");
  const [foto, setFoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const tablero = useMemo(() => tableros.find((t) => t.id === tableroId) ?? null, [tableros, tableroId]);

  function elegirTablero(id: string) {
    setTableroId(id);
    setCircuitoId("");
  }

  async function guardar() {
    setError(null);
    if (!tableroId) {
      setError("Elegí el tablero donde se hizo el mantenimiento.");
      return;
    }
    if (!fecha) {
      setError("Falta la fecha.");
      return;
    }
    if (!descripcion.trim()) {
      setError("Contá qué trabajo se realizó.");
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("tableroId", tableroId);
      if (circuitoId) fd.append("circuitoId", circuitoId);
      fd.append("fecha", fecha);
      fd.append("descripcion", descripcion.trim());
      if (proximoMantenimiento) fd.append("proximoMantenimiento", proximoMantenimiento);
      if (foto) fd.append("foto", foto);

      const res = esEdicion ? await actualizarMantenimientoAction(mantenimientoId!, fd) : await crearMantenimientoAction(fd);
      if (!res.success) {
        const mensaje = res.error || "No se pudo guardar el mantenimiento.";
        setError(mensaje);
        reportarErrorCliente(mensaje, esEdicion ? "editar-mantenimiento-tablero" : "crear-mantenimiento-tablero");
        return;
      }
      if (esEdicion) {
        router.push("/tableros/historial");
        router.refresh();
        return;
      }
      setSuccess(true);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Ocurrió un error inesperado guardando el mantenimiento.";
      setError(mensaje);
      reportarErrorCliente(mensaje, esEdicion ? "editar-mantenimiento-tablero" : "crear-mantenimiento-tablero", err instanceof Error ? err.stack : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  function empezarOtro() {
    setSuccess(false);
    setTableroId("");
    setCircuitoId("");
    setDescripcion("");
    setProximoMantenimiento("");
    setFoto(null);
  }

  return (
    <div>
      <div className="page-heading">
        <h1>{esEdicion ? "Editar Mantenimiento" : "Nuevo Mantenimiento"}</h1>
        <p>
          {esEdicion
            ? "Corregí el registro — solo Administrador."
            : "Registrá el trabajo realizado en un tablero — no genera PDF, queda como registro en el historial."}
        </p>
      </div>

      <div className="card">
        <div className="field">
          <label>
            Tablero <span className="req">*</span>
          </label>
          <select value={tableroId} onChange={(e) => elegirTablero(e.target.value)} disabled={submitting}>
            <option value="">Seleccionar tablero...</option>
            {tableros.map((t) => (
              <option key={t.id} value={t.id}>
                {t.denominacion} — {t.ubicacionLabel} ({labelSubsistemas(t.subsistemas)})
              </option>
            ))}
          </select>
          {tableros.length === 0 && (
            <div className="hint">
              Todavía no hay ningún tablero relevado — cargá uno primero desde Nueva Medición.
            </div>
          )}
        </div>

        {tablero && tablero.circuitos.length > 0 && (
          <div className="field">
            <label>
              Circuito/elemento afectado <span className="opt">(opcional)</span>
            </label>
            <select value={circuitoId} onChange={(e) => setCircuitoId(e.target.value)} disabled={submitting}>
              <option value="">General / todo el tablero</option>
              {tablero.circuitos.map((c) => (
                <option key={c.id ?? c.numero} value={c.id ?? ""}>
                  {c.numero} — {c.texto}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid2">
          <div className="field">
            <label>
              Fecha <span className="req">*</span>
            </label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={submitting} />
          </div>
          <div className="field">
            <label>
              Próximo mantenimiento <span className="opt">(opcional)</span>
            </label>
            <input
              type="date"
              value={proximoMantenimiento}
              onChange={(e) => setProximoMantenimiento(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <div className="field">
          <label>
            Trabajo realizado <span className="req">*</span>
          </label>
          <textarea
            placeholder="Ej: Se reemplazó el interruptor del circuito RACK 2 por uno nuevo de 32A."
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label>
            Foto del trabajo/repuesto <span className="opt">(opcional)</span>
          </label>
          <input
            ref={fotoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fotoInputRef.current?.click()} disabled={submitting}>
            <Icon name="camera" size={13} /> {foto ? foto.name : esEdicion && fotoActualUrl ? "Reemplazar foto" : "Agregar foto"}
          </button>
          {esEdicion && !foto && fotoActualUrl && (
            <div className="hint">
              Ya tiene una foto cargada —{" "}
              <a href={fotoActualUrl} target="_blank" rel="noreferrer">
                verla
              </a>
              . Elegí una nueva solo si querés reemplazarla.
            </div>
          )}
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {success && (
        <>
          <SuccessNote>Mantenimiento guardado.</SuccessNote>
          <div className="footer-nav">
            <span />
            <button type="button" className="btn btn-primary" onClick={empezarOtro}>
              + Cargar otro mantenimiento
            </button>
          </div>
        </>
      )}
      {!success && (
        <div className="footer-nav">
          <span />
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={submitting || tableros.length === 0}>
            {submitting ? "Guardando..." : esEdicion ? "Guardar cambios" : "Guardar mantenimiento"}
          </button>
        </div>
      )}
    </div>
  );
}
