"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UbicacionFields, type GpsCapturado } from "@/components/ubicaciones/ubicacion-fields";
import { entregarLoteADepositoAction } from "@/app/(app)/entregas-deposito/nueva/actions";
import {
  MOTIVO_ENTREGA_OPCIONES,
  MOTIVO_ENTREGA_LABEL,
  CONDICION_OPCIONES,
  CONDICION_LABEL,
  ENTREGA_FOTO_IA_MAX,
  ENTREGA_FOTOS_EVIDENCIA_MAX,
  MATERIAL_NUEVO_BASE,
  type MaterialEntregaItem,
} from "./types";
import { ErrorNote } from "@/components/notes";
import { Icon } from "@/components/icon";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { reportarErrorCliente } from "@/lib/client-error-report";
import type { Ubicacion } from "@/components/ubicaciones/types";
import type { CondicionMaterial, MotivoEntregaDeposito } from "@/lib/database.types";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Entrega a depósito de material/equipo que nunca se registró como
 * equipamiento de un sitio (cables sueltos, repuestos, equipo nuevo sin
 * instalar). Una misma carga puede traer VARIOS materiales distintos de la
 * misma visita — sacás fotos de todos juntos y la IA los separa en una
 * lista (igual criterio que Equipos Individuales), revisás/corregís cada
 * uno y generás un solo comprobante con todos adentro.
 */
export function NuevaEntregaForm({ provincias, ubicaciones }: { provincias: string[]; ubicaciones: Ubicacion[] }) {
  const [provinciaFiltro, setProvinciaFiltro] = useState("");
  const [ubicacionId, setUbicacionId] = useState("");
  const [localidadNueva, setLocalidadNueva] = useState("");
  const [sitioNueva, setSitioNueva] = useState("");
  const [plantaNueva, setPlantaNueva] = useState("");
  const [oficinaNueva, setOficinaNueva] = useState("");
  const [gps, setGps] = useState<GpsCapturado | null>(null);
  const [fecha, setFecha] = useState(hoyISO);
  const [materiales, setMateriales] = useState<MaterialEntregaItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ numeroGeneracion: string } | null>(null);
  const [fotosIa, setFotosIa] = useState<File[]>([]);
  const [iaBusy, setIaBusy] = useState(false);
  const [iaNote, setIaNote] = useState<string | null>(null);
  const fotoCameraInputRef = useRef<HTMLInputElement>(null);
  const fotoGaleriaInputRef = useRef<HTMLInputElement>(null);
  const [fotosEvidencia, setFotosEvidencia] = useState<File[]>([]);
  const fotoEvidenciaCameraInputRef = useRef<HTMLInputElement>(null);
  const fotoEvidenciaGaleriaInputRef = useRef<HTMLInputElement>(null);
  const fotosEvidenciaPreviews = useMemo(() => fotosEvidencia.map((f) => URL.createObjectURL(f)), [fotosEvidencia]);
  useEffect(() => {
    return () => fotosEvidenciaPreviews.forEach((url) => URL.revokeObjectURL(url));
  }, [fotosEvidenciaPreviews]);

  function elegirProvinciaFiltro(p: string) {
    setProvinciaFiltro(p);
    setLocalidadNueva("");
    setSitioNueva("");
    setPlantaNueva("");
    setOficinaNueva("");
  }

  function elegirUbicacion(id: string) {
    setUbicacionId(id);
    if (id !== "__new") {
      setLocalidadNueva("");
      setSitioNueva("");
      setPlantaNueva("");
      setOficinaNueva("");
    }
  }

  function agregarFotosIa(files: File[]) {
    if (files.length === 0) return;
    setIaNote(null);
    setFotosIa((prev) => {
      const disponibles = ENTREGA_FOTO_IA_MAX - prev.length;
      if (disponibles <= 0) return prev;
      return [...prev, ...files.slice(0, disponibles)];
    });
  }

  function quitarFotoIa(i: number) {
    setFotosIa((prev) => prev.filter((_, idx) => idx !== i));
  }

  function agregarFotosEvidencia(files: File[]) {
    if (files.length === 0) return;
    setFotosEvidencia((prev) => {
      const disponibles = ENTREGA_FOTOS_EVIDENCIA_MAX - prev.length;
      if (disponibles <= 0) return prev;
      return [...prev, ...files.slice(0, disponibles)];
    });
  }

  function quitarFotoEvidencia(i: number) {
    setFotosEvidencia((prev) => prev.filter((_, idx) => idx !== i));
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
          fd.append("fotos", jpeg, "entrega.jpg");
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
      const res = await fetch("/api/entregas-deposito/leer-foto", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setIaNote(data.error || "No se pudo leer las fotos.");
        setFotosIa(fallidas);
        return;
      }
      const detectados: {
        descripcion: string;
        categoriaLabel: string;
        marcaModelo: string;
        numeroSerie: string;
        etiquetaYpf: string;
        identificado: boolean;
      }[] = data.items ?? [];
      if (detectados.length === 0) {
        setIaNote(
          "No se detectó ningún material/equipo en las fotos — probá con otras o cargalo a mano." +
            (fallidas.length > 0 ? ` (${fallidas.length} foto${fallidas.length === 1 ? "" : "s"} no se pudo leer: ${primerError})` : ""),
        );
        setFotosIa(fallidas);
        return;
      }
      setMateriales((prev) => [
        ...prev,
        ...detectados.map((d) => ({
          ...MATERIAL_NUEVO_BASE,
          descripcion: d.descripcion,
          categoria: d.categoriaLabel,
          marcaModelo: d.marcaModelo,
          numeroSerie: d.numeroSerie,
          etiquetaYpf: d.etiquetaYpf,
          revisar: d.identificado !== true,
        })),
      ]);
      const sinEtiqueta = detectados.filter((d) => d.identificado !== true).length;
      setIaNote(
        `Se identificaron ${detectados.length} material${detectados.length === 1 ? "" : "es"} desde ${exitosas} foto${exitosas === 1 ? "" : "s"}` +
          (sinEtiqueta > 0
            ? ` — ${sinEtiqueta} sin etiqueta legible, marcados para revisar.`
            : " — revisá la categoría/marca/serie antes de guardar.") +
          " Completá la cantidad de cada uno a mano." +
          (fallidas.length > 0 ? ` (${fallidas.length} foto${fallidas.length === 1 ? "" : "s"} no se pudo leer: ${primerError})` : ""),
      );
      setFotosIa(fallidas);
    } catch (err) {
      setIaNote("No se pudo leer las fotos.");
      reportarErrorCliente(err instanceof Error ? err.message : "Error leyendo fotos de entrega a depósito con IA", "leer-foto-entrega-deposito");
    } finally {
      setIaBusy(false);
    }
  }

  function agregarMaterial() {
    setMateriales((prev) => [...prev, { ...MATERIAL_NUEVO_BASE, descripcion: "", revisar: false }]);
  }

  function actualizarMaterial(i: number, patch: Partial<MaterialEntregaItem>) {
    setMateriales((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  function quitarMaterial(i: number) {
    setMateriales((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function crear() {
    if (!ubicacionId) {
      setError("Elegí o creá el sitio desde el que vuelve el material.");
      return;
    }
    if (ubicacionId === "__new" && (!provinciaFiltro.trim() || !sitioNueva.trim())) {
      setError("Completá la provincia y el sitio de la ubicación nueva.");
      return;
    }
    if (materiales.length === 0) {
      setError("Agregá al menos un material.");
      return;
    }
    if (materiales.some((m) => !m.descripcion.trim())) {
      setError("Completá la descripción de todos los materiales cargados.");
      return;
    }
    if (!fecha) {
      setError("Falta la fecha.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append(
        "payload",
        JSON.stringify({
          ubicacionId: ubicacionId === "__new" ? null : ubicacionId,
          ubicacionNueva:
            ubicacionId === "__new"
              ? { provincia: provinciaFiltro, localidad: localidadNueva, sitio: sitioNueva, planta: plantaNueva, oficina: oficinaNueva }
              : null,
          gps,
          fecha,
          materiales: materiales.map((m) => ({
            descripcion: m.descripcion.trim(),
            categoria: m.categoria.trim(),
            marcaModelo: m.marcaModelo.trim(),
            numeroSerie: m.numeroSerie.trim(),
            etiquetaYpf: m.etiquetaYpf.trim(),
            cantidad: m.cantidad,
            condicion: m.condicion,
            motivo: m.motivo,
            comentario: m.comentario.trim(),
          })),
        }),
      );
      for (const foto of fotosEvidencia) {
        const jpeg = await resizeImageToJpeg(foto);
        fd.append("fotosEvidencia", jpeg, "evidencia.jpg");
      }
      const res = await entregarLoteADepositoAction(fd);
      if (!res.success || !res.numeroGeneracion) {
        setError(res.error || "No se pudo registrar la entrega.");
        return;
      }
      setResultado({ numeroGeneracion: res.numeroGeneracion });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "No se pudo leer alguna de las fotos de evidencia.";
      setError(mensaje);
      reportarErrorCliente(mensaje, "crear-entrega-deposito-lote");
    } finally {
      setSubmitting(false);
    }
  }

  function empezarOtra() {
    setResultado(null);
    setProvinciaFiltro("");
    setUbicacionId("");
    setLocalidadNueva("");
    setSitioNueva("");
    setPlantaNueva("");
    setOficinaNueva("");
    setGps(null);
    setFecha(hoyISO());
    setMateriales([]);
    setFotosIa([]);
    setIaNote(null);
    setFotosEvidencia([]);
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Nueva Entrega a Depósito</h1>
        <p>Material o equipo que vuelve al depósito sin haber estado cargado como equipamiento de un sitio</p>
      </div>

      <div className="card">
        <div className="section-label">Sitio desde el que vuelve</div>
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
          <div className="field" style={{ marginBottom: 0 }}>
            <label>
              Fecha <span className="req">*</span>
            </label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={submitting} style={{ maxWidth: 220 }} />
          </div>
        </div>
      )}

      {ubicacionId && (
        <div className="card">
          <div className="section-label">Materiales</div>
          <div className="hint" style={{ margin: "-4px 0 12px" }}>
            <Icon name="ai" size={13} /> Sacale hasta {ENTREGA_FOTO_IA_MAX} fotos a los materiales/equipos (chapa de serie, vista
            general) y la IA identifica qué son y combina todo en una lista sin repetir — podés sacar fotos de varios materiales
            distintos de una sola vez. Siempre revisá antes de guardar, y completá la cantidad a mano.
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
              disabled={submitting || iaBusy || fotosIa.length >= ENTREGA_FOTO_IA_MAX}
            >
              <Icon name="camera" size={13} /> Sacar foto ({fotosIa.length}/{ENTREGA_FOTO_IA_MAX})
            </button>
            <button
              type="button"
              className="ai-btn"
              onClick={() => fotoGaleriaInputRef.current?.click()}
              disabled={submitting || iaBusy || fotosIa.length >= ENTREGA_FOTO_IA_MAX}
            >
              <Icon name="upload" size={13} /> Subir foto
            </button>
            {fotosIa.length > 0 && (
              <button type="button" className="ai-btn" onClick={() => void leerFotosConIa()} disabled={submitting || iaBusy}>
                <Icon name="ai" size={13} /> {iaBusy ? "Procesando..." : `Procesar ${fotosIa.length} foto${fotosIa.length === 1 ? "" : "s"} con IA`}
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

          {materiales.length === 0 && <div className="empty-note">Todavía no hay materiales cargados.</div>}
          <div className="item-list" style={{ marginTop: materiales.length ? 0 : 12 }}>
            {materiales.map((m, i) => (
              <div className="list-item" key={i} style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                {m.revisar && (
                  <div className="hint" style={{ color: "var(--warn)", margin: 0 }}>
                    <Icon name="warning" size={12} /> Sin etiqueta legible en la foto — revisá y corregí lo que no coincida.
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
                    <label style={{ fontSize: 11 }}>Descripción</label>
                    <input
                      type="text"
                      placeholder="Ej: UPS nueva sin instalar"
                      value={m.descripcion}
                      onChange={(e) => actualizarMaterial(i, { descripcion: e.target.value, revisar: false })}
                      disabled={submitting}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0, width: 150 }}>
                    <label style={{ fontSize: 11 }}>Categoría</label>
                    <input
                      type="text"
                      placeholder="Opcional"
                      value={m.categoria}
                      onChange={(e) => actualizarMaterial(i, { categoria: e.target.value })}
                      disabled={submitting}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0, width: 80 }}>
                    <label style={{ fontSize: 11 }}>Cantidad</label>
                    <input
                      type="number"
                      min={1}
                      value={m.cantidad}
                      onChange={(e) => actualizarMaterial(i, { cantidad: Math.max(1, Number(e.target.value) || 1) })}
                      disabled={submitting}
                    />
                  </div>
                  <button type="button" className="remove-btn" onClick={() => quitarMaterial(i)} disabled={submitting}>
                    <Icon name="x" size={12} />
                  </button>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div className="field" style={{ marginBottom: 0, width: 150 }}>
                    <label style={{ fontSize: 11 }}>Marca/Modelo</label>
                    <input
                      type="text"
                      placeholder="Opcional"
                      value={m.marcaModelo}
                      onChange={(e) => actualizarMaterial(i, { marcaModelo: e.target.value })}
                      disabled={submitting}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0, width: 150 }}>
                    <label style={{ fontSize: 11 }}>N° de Serie</label>
                    <input
                      type="text"
                      placeholder="Opcional"
                      value={m.numeroSerie}
                      onChange={(e) => actualizarMaterial(i, { numeroSerie: e.target.value })}
                      disabled={submitting}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0, width: 110 }}>
                    <label style={{ fontSize: 11 }}>Etiqueta YPF</label>
                    <input
                      type="text"
                      placeholder="N° inventario"
                      value={m.etiquetaYpf}
                      onChange={(e) => actualizarMaterial(i, { etiquetaYpf: e.target.value })}
                      disabled={submitting}
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0, width: 160 }}>
                    <label style={{ fontSize: 11 }}>Condición</label>
                    <select
                      value={m.condicion}
                      onChange={(e) => actualizarMaterial(i, { condicion: e.target.value as CondicionMaterial })}
                      disabled={submitting}
                    >
                      {CONDICION_OPCIONES.map((c) => (
                        <option key={c} value={c}>
                          {CONDICION_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div className="field" style={{ marginBottom: 0, width: 220 }}>
                    <label style={{ fontSize: 11 }}>Motivo</label>
                    <select
                      value={m.motivo}
                      onChange={(e) => actualizarMaterial(i, { motivo: e.target.value as MotivoEntregaDeposito })}
                      disabled={submitting}
                    >
                      {MOTIVO_ENTREGA_OPCIONES.map((o) => (
                        <option key={o} value={o}>
                          {MOTIVO_ENTREGA_LABEL[o]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 160 }}>
                    <label style={{ fontSize: 11 }}>Comentario</label>
                    <input
                      type="text"
                      placeholder="Opcional"
                      value={m.comentario}
                      onChange={(e) => actualizarMaterial(i, { comentario: e.target.value })}
                      disabled={submitting}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={agregarMaterial} disabled={submitting} style={{ marginTop: 10 }}>
            <Icon name="plus" size={13} /> Agregar material manual
          </button>
        </div>
      )}

      {ubicacionId && (
        <div className="card">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>
              Foto(s) de evidencia <span className="opt">(opcional, hasta {ENTREGA_FOTOS_EVIDENCIA_MAX})</span>
            </label>
            <div className="hint" style={{ margin: "-2px 0 8px" }}>
              Una vista general de lo que se entrega — queda guardada y se imprime en el comprobante. Distinta de las
              fotos de arriba: esas se usan para identificar y no se guardan.
            </div>
            <input
              ref={fotoEvidenciaCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                agregarFotosEvidencia(files);
              }}
            />
            <input
              ref={fotoEvidenciaGaleriaInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                agregarFotosEvidencia(files);
              }}
            />
            {fotosEvidencia.length > 0 && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                {fotosEvidencia.map((f, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- preview local, no vale la pena next/image acá */}
                    <img
                      src={fotosEvidenciaPreviews[i]}
                      alt=""
                      style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid var(--field-border)" }}
                    />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => quitarFotoEvidencia(i)} disabled={submitting}>
                      <Icon name="x" size={12} /> Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}
            {fotosEvidencia.length < ENTREGA_FOTOS_EVIDENCIA_MAX && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="ai-btn"
                  onClick={() => fotoEvidenciaCameraInputRef.current?.click()}
                  disabled={submitting}
                >
                  <Icon name="camera" size={13} /> Sacar foto
                </button>
                <button
                  type="button"
                  className="ai-btn"
                  onClick={() => fotoEvidenciaGaleriaInputRef.current?.click()}
                  disabled={submitting}
                >
                  <Icon name="upload" size={13} /> Subir foto
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      {resultado && (
        <div className="banner" style={{ marginBottom: 16 }}>
          Entrega registrada — comprobante <b>{resultado.numeroGeneracion}</b> generado con {materiales.length} material
          {materiales.length === 1 ? "" : "es"}. Lo encontrás en el <b>Historial</b>.
        </div>
      )}

      {resultado ? (
        <div className="footer-nav">
          <span />
          <button type="button" className="btn btn-primary" onClick={empezarOtra}>
            + Cargar otra entrega
          </button>
        </div>
      ) : (
        <div className="footer-nav">
          <span />
          <button type="button" className="btn btn-primary" onClick={crear} disabled={submitting}>
            {submitting ? "Generando..." : "Registrar entrega"}
          </button>
        </div>
      )}
    </div>
  );
}
