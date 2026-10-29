"use client";

import { useState } from "react";
import Link from "next/link";
import { actualizarRelevamientoTorreComunicacionAction } from "@/app/(app)/torres-comunicacion/editar/[id]/actions";
import { obtenerUrlPdfRelevamientoAction } from "@/app/(app)/torres-comunicacion/historial/actions";
import { ErrorNote, SuccessNote } from "@/components/notes";
import { VerPdfLink } from "@/components/ver-pdf-link";
import { reportarErrorCliente } from "@/lib/client-error-report";
import { CATEGORIA_EQUIPO_LABEL, ESTADO_OPCIONES } from "./types";
import { HallazgosInspeccionIaSection } from "@/components/inspeccion-ia/hallazgos-section";
import type { HallazgoInspeccionIa } from "@/lib/inspeccion-ia/types";
import type { TorreComunicacionCategoriaEquipo, EstadoChecklist } from "@/lib/database.types";

export interface EquipamientoEditable {
  id: string;
  numero: number;
  categoriaEquipo: TorreComunicacionCategoriaEquipo;
  texto: string;
  marcaModelo: string | null;
  alturaM: string | null;
  etiquetaYpf: string | null;
  cantidad: number;
  /** Lectura ya tomada en ESTE relevamiento — "" si ese equipo no se evaluó en esta visita. */
  estado: string;
  comentario: string;
}

export function EditarRelevamientoForm({
  relevamientoId,
  numeroGeneracion,
  denominacion,
  ubicacionLabel,
  initialFecha,
  equipamiento,
  initialHallazgos,
}: {
  relevamientoId: string;
  numeroGeneracion: string;
  denominacion: string;
  ubicacionLabel: string;
  initialFecha: string;
  equipamiento: EquipamientoEditable[];
  initialHallazgos: HallazgoInspeccionIa[];
}) {
  const [fecha, setFecha] = useState(initialFecha);
  const [lecturas, setLecturas] = useState<Record<string, { estado: string; comentario: string }>>(() =>
    Object.fromEntries(equipamiento.map((e) => [e.id, { estado: e.estado, comentario: e.comentario }])),
  );
  const [hallazgos, setHallazgos] = useState<HallazgoInspeccionIa[]>(initialHallazgos);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ pdfUrl: string | null } | null>(null);

  function actualizarLectura(equipoId: string, patch: Partial<{ estado: string; comentario: string }>) {
    setLecturas((prev) => ({ ...prev, [equipoId]: { ...(prev[equipoId] ?? { estado: "", comentario: "" }), ...patch } }));
  }

  function setEstadoHallazgo(itemId: string, estado: EstadoChecklist) {
    setHallazgos((prev) => prev.map((h) => (h.itemId === itemId ? { ...h, estado } : h)));
  }

  function setComentarioHallazgo(itemId: string, comentario: string) {
    setHallazgos((prev) => prev.map((h) => (h.itemId === itemId ? { ...h, comentario } : h)));
  }

  async function guardar() {
    setError(null);
    if (!fecha) {
      setError("Falta la fecha.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append(
        "payload",
        JSON.stringify({
          fecha,
          lecturas: equipamiento.map((e) => {
            const l = lecturas[e.id] ?? { estado: "", comentario: "" };
            return { equipamientoId: e.id, estado: l.estado, comentario: l.comentario };
          }),
          hallazgos: hallazgos
            .filter((h) => h.estado !== null)
            .map((h) => ({ itemId: h.itemId, estado: h.estado, comentario: h.comentario.trim() })),
        }),
      );
      const res = await actualizarRelevamientoTorreComunicacionAction(relevamientoId, fd);
      if (!res.success) {
        const mensaje = res.error || "No se pudo guardar el relevamiento.";
        setError(mensaje);
        reportarErrorCliente(mensaje, "editar-relevamiento-torre-comunicacion");
        return;
      }
      setSuccess({ pdfUrl: res.pdfUrl ?? null });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Ocurrió un error inesperado guardando el relevamiento.";
      setError(mensaje);
      reportarErrorCliente(mensaje, "editar-relevamiento-torre-comunicacion", err instanceof Error ? err.stack : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Editar Relevamiento — {numeroGeneracion}</h1>
        <p>
          {denominacion} · {ubicacionLabel}
        </p>
      </div>

      <div className="card">
        <div className="hint" style={{ margin: "0 0 10px" }}>
          Edición acotada: fecha, estado/comentario de cada equipo ya relevado y hallazgos de Inspección IA. Los datos de la torre, el
          equipamiento (marca/modelo/altura) y las fotos quedan como están — se cargan en un relevamiento nuevo, no acá.
        </div>
        <div className="field" style={{ maxWidth: 220 }}>
          <label>
            Fecha <span className="req">*</span>
          </label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={submitting} />
        </div>
      </div>

      <div className="card">
        <div className="section-label">Equipamiento relevado</div>
        {equipamiento.length === 0 && <div className="empty-note">Esta torre no tiene equipamiento activo cargado.</div>}
        <div className="item-list">
          {equipamiento.map((e) => {
            const l = lecturas[e.id] ?? { estado: "", comentario: "" };
            return (
              <div className="list-item" key={e.id} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                <div className="item-name">
                  {e.numero} — {e.texto} · {CATEGORIA_EQUIPO_LABEL[e.categoriaEquipo]}
                  {e.marcaModelo ? ` · ${e.marcaModelo}` : ""}
                  {e.alturaM ? ` · ${e.alturaM}` : ""}
                  {e.etiquetaYpf ? ` · YPF ${e.etiquetaYpf}` : ""}
                  {e.cantidad > 1 ? ` · x${e.cantidad}` : ""}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div className="field" style={{ marginBottom: 0, width: 150 }}>
                    <label style={{ fontSize: 11 }}>Estado</label>
                    <select value={l.estado} onChange={(ev) => actualizarLectura(e.id, { estado: ev.target.value })} disabled={submitting}>
                      <option value="">—</option>
                      {ESTADO_OPCIONES.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
                    <label style={{ fontSize: 11 }}>Comentario</label>
                    <input
                      type="text"
                      placeholder="Opcional"
                      value={l.comentario}
                      onChange={(ev) => actualizarLectura(e.id, { comentario: ev.target.value })}
                      disabled={submitting}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <HallazgosInspeccionIaSection hallazgos={hallazgos} onEstado={setEstadoHallazgo} onComentario={setComentarioHallazgo} disabled={submitting} />
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {success ? (
        <>
          <SuccessNote>
            Relevamiento actualizado{success.pdfUrl ? " — " : ""}
            {success.pdfUrl && <VerPdfLink obtenerUrl={() => obtenerUrlPdfRelevamientoAction(relevamientoId)} />}
          </SuccessNote>
          <div className="footer-nav">
            <span />
            <Link href="/torres-comunicacion/historial" className="btn btn-primary">
              Volver al historial
            </Link>
          </div>
        </>
      ) : (
        <div className="footer-nav">
          <Link href="/torres-comunicacion/historial" className="btn btn-secondary">
            Cancelar
          </Link>
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={submitting}>
            {submitting ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      )}
    </div>
  );
}
