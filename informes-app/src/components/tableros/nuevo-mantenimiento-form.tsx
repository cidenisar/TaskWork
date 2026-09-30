"use client";

import { useMemo, useRef, useState } from "react";
import { crearMantenimientoAction } from "@/app/(app)/tableros/mantenimiento/actions";
import { reportarErrorCliente } from "@/lib/client-error-report";
import { ErrorNote, SuccessNote } from "@/components/notes";
import { Icon } from "@/components/icon";
import { labelSubsistemas, type TableroConCircuitos } from "./types";

export function NuevoMantenimientoForm({ tableros }: { tableros: TableroConCircuitos[] }) {
  const [tableroId, setTableroId] = useState("");
  const [circuitoId, setCircuitoId] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [descripcion, setDescripcion] = useState("");
  const [proximoMantenimiento, setProximoMantenimiento] = useState("");
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

      const res = await crearMantenimientoAction(fd);
      if (!res.success) {
        const mensaje = res.error || "No se pudo guardar el mantenimiento.";
        setError(mensaje);
        reportarErrorCliente(mensaje, "crear-mantenimiento-tablero");
        return;
      }
      setSuccess(true);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Ocurrió un error inesperado guardando el mantenimiento.";
      setError(mensaje);
      reportarErrorCliente(mensaje, "crear-mantenimiento-tablero", err instanceof Error ? err.stack : undefined);
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
        <h1>Nuevo Mantenimiento</h1>
        <p>Registrá el trabajo realizado en un tablero — no genera PDF, queda como registro en el historial.</p>
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
            <Icon name="camera" size={13} /> {foto ? foto.name : "Agregar foto"}
          </button>
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
            {submitting ? "Guardando..." : "Guardar mantenimiento"}
          </button>
        </div>
      )}
    </div>
  );
}
