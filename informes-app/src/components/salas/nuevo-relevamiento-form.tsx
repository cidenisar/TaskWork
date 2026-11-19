"use client";

import { useRef, useState } from "react";
import { crearSalaAction } from "@/app/(app)/salas/nuevo/actions";
import { reportarErrorCliente } from "@/lib/client-error-report";
import { resizeImagesToBudget } from "@/lib/image-resize";
import { ErrorNote, SuccessNote } from "@/components/notes";
import { Icon } from "@/components/icon";
import { VerPdfLink } from "@/components/ver-pdf-link";
import { obtenerUrlPdfSalaAction } from "@/app/(app)/salas/historial/actions";
import { UbicacionFields, type GpsCapturado } from "@/components/ubicaciones/ubicacion-fields";
import type { Ubicacion } from "@/components/ubicaciones/types";
import type { EstadoChecklist, SalaTipoConstruccion } from "@/lib/database.types";
import { mezclarHallazgos, type HallazgoInspeccionIa } from "@/lib/inspeccion-ia/types";
import { HallazgosInspeccionIaSection } from "@/components/inspeccion-ia/hallazgos-section";
import { conVinetas, lineasDeTareas } from "@/lib/tareas/puro";
import { TareasTextarea } from "@/components/informe-tecnico/tareas-textarea";
import { SALA_FOTO_GENERAL_MAX, SALA_FOTO_IA_POR_TANDA, SALA_TIPO_CONSTRUCCION_OPCIONES, SALA_TIPO_CONSTRUCCION_LABEL } from "./types";

/** Tope del total de fotos que se mandan al guardar (el pedido completo no puede pasar de ~4,5 MB en Vercel). */
const PRESUPUESTO_FOTOS_BYTES = 3_500_000;

/**
 * Alta/relevamiento de una Sala/Shelter/Container — a diferencia de
 * Tableros/Racks/Torres, no tiene lista de equipamiento propia (eso ya se
 * releva aparte, dentro de la sala): es solo denominación, tipo de
 * construcción y fotos. Las visitas siguientes (limpieza, obra civil,
 * arreglos) quedan en el Plan de Mantenimiento, no acá.
 */
export function NuevoRelevamientoSalaForm({
  ubicaciones,
  provincias,
  catalogoHallazgos,
}: {
  ubicaciones: Ubicacion[];
  provincias: string[];
  catalogoHallazgos: { id: string; texto: string }[];
}) {
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
  // Inspección IA: puntos del catálogo (los completa la IA y los confirma quien releva) + observaciones libres.
  const [hallazgos, setHallazgos] = useState<HallazgoInspeccionIa[]>(() =>
    catalogoHallazgos.map((h) => ({ itemId: h.id, texto: h.texto, estado: null, comentario: "" })),
  );
  const [observaciones, setObservaciones] = useState("");
  const [iaBusy, setIaBusy] = useState(false);
  const [iaNote, setIaNote] = useState<string | null>(null);
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

  function setEstadoHallazgo(itemId: string, estado: EstadoChecklist) {
    setHallazgos((prev) => prev.map((h) => (h.itemId === itemId ? { ...h, estado } : h)));
  }
  function setComentarioHallazgo(itemId: string, comentario: string) {
    setHallazgos((prev) => prev.map((h) => (h.itemId === itemId ? { ...h, comentario } : h)));
  }

  async function analizarConIa() {
    if (fotosGenerales.length === 0) return;
    setIaBusy(true);
    setIaNote(null);
    try {
      // Las fotos se mandan en tandas (ver SALA_FOTO_IA_POR_TANDA) y los resultados se combinan: un punto
      // detectado en cualquier tanda se mantiene aunque otra tanda (otra zona de la sala) no lo vea.
      const tandas: File[][] = [];
      for (let i = 0; i < fotosGenerales.length; i += SALA_FOTO_IA_POR_TANDA) tandas.push(fotosGenerales.slice(i, i + SALA_FOTO_IA_POR_TANDA));

      let acumulados = hallazgos;
      let obsActuales = lineasDeTareas(observaciones);
      let obsNuevas = 0;
      let tandasOk = 0;
      let primerError: string | null = null;

      for (let t = 0; t < tandas.length; t++) {
        setIaNote(tandas.length > 1 ? `Analizando fotos… tanda ${t + 1} de ${tandas.length}` : null);
        const fd = new FormData();
        // Cada tanda también tiene que entrar en un pedido (~4,5 MB): 5 fotos a 1600 px pueden pasarse.
        const jpegs = await resizeImagesToBudget(tandas[t], PRESUPUESTO_FOTOS_BYTES, [1600, 1280, 1024, 800], 0.8);
        jpegs.forEach((jpeg, i) => fd.append("fotos", jpeg, `sala-${t * SALA_FOTO_IA_POR_TANDA + i + 1}.jpg`));
        if (tipoConstruccion) fd.append("tipoConstruccion", tipoConstruccion);
        const res = await fetch("/api/salas/leer-foto", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          primerError = primerError ?? (data.error || "No se pudo analizar las fotos.");
          if (res.status === 429) break; // tope de uso: seguir solo lo empeora
          continue;
        }
        tandasOk++;
        acumulados = mezclarHallazgos(acumulados, data.hallazgos ?? []);
        const propuestas: string[] = data.observaciones ?? [];
        const nuevas = propuestas.filter((o) => !obsActuales.some((a) => a.toLowerCase() === o.toLowerCase()));
        obsNuevas += nuevas.length;
        obsActuales = [...obsActuales, ...nuevas];
        setHallazgos(acumulados);
        if (nuevas.length > 0) setObservaciones(conVinetas(obsActuales));
      }

      if (tandasOk === 0) {
        setIaNote(primerError || "No se pudo analizar las fotos.");
        return;
      }
      const detectados = acumulados.filter((h) => h.estado === "no_ok").length;
      setIaNote(
        `Se analizaron ${fotosGenerales.length} foto${fotosGenerales.length === 1 ? "" : "s"}: ` +
          (detectados > 0 ? `⚠ ${detectados} punto${detectados === 1 ? "" : "s"} para reparar o mejorar` : "ningún punto de la lista con problema") +
          (obsNuevas > 0 ? ` y ${obsNuevas} observación${obsNuevas === 1 ? "" : "es"} más` : "") +
          "." +
          (tandasOk < tandas.length ? ` ⚠ ${tandas.length - tandasOk} de ${tandas.length} tandas de fotos no se pudieron analizar${primerError ? ` (${primerError})` : ""} — probá de nuevo.` : "") +
          " Revisalo antes de guardar: la IA propone, vos confirmás.",
      );
    } catch (err) {
      setIaNote(err instanceof Error ? err.message : "No se pudo analizar las fotos.");
      reportarErrorCliente(err instanceof Error ? err.message : "Error analizando fotos de sala con IA", "leer-foto-sala");
    } finally {
      setIaBusy(false);
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
          hallazgos: hallazgos
            .filter((h) => h.estado !== null)
            .map((h) => ({ itemId: h.itemId, estado: h.estado, comentario: h.comentario.trim() })),
          observaciones,
        }),
      );
      // Las fotos van en el mismo pedido que crea la sala y genera el PDF: Vercel rechaza los pedidos de más de
      // ~4,5 MB, así que se achican hasta que entren juntas (con 14 fotos a tamaño completo no entraban).
      try {
        const jpegs = await resizeImagesToBudget(fotosGenerales, PRESUPUESTO_FOTOS_BYTES);
        jpegs.forEach((jpeg, i) => fd.append("fotoGeneral", jpeg, `general-${i + 1}.jpg`));
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo leer una de las fotos.");
        setSubmitting(false);
        return;
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
    setHallazgos(catalogoHallazgos.map((h) => ({ itemId: h.id, texto: h.texto, estado: null, comentario: "" })));
    setObservaciones("");
    setIaNote(null);
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

      {ubicacionId && (
        <div className="card">
          <div className="section-label">Inspección IA — qué reparar o mejorar</div>
          <div className="hint" style={{ margin: "-2px 0 10px" }}>
            Sacá las fotos de la sala (puerta, techo y paredes, piso, aire acondicionado, tableros, racks, cableado) y tocá analizar: la IA
            revisa una lista de puntos y suma lo que vea de más. Después confirmás o corregís cada uno.
          </div>
          <button
            type="button"
            className="ai-btn"
            onClick={() => void analizarConIa()}
            disabled={submitting || iaBusy || fotosGenerales.length === 0}
          >
            <Icon name="ai" size={13} />{" "}
            {iaBusy ? "Analizando..." : fotosGenerales.length === 0 ? "Cargá fotos para analizar" : `Analizar ${fotosGenerales.length} foto${fotosGenerales.length === 1 ? "" : "s"} con IA`}
          </button>
          {iaNote && (
            <div className="ai-note" style={{ marginTop: 10 }}>
              <span>{iaNote}</span>
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <HallazgosInspeccionIaSection hallazgos={hallazgos} onEstado={setEstadoHallazgo} onComentario={setComentarioHallazgo} disabled={submitting} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>
              Otras cosas para reparar o mejorar <span className="opt">(opcional)</span>
            </label>
            <TareasTextarea
              value={observaciones}
              onChange={setObservaciones}
              placeholder={"Una por línea, ej:\nCable de datos colgando frente al rack\nSellar el pasacables del lado norte"}
            />
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
