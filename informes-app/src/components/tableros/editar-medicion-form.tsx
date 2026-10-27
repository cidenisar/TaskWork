"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { actualizarMedicionTableroAction } from "@/app/(app)/tableros/editar/[id]/actions";
import { reportarErrorCliente } from "@/lib/client-error-report";
import { ErrorNote } from "@/components/notes";
import { HallazgosInspeccionIaSection } from "@/components/inspeccion-ia/hallazgos-section";
import type { HallazgoInspeccionIa } from "@/lib/inspeccion-ia/types";
import type { EstadoChecklist, TableroCategoriaEquipo, TableroEventoTipo, TableroTipoCircuito } from "@/lib/database.types";
import { CATEGORIA_EQUIPO_LABEL, ESTADO_OPCIONES, TABLERO_EVENTO_LABEL, fasesMedicion, itemMideCorriente } from "./types";

export interface LecturaEditable {
  circuitoId: string;
  numero: number;
  texto: string;
  ampNominal: string;
  categoriaEquipo: TableroCategoriaEquipo;
  tipoCircuito: TableroTipoCircuito;
  estado: string;
  corrienteF: string;
  corrienteR: string;
  corrienteS: string;
  corrienteT: string;
  comentario: string;
}

/**
 * Edita una medición/relevamiento YA GUARDADO — solo Administrador.
 * A propósito, mucho más chico que NuevaMedicionForm: no se puede cambiar
 * de tablero/ubicación (una medición siempre es de un tablero ya elegido)
 * ni agregar/sacar circuitos acá (eso es del tablero, no de esta visita
 * puntual) — mismo criterio que ya usa la edición de Informe Técnico
 * ("las fotos quedan como están", ver su actions.ts): se corrigen los
 * datos de texto/lecturas de esta visita, las fotos generales ya
 * guardadas se mantienen tal cual. El PDF se regenera con los datos
 * corregidos; el plano unifilar (si lo tenía) NO se toca ni se regenera
 * acá — eso sigue siendo un pedido aparte, a mano, porque cuesta tokens
 * reales de IA (ver botón "Generar unifilar" en Historial).
 */
export function EditarMedicionForm({
  medicionId,
  numeroGeneracion,
  tableroDenominacion,
  ubicacionLabel,
  tieneEnergia,
  initialFecha,
  initialTipoEvento,
  lecturas: lecturasIniciales,
  hallazgos: hallazgosIniciales,
}: {
  medicionId: string;
  numeroGeneracion: string;
  tableroDenominacion: string;
  ubicacionLabel: string;
  tieneEnergia: boolean;
  initialFecha: string;
  initialTipoEvento: TableroEventoTipo;
  lecturas: LecturaEditable[];
  hallazgos: HallazgoInspeccionIa[];
}) {
  const router = useRouter();
  const [fecha, setFecha] = useState(initialFecha);
  const [tipoEvento, setTipoEvento] = useState<TableroEventoTipo>(initialTipoEvento);
  const [lecturas, setLecturas] = useState<LecturaEditable[]>(lecturasIniciales);
  const [hallazgos, setHallazgos] = useState<HallazgoInspeccionIa[]>(hallazgosIniciales);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function actualizarLectura(circuitoId: string, cambios: Partial<LecturaEditable>) {
    setLecturas((prev) => prev.map((l) => (l.circuitoId === circuitoId ? { ...l, ...cambios } : l)));
  }

  function onEstadoHallazgo(itemId: string, estado: EstadoChecklist) {
    setHallazgos((prev) => prev.map((h) => (h.itemId === itemId ? { ...h, estado } : h)));
  }
  function onComentarioHallazgo(itemId: string, comentario: string) {
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
      fd.set(
        "payload",
        JSON.stringify({
          fecha,
          tipoEvento,
          lecturas,
          hallazgos: hallazgos.filter((h) => h.estado).map((h) => ({ itemId: h.itemId, estado: h.estado, comentario: h.comentario })),
        }),
      );
      const res = await actualizarMedicionTableroAction(medicionId, fd);
      if (!res.success) {
        const mensaje = res.error || "No se pudo guardar la medición.";
        setError(mensaje);
        reportarErrorCliente(mensaje, "editar-medicion-tablero");
        return;
      }
      router.push("/tableros/historial");
      router.refresh();
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Ocurrió un error inesperado guardando la medición.";
      setError(mensaje);
      reportarErrorCliente(mensaje, "editar-medicion-tablero", err instanceof Error ? err.stack : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Editar Medición</h1>
        <p>
          {numeroGeneracion} · {tableroDenominacion} · {ubicacionLabel} — solo Administrador. Los circuitos, las fotos y el plano unifilar
          (si lo tenía) no se tocan acá; solo se corrigen fecha, lecturas y hallazgos de esta visita.
        </p>
      </div>

      <div className="card">
        <div className="grid2">
          <div className="field">
            <label>Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={submitting} />
          </div>
          {tieneEnergia && (
            <div className="field">
              <label>Tipo de visita</label>
              <select value={tipoEvento} onChange={(e) => setTipoEvento(e.target.value as TableroEventoTipo)} disabled={submitting}>
                <option value="medicion">{TABLERO_EVENTO_LABEL.medicion}</option>
                <option value="relevamiento">{TABLERO_EVENTO_LABEL.relevamiento}</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="section-label">Circuitos / elementos relevados</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {lecturas.map((l) => {
            const mideCorriente = itemMideCorriente(l.categoriaEquipo, l.tipoCircuito, tipoEvento);
            const fases = mideCorriente ? fasesMedicion(l.tipoCircuito) : [];
            const opcionesEstado = ESTADO_OPCIONES[l.categoriaEquipo] ?? [];
            return (
              <div key={l.circuitoId} style={{ border: "1px solid var(--field-border)", borderRadius: 8, padding: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  {l.numero} — {l.texto}{" "}
                  <span className="hint" style={{ fontWeight: 400 }}>
                    ({CATEGORIA_EQUIPO_LABEL[l.categoriaEquipo]}
                    {l.ampNominal ? ` · ${l.ampNominal}` : ""})
                  </span>
                </div>
                <div className="grid2">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Estado</label>
                    <select
                      value={l.estado}
                      onChange={(e) => actualizarLectura(l.circuitoId, { estado: e.target.value })}
                      disabled={submitting}
                    >
                      <option value="">Sin especificar</option>
                      {opcionesEstado.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Comentario</label>
                    <input
                      type="text"
                      value={l.comentario}
                      onChange={(e) => actualizarLectura(l.circuitoId, { comentario: e.target.value })}
                      disabled={submitting}
                    />
                  </div>
                </div>
                {fases.length > 0 && (
                  <div className="grid2" style={{ marginTop: 8 }}>
                    {fases.map((fase) => {
                      const campo = (`corriente${fase}` as const) as "corrienteF" | "corrienteR" | "corrienteS" | "corrienteT";
                      return (
                        <div className="field" style={{ marginBottom: 0 }} key={fase}>
                          <label>Corriente {fase} (A)</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={l[campo]}
                            onChange={(e) => actualizarLectura(l.circuitoId, { [campo]: e.target.value } as Partial<LecturaEditable>)}
                            disabled={submitting}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {hallazgos.length > 0 && (
        <div className="card">
          <HallazgosInspeccionIaSection hallazgos={hallazgos} onEstado={onEstadoHallazgo} onComentario={onComentarioHallazgo} disabled={submitting} />
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="footer-nav">
        <span />
        <button type="button" className="btn btn-primary" onClick={guardar} disabled={submitting}>
          {submitting ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
