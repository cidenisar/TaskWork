"use client";

import { useRef, useState } from "react";
import { crearSalaAction } from "@/app/(app)/salas/nuevo/actions";
import { reportarErrorCliente } from "@/lib/client-error-report";
import { resizeImageToJpeg } from "@/lib/image-resize";
import { ErrorNote, SuccessNote } from "@/components/notes";
import { Icon } from "@/components/icon";
import { VerPdfLink } from "@/components/ver-pdf-link";
import { obtenerUrlPdfSalaAction } from "@/app/(app)/salas/historial/actions";
import { UbicacionFields, type GpsCapturado } from "@/components/ubicaciones/ubicacion-fields";
import type { Ubicacion } from "@/components/ubicaciones/types";
import type { SalaTipoConstruccion } from "@/lib/database.types";
import { SALA_FOTO_GENERAL_MAX, SALA_TIPO_CONSTRUCCION_OPCIONES, SALA_TIPO_CONSTRUCCION_LABEL } from "./types";

/**
 * Alta/relevamiento de una Sala/Shelter/Container — a diferencia de
 * Tableros/Racks/Torres, no tiene lista de equipamiento propia (eso ya se
 * releva aparte, dentro de la sala): es solo denominación, tipo de
 * construcción y fotos. Las visitas siguientes (limpieza, obra civil,
 * arreglos) quedan en el Plan de Mantenimiento, no acá.
 */
export function NuevoRelevamientoSalaForm({ ubicaciones, provincias }: { ubicaciones: Ubicacion[]; provincias: string[] }) {
  const [provinciaFiltro, setProvinciaFiltro] = useState("");
  const [ubicacionId, setUbicacionId] = useState<string>(""); // "" = sin elegir, "__new" = crear
  const [localidadNueva, setLocalidadNueva] = useState("");
  const [sitioNueva, setSitioNueva] = useState("");
  const [plantaNueva, setPlantaNueva] = useState("");
  const [oficinaNueva, setOficinaNueva] = useState("");
  const [gps, setGps] = useState<GpsCapturado | null>(null);
  const [denominacion, setDenominacion] = useState("");
  const [tipoConstruccion, setTipoConstruccion] = useState<SalaTipoConstruccion | "">("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [fotosGenerales, setFotosGenerales] = useState<File[]>([]);
  const fotoCameraInputRef = useRef<HTMLInputElement>(null);
  const fotoGaleriaInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ salaId: string; numeroGeneracion: string; pdfUrl: string | null } | null>(null);

  function agregarFotos(files: File[]) {
    if (files.length === 0) return;
    setFotosGenerales((prev) => {
      const disponibles = SALA_FOTO_GENERAL_MAX - prev.length;
      if (disponibles <= 0) return prev;
      return [...prev, ...files.slice(0, disponibles)];
    });
  }

  function quitarFoto(i: number) {
    setFotosGenerales((prev) => prev.filter((_, idx) => idx !== i));
  }

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
    if (id !== "__new") {
      setLocalidadNueva("");
      setSitioNueva("");
      setPlantaNueva("");
      setOficinaNueva("");
    }
  }

  async function guardar() {
    setError(null);
    if (!ubicacionId) {
      setError("Elegí o creá la ubicación de la sala.");
      return;
    }
    if (ubicacionId === "__new" && (!provinciaFiltro.trim() || !sitioNueva.trim())) {
      setError("Completá la provincia y el sitio de la ubicación nueva.");
      return;
    }
    if (!denominacion.trim()) {
      setError("Falta la denominación de la sala (ej: Sala de energía 1er piso).");
      return;
    }
    if (!tipoConstruccion) {
      setError("Elegí el tipo de construcción.");
      return;
    }

    setSubmitting(true);
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
          denominacion: denominacion.trim(),
          tipoConstruccion,
          fecha,
        }),
      );
      for (let i = 0; i < fotosGenerales.length; i++) {
        try {
          const jpeg = await resizeImageToJpeg(fotosGenerales[i]);
          fd.append("fotoGeneral", jpeg, `general-${i + 1}.jpg`);
        } catch (err) {
          setError(err instanceof Error ? err.message : "No se pudo leer una de las fotos.");
          setSubmitting(false);
          return;
        }
      }
      const res = await crearSalaAction(fd);
      if (!res.success) {
        const mensaje = res.error || "No se pudo guardar la sala.";
        setError(mensaje);
        reportarErrorCliente(mensaje, "crear-sala");
        return;
      }
      setSuccess({ salaId: res.salaId!, numeroGeneracion: res.numeroGeneracion!, pdfUrl: res.pdfUrl ?? null });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Ocurrió un error inesperado guardando la sala.";
      setError(mensaje);
      reportarErrorCliente(mensaje, "crear-sala", err instanceof Error ? err.stack : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  function empezarOtra() {
    setSuccess(null);
    setUbicacionId("");
    setDenominacion("");
    setTipoConstruccion("");
    setFotosGenerales([]);
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Nueva Sala / Shelter</h1>
        <p>Relevá el ambiente físico en sí (sala, shelter o container) — el equipamiento que tiene adentro se releva aparte.</p>
      </div>

      <div className="card">
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
          <div className="field">
            <label>
              Denominación <span className="req">*</span>
            </label>
            <input
              type="text"
              placeholder="Ej: Sala de energía 1er piso, Shelter Luján 1..."
              value={denominacion}
              onChange={(e) => setDenominacion(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="field">
            <label>
              Tipo de construcción <span className="req">*</span>
            </label>
            <select value={tipoConstruccion} onChange={(e) => setTipoConstruccion(e.target.value as SalaTipoConstruccion)} disabled={submitting}>
              <option value="">Seleccionar...</option>
              {SALA_TIPO_CONSTRUCCION_OPCIONES.map((t) => (
                <option key={t} value={t}>
                  {SALA_TIPO_CONSTRUCCION_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid2">
            <div className="field">
              <label>
                Fecha <span className="req">*</span>
              </label>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={submitting} style={{ maxWidth: 220 }} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>
                Fotos <span className="opt">(opcional)</span>
              </label>
              <div className="hint" style={{ margin: "-2px 0 8px" }}>
                Hasta {SALA_FOTO_GENERAL_MAX} fotos — quedan guardadas como registro y se imprimen en el PDF.
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
                  agregarFotos(files);
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
                  agregarFotos(files);
                }}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: fotosGenerales.length ? 8 : 0 }}>
                <button
                  type="button"
                  className="ai-btn"
                  onClick={() => fotoCameraInputRef.current?.click()}
                  disabled={submitting || fotosGenerales.length >= SALA_FOTO_GENERAL_MAX}
                >
                  <Icon name="camera" size={13} /> Sacar foto ({fotosGenerales.length}/{SALA_FOTO_GENERAL_MAX})
                </button>
                <button
                  type="button"
                  className="ai-btn"
                  onClick={() => fotoGaleriaInputRef.current?.click()}
                  disabled={submitting || fotosGenerales.length >= SALA_FOTO_GENERAL_MAX}
                >
                  <Icon name="upload" size={13} /> Subir foto
                </button>
              </div>
              {fotosGenerales.length > 0 && (
                <div className="chip-row" style={{ marginTop: 0 }}>
                  {fotosGenerales.map((f, i) => (
                    <span className="chip" key={i}>
                      Foto {i + 1}
                      <button type="button" onClick={() => quitarFoto(i)} disabled={submitting} aria-label={`Quitar foto ${i + 1}`}>
                        <Icon name="x" size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
      {success && (
        <>
          <SuccessNote>
            Sala guardada (N° {success.numeroGeneracion}).{" "}
            {success.pdfUrl && <VerPdfLink obtenerUrl={() => obtenerUrlPdfSalaAction(success.salaId)} />}
          </SuccessNote>
          <div className="footer-nav">
            <span />
            <button type="button" className="btn btn-primary" onClick={empezarOtra}>
              + Relevar otra sala
            </button>
          </div>
        </>
      )}
      {!success && (
        <div className="footer-nav">
          <span />
          <button type="button" className="btn btn-primary" onClick={guardar} disabled={submitting}>
            {submitting ? "Guardando..." : "Guardar sala"}
          </button>
        </div>
      )}
    </div>
  );
}
