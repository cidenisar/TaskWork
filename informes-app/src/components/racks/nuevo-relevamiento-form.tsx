"use client";

import { useMemo, useRef, useState } from "react";
import { crearRelevamientoRackAction } from "@/app/(app)/racks/nuevo/actions";
import { reportarErrorCliente } from "@/lib/client-error-report";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { ErrorNote, SuccessNote } from "@/components/notes";
import { Icon } from "@/components/icon";
import { VerPdfLink } from "@/components/ver-pdf-link";
import { obtenerUrlPdfRelevamientoAction } from "@/app/(app)/racks/historial/actions";
import { UbicacionFields, type GpsCapturado } from "@/components/ubicaciones/ubicacion-fields";
import type { Ubicacion } from "@/components/ubicaciones/types";
import type { RackCategoriaEquipo } from "@/lib/database.types";
import {
  RACK_FOTO_IA_MAX,
  RACK_FOTO_GENERAL_MAX,
  CATEGORIA_EQUIPO_OPCIONES,
  CATEGORIA_EQUIPO_LABEL,
  ESTADO_OPCIONES,
  calcularResumenEquipamiento,
  type EquipamientoItem,
  type RackConEquipamiento,
} from "./types";

interface LecturaState {
  estado: string;
  comentario: string;
}

const LECTURA_VACIA: LecturaState = { estado: "", comentario: "" };
const EQUIPO_NUEVO_BASE = {
  categoriaEquipo: "otro" as RackCategoriaEquipo,
  marcaModelo: "",
  posicionU: "",
  etiquetaYpf: "",
  cantidad: 1,
  consumoPromedioW: null as number | null,
  consumoMaxW: null as number | null,
  bocasDisponibles: null as number | null,
};

export function NuevoRelevamientoForm({
  racks,
  ubicaciones,
  provincias,
}: {
  racks: RackConEquipamiento[];
  ubicaciones: Ubicacion[];
  provincias: string[];
}) {
  const [provinciaFiltro, setProvinciaFiltro] = useState("");
  const [ubicacionId, setUbicacionId] = useState<string>(""); // "" = sin elegir, "__new" = crear
  const [localidadNueva, setLocalidadNueva] = useState("");
  const [sitioNueva, setSitioNueva] = useState("");
  const [plantaNueva, setPlantaNueva] = useState("");
  const [oficinaNueva, setOficinaNueva] = useState("");
  const [gps, setGps] = useState<GpsCapturado | null>(null);
  const [rackId, setRackId] = useState<string>(""); // "" = sin elegir, "__new" = crear
  const [denominacionNueva, setDenominacionNueva] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [equipamiento, setEquipamiento] = useState<EquipamientoItem[]>([]);
  const [lecturas, setLecturas] = useState<Record<number, LecturaState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ relevamientoId: string; numeroGeneracion: string; pdfUrl: string | null } | null>(null);
  const [fotosIa, setFotosIa] = useState<File[]>([]);
  const [iaBusy, setIaBusy] = useState(false);
  const [iaNote, setIaNote] = useState<string | null>(null);
  const fotoCameraInputRef = useRef<HTMLInputElement>(null);
  const fotoGaleriaInputRef = useRef<HTMLInputElement>(null);
  const [fotosGenerales, setFotosGenerales] = useState<File[]>([]);
  const fotoGeneralCameraInputRef = useRef<HTMLInputElement>(null);
  const fotoGeneralGaleriaInputRef = useRef<HTMLInputElement>(null);

  function agregarFotosGenerales(files: File[]) {
    if (files.length === 0) return;
    setFotosGenerales((prev) => {
      const disponibles = RACK_FOTO_GENERAL_MAX - prev.length;
      if (disponibles <= 0) return prev;
      return [...prev, ...files.slice(0, disponibles)];
    });
  }

  function quitarFotoGeneral(i: number) {
    setFotosGenerales((prev) => prev.filter((_, idx) => idx !== i));
  }

  const resumen = useMemo(() => calcularResumenEquipamiento(equipamiento), [equipamiento]);

  const racksFiltrados = useMemo(() => {
    if (!ubicacionId || ubicacionId === "__new") return [];
    return racks.filter((r) => r.ubicacionId === ubicacionId);
  }, [racks, ubicacionId]);

  function elegirProvinciaFiltro(provincia: string) {
    setProvinciaFiltro(provincia);
    setLocalidadNueva("");
    setSitioNueva("");
    setPlantaNueva("");
    setOficinaNueva("");
  }

  function elegirUbicacion(id: string) {
    setUbicacionId(id);
    setSuccess(null);
    setRackId("");
    setDenominacionNueva("");
    setEquipamiento([]);
    setLecturas({});
    if (id !== "__new") {
      setLocalidadNueva("");
      setSitioNueva("");
      setPlantaNueva("");
      setOficinaNueva("");
    }
  }

  function elegirRack(id: string) {
    setRackId(id);
    setSuccess(null);
    if (id === "__new" || id === "") {
      setEquipamiento([]);
      setLecturas({});
      return;
    }
    const r = racks.find((x) => x.id === id);
    setEquipamiento(r ? [...r.equipamiento] : []);
    setLecturas({});
  }

  function agregarFotosIa(files: File[]) {
    if (files.length === 0) return;
    setIaNote(null);
    setFotosIa((prev) => {
      const disponibles = RACK_FOTO_IA_MAX - prev.length;
      if (disponibles <= 0) return prev;
      return [...prev, ...files.slice(0, disponibles)];
    });
  }

  function quitarFotoIa(i: number) {
    setFotosIa((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function leerFotosConIa() {
    if (fotosIa.length === 0) return;
    setIaBusy(true);
    setIaNote(null);
    const fallidas: File[] = [];
    let primerError: string | null = null;
    try {
      const fd = new FormData();
      for (const f of fotosIa) {
        try {
          const jpeg = await resizeImageToJpeg(f);
          fd.append("fotos", jpeg, "rack.jpg");
        } catch (err) {
          fallidas.push(f);
          const msg = err instanceof Error ? err.message : `No se pudo leer "${f.name}".`;
          if (!primerError) primerError = msg;
        }
      }
      const exitosas = fotosIa.length - fallidas.length;
      if (exitosas === 0) {
        setIaNote(primerError || "No se pudo leer ninguna de las fotos.");
        return;
      }
      const res = await fetch("/api/racks/leer-foto", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setIaNote(data.error || "No se pudo leer las fotos.");
        setFotosIa(fallidas);
        return;
      }
      const detectados: {
        numero: number;
        texto: string;
        categoriaEquipo: RackCategoriaEquipo;
        marcaModelo: string;
        posicionU: string;
        etiquetaYpf: string;
        identificado: boolean;
        consumoPromedioW: number | null;
        consumoMaxW: number | null;
      }[] = data.equipos ?? [];
      if (detectados.length === 0) {
        setIaNote(
          "No se detectó ningún equipo en las fotos — probá con otras o cargalos a mano." +
            (fallidas.length > 0 ? ` (${fallidas.length} foto${fallidas.length === 1 ? "" : "s"} no se pudo leer: ${primerError})` : ""),
        );
        setFotosIa(fallidas);
        return;
      }
      const siguienteBase = equipamiento.length ? Math.max(...equipamiento.map((e) => e.numero)) : 0;
      setEquipamiento((prev) => [
        ...prev,
        ...detectados.map((d, i) => ({
          id: null,
          numero: siguienteBase + i + 1,
          categoriaEquipo: d.categoriaEquipo,
          texto: d.texto,
          marcaModelo: d.marcaModelo,
          posicionU: d.posicionU,
          etiquetaYpf: d.etiquetaYpf,
          cantidad: 1,
          consumoPromedioW: d.consumoPromedioW,
          consumoMaxW: d.consumoMaxW,
          bocasDisponibles: null,
          revisar: d.identificado !== true,
        })),
      ]);
      const sinEtiqueta = detectados.filter((d) => d.identificado !== true).length;
      setIaNote(
        `Se agregaron ${detectados.length} equipo${detectados.length === 1 ? "" : "s"} desde ${exitosas} foto${exitosas === 1 ? "" : "s"}` +
          (sinEtiqueta > 0
            ? ` — ${sinEtiqueta} sin etiqueta legible, marcados para revisar (la IA describió y clasificó lo que vio, pero no adivina el nombre del equipo sin una etiqueta física).`
            : " — revisá la categoría/marca antes de guardar.") +
          (fallidas.length > 0 ? ` (${fallidas.length} foto${fallidas.length === 1 ? "" : "s"} no se pudo leer: ${primerError})` : ""),
      );
      setFotosIa(fallidas);
    } catch (err) {
      setIaNote("No se pudo leer las fotos.");
      reportarErrorCliente(err instanceof Error ? err.message : "Error leyendo fotos de rack con IA", "leer-foto-rack");
    } finally {
      setIaBusy(false);
    }
  }

  function agregarEquipo() {
    const siguienteNumero = equipamiento.length ? Math.max(...equipamiento.map((e) => e.numero)) + 1 : 1;
    setEquipamiento((prev) => [...prev, { id: null, numero: siguienteNumero, texto: "", ...EQUIPO_NUEVO_BASE }]);
  }

  function actualizarEquipo(i: number, patch: Partial<EquipamientoItem>) {
    setEquipamiento((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }

  function quitarEquipo(i: number) {
    setEquipamiento((prev) => prev.filter((_, idx) => idx !== i));
    setLecturas((prev) => {
      const next: Record<number, LecturaState> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const idx = Number(k);
        if (idx < i) next[idx] = v;
        else if (idx > i) next[idx - 1] = v;
      });
      return next;
    });
  }

  function actualizarLectura(i: number, patch: Partial<LecturaState>) {
    setLecturas((prev) => ({ ...prev, [i]: { ...(prev[i] ?? LECTURA_VACIA), ...patch } }));
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
    if (!rackId) {
      setError("Elegí un rack existente o creá uno nuevo.");
      return;
    }
    if (rackId === "__new" && !denominacionNueva.trim()) {
      setError("Completá la denominación del rack nuevo.");
      return;
    }
    if (!fecha) {
      setError("Falta la fecha.");
      return;
    }
    if (equipamiento.length === 0) {
      setError("Agregá al menos un equipo.");
      return;
    }
    const equipoSinTexto = equipamiento.some((e) => !e.texto.trim());
    if (equipoSinTexto) {
      setError("Completá el nombre/etiqueta de todos los equipos cargados.");
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append(
        "payload",
        JSON.stringify({
          rackId: rackId === "__new" ? null : rackId,
          ubicacionId: ubicacionId === "__new" ? null : ubicacionId,
          ubicacionNueva:
            ubicacionId === "__new"
              ? { provincia: provinciaFiltro, localidad: localidadNueva, sitio: sitioNueva, planta: plantaNueva, oficina: oficinaNueva }
              : null,
          gps,
          denominacionNueva,
          fecha,
          lecturas: equipamiento.map((e, i) => {
            const l = lecturas[i] ?? LECTURA_VACIA;
            return {
              equipamientoId: e.id,
              numero: e.numero,
              categoriaEquipo: e.categoriaEquipo,
              texto: e.texto.trim(),
              marcaModelo: e.marcaModelo.trim(),
              posicionU: e.posicionU.trim(),
              etiquetaYpf: e.etiquetaYpf.trim(),
              cantidad: e.cantidad,
              consumoPromedioW: e.consumoPromedioW,
              consumoMaxW: e.consumoMaxW,
              bocasDisponibles: e.bocasDisponibles,
              estado: l.estado,
              comentario: l.comentario,
            };
          }),
        }),
      );
      for (let i = 0; i < fotosGenerales.length; i++) {
        try {
          const jpeg = await resizeImageToJpeg(fotosGenerales[i]);
          fd.append("fotoGeneral", jpeg, `general-${i + 1}.jpg`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "No se pudo leer una de las fotos generales del rack.");
          return;
        }
      }
      const res = await crearRelevamientoRackAction(fd);
      if (!res.success) {
        const mensaje = res.error || "No se pudo guardar el relevamiento.";
        setError(mensaje);
        reportarErrorCliente(mensaje, "crear-relevamiento-rack");
        return;
      }
      setSuccess({ relevamientoId: res.relevamientoId!, numeroGeneracion: res.numeroGeneracion!, pdfUrl: res.pdfUrl ?? null });
      setFotosGenerales([]);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Ocurrió un error inesperado guardando el relevamiento.";
      setError(mensaje);
      reportarErrorCliente(mensaje, "crear-relevamiento-rack", err instanceof Error ? err.stack : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  function empezarOtro() {
    setSuccess(null);
    setProvinciaFiltro("");
    setUbicacionId("");
    setLocalidadNueva("");
    setSitioNueva("");
    setPlantaNueva("");
    setOficinaNueva("");
    setGps(null);
    setRackId("");
    setDenominacionNueva("");
    setEquipamiento([]);
    setLecturas({});
    setFotosGenerales([]);
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Nuevo Relevamiento</h1>
        <p>Elegí el rack, cargá la fecha y el equipamiento — se genera el PDF al guardar.</p>
      </div>

      <div className="card">
        <div className="section-label">Ubicación</div>
        <UbicacionFields
          ubicaciones={ubicaciones}
          provincias={provincias}
          provinciaFiltro={provinciaFiltro}
          onProvinciaFiltroChange={elegirProvinciaFiltro}
          ubicacionId={ubicacionId}
          onUbicacionIdChange={elegirUbicacion}
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
      </div>

      {ubicacionId && (
        <div className="card">
          <div className="section-label">Rack</div>
          <div className="field">
            <label>
              Elegí uno existente o creá uno nuevo <span className="req">*</span>
            </label>
            <select value={rackId} onChange={(e) => elegirRack(e.target.value)} disabled={submitting}>
              <option value="">Seleccionar rack...</option>
              {racksFiltrados.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.denominacion}
                </option>
              ))}
              <option value="__new">+ Crear rack nuevo...</option>
            </select>
          </div>
          {rackId === "__new" && (
            <div className="field">
              <label>
                Denominación <span className="req">*</span>
              </label>
              <input
                type="text"
                placeholder="Ej: Rack 1 - Transmisión"
                value={denominacionNueva}
                onChange={(e) => setDenominacionNueva(e.target.value)}
                disabled={submitting}
              />
            </div>
          )}
          <div className="field" style={{ marginTop: 16 }}>
            <label>
              Fecha <span className="req">*</span>
            </label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={submitting} style={{ maxWidth: 220 }} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>
              Fotos generales del rack <span className="opt">(opcional)</span>
            </label>
            <div className="hint" style={{ margin: "-2px 0 8px" }}>
              Hasta {RACK_FOTO_GENERAL_MAX} fotos (ej: parte delantera y trasera, u otros ángulos de detalle) — quedan guardadas como
              registro y se imprimen en el PDF de esta visita.
            </div>
            <input
              ref={fotoGeneralCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                agregarFotosGenerales(files);
              }}
            />
            <input
              ref={fotoGeneralGaleriaInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                agregarFotosGenerales(files);
              }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: fotosGenerales.length ? 8 : 0 }}>
              <button
                type="button"
                className="ai-btn"
                onClick={() => fotoGeneralCameraInputRef.current?.click()}
                disabled={submitting || fotosGenerales.length >= RACK_FOTO_GENERAL_MAX}
              >
                <Icon name="camera" size={13} /> Sacar foto ({fotosGenerales.length}/{RACK_FOTO_GENERAL_MAX})
              </button>
              <button
                type="button"
                className="ai-btn"
                onClick={() => fotoGeneralGaleriaInputRef.current?.click()}
                disabled={submitting || fotosGenerales.length >= RACK_FOTO_GENERAL_MAX}
              >
                <Icon name="upload" size={13} /> Subir foto
              </button>
            </div>
            {fotosGenerales.length > 0 && (
              <div className="chip-row" style={{ marginTop: 0 }}>
                {fotosGenerales.map((f, i) => (
                  <span className="chip" key={i}>
                    Foto {i + 1}
                    <button type="button" onClick={() => quitarFotoGeneral(i)} disabled={submitting} aria-label={`Quitar foto ${i + 1}`}>
                      <Icon name="x" size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {rackId && (
        <div className="card">
          <div className="section-label">Equipamiento</div>
          <div className="hint" style={{ margin: "-4px 0 12px" }}>
            <Icon name="ai" size={13} /> Sacale hasta {RACK_FOTO_IA_MAX} fotos al rack (distintos ángulos o secciones) y la IA combina
            todas para armar la lista de equipamiento sin repetir — clasifica categoría y marca/modelo, pero siempre revisala y corregí lo
            que haga falta antes de guardar.
          </div>
          <input
            ref={fotoCameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              agregarFotosIa(files);
            }}
          />
          <input
            ref={fotoGaleriaInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              agregarFotosIa(files);
            }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: fotosIa.length ? 8 : 12 }}>
            <button
              type="button"
              className="ai-btn"
              onClick={() => fotoCameraInputRef.current?.click()}
              disabled={submitting || iaBusy || fotosIa.length >= RACK_FOTO_IA_MAX}
            >
              <Icon name="camera" size={13} /> Sacar foto ({fotosIa.length}/{RACK_FOTO_IA_MAX})
            </button>
            <button
              type="button"
              className="ai-btn"
              onClick={() => fotoGaleriaInputRef.current?.click()}
              disabled={submitting || iaBusy || fotosIa.length >= RACK_FOTO_IA_MAX}
            >
              <Icon name="upload" size={13} /> Subir foto
            </button>
            {fotosIa.length > 0 && (
              <button type="button" className="ai-btn" onClick={() => void leerFotosConIa()} disabled={submitting || iaBusy}>
                <Icon name="ai" size={13} />{" "}
                {iaBusy ? "Procesando..." : `Procesar ${fotosIa.length} foto${fotosIa.length === 1 ? "" : "s"} con IA`}
              </button>
            )}
          </div>
          {fotosIa.length > 0 && (
            <div className="chip-row" style={{ marginTop: 0, marginBottom: 12 }}>
              {fotosIa.map((f, i) => (
                <span className="chip" key={i}>
                  Foto {i + 1}
                  <button type="button" onClick={() => quitarFotoIa(i)} disabled={iaBusy} aria-label={`Quitar foto ${i + 1}`}>
                    <Icon name="x" size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {iaNote && (
            <div className="ai-note" style={{ marginBottom: 12 }}>
              <span>{iaNote}</span>
            </div>
          )}

          {equipamiento.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                alignItems: "center",
                margin: "0 0 14px",
                padding: "10px 12px",
                border: "1.5px solid var(--field-border)",
                borderRadius: 8,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, marginRight: 4 }}>
                Resumen: {resumen.total} equipamiento{resumen.total === 1 ? "" : "s"}
              </span>
              {resumen.porCategoria.map((c) => (
                <span className="chip" key={c.categoria}>
                  {c.cantidad} {CATEGORIA_EQUIPO_LABEL[c.categoria]}
                </span>
              ))}
            </div>
          )}

          {equipamiento.length === 0 && <div className="empty-note">Todavía no hay equipamiento cargado.</div>}
          <div className="item-list" style={{ marginTop: equipamiento.length ? 0 : 12 }}>
            {equipamiento.map((e, i) => {
              const l = lecturas[i] ?? LECTURA_VACIA;
              const esNuevo = e.id === null;
              return (
                <div className="list-item" key={i} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                  {esNuevo ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {e.revisar && (
                        <div className="hint" style={{ color: "var(--warn)", margin: 0 }}>
                          <Icon name="warning" size={12} /> Sin etiqueta legible en la foto — la IA describió/clasificó lo que vio,
                          corregí lo que no coincida.
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <div className="field" style={{ marginBottom: 0, width: 60 }}>
                          <label style={{ fontSize: 11 }}>N°</label>
                          <input
                            type="number"
                            value={e.numero}
                            onChange={(ev) => actualizarEquipo(i, { numero: Number(ev.target.value) || 0 })}
                            disabled={submitting}
                          />
                        </div>
                        <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 150 }}>
                          <label style={{ fontSize: 11 }}>Equipo/Etiqueta</label>
                          <input
                            type="text"
                            placeholder="Ej: Switch Core Sala Radio"
                            value={e.texto}
                            onChange={(ev) => actualizarEquipo(i, { texto: ev.target.value, revisar: false })}
                            disabled={submitting}
                          />
                        </div>
                        <div className="field" style={{ marginBottom: 0, width: 170 }}>
                          <label style={{ fontSize: 11 }}>Categoría</label>
                          <select
                            value={e.categoriaEquipo}
                            onChange={(ev) => actualizarEquipo(i, { categoriaEquipo: ev.target.value as RackCategoriaEquipo })}
                            disabled={submitting}
                          >
                            {CATEGORIA_EQUIPO_OPCIONES.map((cat) => (
                              <option key={cat} value={cat}>
                                {CATEGORIA_EQUIPO_LABEL[cat]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="field" style={{ marginBottom: 0, width: 150 }}>
                          <label style={{ fontSize: 11 }}>Marca/Modelo</label>
                          <input
                            type="text"
                            placeholder="Opcional"
                            value={e.marcaModelo}
                            onChange={(ev) => actualizarEquipo(i, { marcaModelo: ev.target.value })}
                            disabled={submitting}
                          />
                        </div>
                        <div className="field" style={{ marginBottom: 0, width: 90 }}>
                          <label style={{ fontSize: 11 }}>Posición (U)</label>
                          <input
                            type="text"
                            placeholder="Ej: U12"
                            value={e.posicionU}
                            onChange={(ev) => actualizarEquipo(i, { posicionU: ev.target.value })}
                            disabled={submitting}
                          />
                        </div>
                        <div className="field" style={{ marginBottom: 0, width: 110 }}>
                          <label style={{ fontSize: 11 }}>Etiqueta YPF</label>
                          <input
                            type="text"
                            placeholder="N° inventario"
                            value={e.etiquetaYpf}
                            onChange={(ev) => actualizarEquipo(i, { etiquetaYpf: ev.target.value })}
                            disabled={submitting}
                          />
                        </div>
                        <div className="field" style={{ marginBottom: 0, width: 80 }}>
                          <label style={{ fontSize: 11 }}>Cantidad</label>
                          <input
                            type="number"
                            min={1}
                            value={e.cantidad}
                            onChange={(ev) => actualizarEquipo(i, { cantidad: Math.max(1, Number(ev.target.value) || 1) })}
                            disabled={submitting}
                          />
                        </div>
                        <div className="field" style={{ marginBottom: 0, width: 100 }}>
                          <label style={{ fontSize: 11 }}>Consumo prom. (W)</label>
                          <input
                            type="number"
                            min={0}
                            placeholder="IA / manual"
                            value={e.consumoPromedioW ?? ""}
                            onChange={(ev) => actualizarEquipo(i, { consumoPromedioW: ev.target.value === "" ? null : Number(ev.target.value) })}
                            disabled={submitting}
                          />
                        </div>
                        <div className="field" style={{ marginBottom: 0, width: 100 }}>
                          <label style={{ fontSize: 11 }}>Consumo máx. (W)</label>
                          <input
                            type="number"
                            min={0}
                            placeholder="IA / manual"
                            value={e.consumoMaxW ?? ""}
                            onChange={(ev) => actualizarEquipo(i, { consumoMaxW: ev.target.value === "" ? null : Number(ev.target.value) })}
                            disabled={submitting}
                          />
                        </div>
                        <div className="field" style={{ marginBottom: 0, width: 100 }}>
                          <label style={{ fontSize: 11 }}>Bocas disp.</label>
                          <input
                            type="number"
                            min={0}
                            placeholder="Opcional"
                            value={e.bocasDisponibles ?? ""}
                            onChange={(ev) =>
                              actualizarEquipo(i, { bocasDisponibles: ev.target.value === "" ? null : Number(ev.target.value) })
                            }
                            disabled={submitting}
                          />
                        </div>
                        <button type="button" className="remove-btn" onClick={() => quitarEquipo(i)} disabled={submitting}>
                          <Icon name="x" size={12} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="item-name">
                      {e.numero} — {e.texto} · {CATEGORIA_EQUIPO_LABEL[e.categoriaEquipo]}
                      {e.marcaModelo ? ` · ${e.marcaModelo}` : ""}
                      {e.posicionU ? ` · ${e.posicionU}` : ""}
                      {e.etiquetaYpf ? ` · YPF ${e.etiquetaYpf}` : ""}
                      {e.cantidad > 1 ? ` · x${e.cantidad}` : ""}
                      {e.consumoPromedioW ? ` · ~${e.consumoPromedioW}W prom.` : ""}
                      {e.consumoMaxW ? ` · ~${e.consumoMaxW}W máx.` : ""}
                      {e.bocasDisponibles != null ? ` · ${e.bocasDisponibles} bocas disp.` : ""}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div className="field" style={{ marginBottom: 0, width: 150 }}>
                      <label style={{ fontSize: 11 }}>Estado</label>
                      <select value={l.estado} onChange={(ev) => actualizarLectura(i, { estado: ev.target.value })} disabled={submitting}>
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
                        onChange={(ev) => actualizarLectura(i, { comentario: ev.target.value })}
                        disabled={submitting}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={agregarEquipo} disabled={submitting} style={{ marginTop: 10 }}>
            <Icon name="plus" size={13} /> Agregar equipo
          </button>
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
      {success && (
        <>
          <SuccessNote>
            Relevamiento guardado ({success.numeroGeneracion})
            {success.pdfUrl ? " — " : ""}
            {success.pdfUrl && <VerPdfLink obtenerUrl={() => obtenerUrlPdfRelevamientoAction(success.relevamientoId)} />}
          </SuccessNote>
          <div className="footer-nav">
            <span />
            <button type="button" className="btn btn-primary" onClick={empezarOtro}>
              + Cargar otro relevamiento
            </button>
          </div>
        </>
      )}
      {!success && (
        <div className="footer-nav">
          <span />
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={submitting}>
            {submitting ? "Guardando..." : "Guardar y generar PDF"}
          </button>
        </div>
      )}
    </div>
  );
}
