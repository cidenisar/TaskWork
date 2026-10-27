"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  actualizarRelevamientoEquiposAction,
  type ActualizarRelevamientoEquiposPayload,
} from "@/app/(app)/equipos/editar/[id]/actions";
import { ErrorNote, SuccessNote } from "@/components/notes";
import { Icon } from "@/components/icon";
import { VerPdfLink } from "@/components/ver-pdf-link";
import { obtenerUrlPdfRelevamientoEquiposAction } from "@/app/(app)/equipos/historial/actions";
import { UbicacionFields, type GpsCapturado } from "@/components/ubicaciones/ubicacion-fields";
import type { Ubicacion } from "@/components/ubicaciones/types";
import type { EquipoCategoria, TipoMontajeCamara } from "@/lib/database.types";
import { CATEGORIA_EQUIPO_OPCIONES, CATEGORIA_EQUIPO_LABEL, ESTADO_OPCIONES } from "./types";
import { TIPO_MONTAJE_OPCIONES, TIPO_MONTAJE_LABEL } from "@/lib/equipos/recurso-altura";

export interface LecturaEditable {
  lecturaId: string;
  equipoId: string;
  categoriaEquipo: EquipoCategoria;
  texto: string;
  marcaModelo: string;
  numeroSerie: string;
  etiquetaYpf: string;
  cantidad: number;
  consumoPromedioW: number | null;
  consumoMaxW: number | null;
  tipoMontaje: TipoMontajeCamara | null;
  alturaMontajeM: number | null;
  estado: string;
  comentario: string;
  eliminada: boolean;
}

export function EditarRelevamientoEquiposForm({
  relevamientoId,
  numeroGeneracion,
  initialFecha,
  initialUbicacionId,
  initialProvinciaFiltro,
  initialLecturas,
  ubicaciones,
  provincias,
}: {
  relevamientoId: string;
  numeroGeneracion: string;
  initialFecha: string;
  initialUbicacionId: string;
  initialProvinciaFiltro: string;
  initialLecturas: LecturaEditable[];
  ubicaciones: Ubicacion[];
  provincias: string[];
}) {
  const router = useRouter();
  const [provinciaFiltro, setProvinciaFiltro] = useState(initialProvinciaFiltro);
  const [ubicacionId, setUbicacionId] = useState(initialUbicacionId);
  const [localidadNueva, setLocalidadNueva] = useState("");
  const [sitioNueva, setSitioNueva] = useState("");
  const [plantaNueva, setPlantaNueva] = useState("");
  const [oficinaNueva, setOficinaNueva] = useState("");
  const [gps, setGps] = useState<GpsCapturado | null>(null);
  const [fecha, setFecha] = useState(initialFecha);
  const [lecturas, setLecturas] = useState<LecturaEditable[]>(initialLecturas);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ pdfUrl: string | null } | null>(null);

  function patchLectura(i: number, patch: Partial<LecturaEditable>) {
    setLecturas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function quitarLectura(i: number) {
    setLecturas((prev) => prev.map((l, idx) => (idx === i ? { ...l, eliminada: true } : l)));
  }

  function restaurarLectura(i: number) {
    setLecturas((prev) => prev.map((l, idx) => (idx === i ? { ...l, eliminada: false } : l)));
  }

  async function guardar() {
    setError(null);
    if (!ubicacionId) {
      setError("Elegí una ubicación existente o creá una nueva.");
      return;
    }
    if (ubicacionId === "__new" && (!provinciaFiltro.trim() || !sitioNueva.trim())) {
      setError("Completá la provincia y el sitio de la ubicación nueva.");
      return;
    }
    if (!fecha) {
      setError("Falta la fecha.");
      return;
    }
    if (lecturas.every((l) => l.eliminada)) {
      setError("El relevamiento no puede quedar sin equipos.");
      return;
    }
    const vigentesSinTexto = lecturas.some((l) => !l.eliminada && !l.texto.trim());
    if (vigentesSinTexto) {
      setError("Completá el nombre/etiqueta de todos los equipos.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: ActualizarRelevamientoEquiposPayload = {
        ubicacionId: ubicacionId === "__new" ? "" : ubicacionId,
        ubicacionNueva:
          ubicacionId === "__new"
            ? { provincia: provinciaFiltro, localidad: localidadNueva, sitio: sitioNueva, planta: plantaNueva, oficina: oficinaNueva }
            : null,
        gps,
        fecha,
        lecturas: lecturas.map((l) => ({
          lecturaId: l.lecturaId,
          equipoId: l.equipoId,
          categoriaEquipo: l.categoriaEquipo,
          texto: l.texto.trim(),
          marcaModelo: l.marcaModelo.trim(),
          numeroSerie: l.numeroSerie.trim(),
          etiquetaYpf: l.etiquetaYpf.trim(),
          cantidad: l.cantidad,
          consumoPromedioW: l.consumoPromedioW,
          consumoMaxW: l.consumoMaxW,
          tipoMontaje: l.tipoMontaje,
          alturaMontajeM: l.alturaMontajeM,
          estado: l.estado,
          comentario: l.comentario,
          eliminada: l.eliminada,
        })),
      };
      const fd = new FormData();
      fd.append("payload", JSON.stringify(payload));
      const res = await actualizarRelevamientoEquiposAction(relevamientoId, fd);
      if (!res.success) {
        setError(res.error || "No se pudo guardar el relevamiento.");
        return;
      }
      setSuccess({ pdfUrl: res.pdfUrl ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado guardando el relevamiento.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Editar Relevamiento de Equipos</h1>
        <p>
          {numeroGeneracion} — Solo Administrador. Corregí los datos ya cargados; la lectura por foto con IA y la búsqueda en depósito
          no están acá, son solo para cargar un relevamiento nuevo. La foto general y los hallazgos de Inspección IA quedan como
          estaban.
        </p>
      </div>

      <div className="card">
        <div className="section-label">Ubicación</div>
        <UbicacionFields
          ubicaciones={ubicaciones}
          provincias={provincias}
          provinciaFiltro={provinciaFiltro}
          onProvinciaFiltroChange={(p) => {
            setProvinciaFiltro(p);
            setLocalidadNueva("");
            setSitioNueva("");
            setPlantaNueva("");
            setOficinaNueva("");
          }}
          ubicacionId={ubicacionId}
          onUbicacionIdChange={setUbicacionId}
          localidadNueva={localidadNueva}
          onLocalidadNuevaChange={setLocalidadNueva}
          sitioNueva={sitioNueva}
          onSitioNuevaChange={setSitioNueva}
          plantaNueva={plantaNueva}
          onPlantaNuevaChange={setPlantaNueva}
          oficinaNueva={oficinaNueva}
          onOficinaNuevaChange={setOficinaNueva}
          onGpsCapturado={setGps}
          disabled={submitting}
        />
        <div className="field">
          <label>Fecha</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={submitting} />
        </div>
      </div>

      <div className="card">
        <div className="section-label">Equipos relevados</div>
        <div className="item-list">
          {lecturas.map((l, i) => (
            <div className="list-item" key={l.lecturaId} style={{ flexDirection: "column", alignItems: "stretch", gap: 8, opacity: l.eliminada ? 0.5 : 1 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="field" style={{ marginBottom: 0, width: 170 }}>
                  <label style={{ fontSize: 11 }}>Categoría</label>
                  <select
                    value={l.categoriaEquipo}
                    onChange={(ev) => patchLectura(i, { categoriaEquipo: ev.target.value as EquipoCategoria })}
                    disabled={submitting || l.eliminada}
                  >
                    {CATEGORIA_EQUIPO_OPCIONES.map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORIA_EQUIPO_LABEL[cat]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                  <label style={{ fontSize: 11 }}>Equipo/Etiqueta</label>
                  <input type="text" value={l.texto} onChange={(ev) => patchLectura(i, { texto: ev.target.value })} disabled={submitting || l.eliminada} />
                </div>
                <div className="field" style={{ marginBottom: 0, width: 150 }}>
                  <label style={{ fontSize: 11 }}>Marca/Modelo</label>
                  <input type="text" value={l.marcaModelo} onChange={(ev) => patchLectura(i, { marcaModelo: ev.target.value })} disabled={submitting || l.eliminada} />
                </div>
                <div className="field" style={{ marginBottom: 0, width: 150 }}>
                  <label style={{ fontSize: 11 }}>N° de Serie</label>
                  <input type="text" value={l.numeroSerie} onChange={(ev) => patchLectura(i, { numeroSerie: ev.target.value })} disabled={submitting || l.eliminada} />
                </div>
                <div className="field" style={{ marginBottom: 0, width: 130 }}>
                  <label style={{ fontSize: 11 }}>Etiqueta YPF</label>
                  <input type="text" value={l.etiquetaYpf} onChange={(ev) => patchLectura(i, { etiquetaYpf: ev.target.value })} disabled={submitting || l.eliminada} />
                </div>
                <div className="field" style={{ marginBottom: 0, width: 80 }}>
                  <label style={{ fontSize: 11 }}>Cantidad</label>
                  <input
                    type="number"
                    min={1}
                    value={l.cantidad}
                    onChange={(ev) => patchLectura(i, { cantidad: Number(ev.target.value) || 1 })}
                    disabled={submitting || l.eliminada}
                  />
                </div>
              </div>

              {l.categoriaEquipo === "camara_cctv" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div className="field" style={{ marginBottom: 0, width: 170 }}>
                    <label style={{ fontSize: 11 }}>Tipo de montaje</label>
                    <select
                      value={l.tipoMontaje ?? ""}
                      onChange={(ev) => patchLectura(i, { tipoMontaje: (ev.target.value || null) as TipoMontajeCamara | null })}
                      disabled={submitting || l.eliminada}
                    >
                      <option value="">—</option>
                      {TIPO_MONTAJE_OPCIONES.map((t) => (
                        <option key={t} value={t}>
                          {TIPO_MONTAJE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0, width: 130 }}>
                    <label style={{ fontSize: 11 }}>Altura (m)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={l.alturaMontajeM ?? ""}
                      onChange={(ev) => patchLectura(i, { alturaMontajeM: ev.target.value === "" ? null : Number(ev.target.value) })}
                      disabled={submitting || l.eliminada}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div className="field" style={{ marginBottom: 0, width: 150 }}>
                  <label style={{ fontSize: 11 }}>Estado</label>
                  <select value={l.estado} onChange={(ev) => patchLectura(i, { estado: ev.target.value })} disabled={submitting || l.eliminada}>
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
                  <input type="text" value={l.comentario} onChange={(ev) => patchLectura(i, { comentario: ev.target.value })} disabled={submitting || l.eliminada} />
                </div>
                {l.eliminada ? (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => restaurarLectura(i)} disabled={submitting}>
                    <Icon name="plus" size={13} /> Deshacer
                  </button>
                ) : (
                  <button type="button" className="remove-btn" onClick={() => quitarLectura(i)} disabled={submitting} title="Sacar del relevamiento">
                    <Icon name="x" size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {success && (
        <>
          <SuccessNote>
            Relevamiento actualizado{success.pdfUrl ? " — " : ""}
            {success.pdfUrl && <VerPdfLink obtenerUrl={() => obtenerUrlPdfRelevamientoEquiposAction(relevamientoId)} />}
          </SuccessNote>
          <div className="footer-nav">
            <span />
            <button type="button" className="btn btn-primary" onClick={() => router.push("/equipos/historial")}>
              Volver al Historial
            </button>
          </div>
        </>
      )}
      {!success && (
        <div className="footer-nav">
          <span />
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={submitting}>
            {submitting ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      )}
    </div>
  );
}
