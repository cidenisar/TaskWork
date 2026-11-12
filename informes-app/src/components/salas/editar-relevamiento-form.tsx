"use client";

import { useState } from "react";
import Link from "next/link";
import { actualizarSalaAction } from "@/app/(app)/salas/editar/[id]/actions";
import { reportarErrorCliente } from "@/lib/client-error-report";
import { ErrorNote, SuccessNote } from "@/components/notes";
import { VerPdfLink } from "@/components/ver-pdf-link";
import { obtenerUrlPdfSalaAction } from "@/app/(app)/salas/historial/actions";
import { UbicacionFields, type GpsCapturado } from "@/components/ubicaciones/ubicacion-fields";
import type { Ubicacion } from "@/components/ubicaciones/types";
import type { SalaTipoConstruccion } from "@/lib/database.types";
import { SALA_TIPO_CONSTRUCCION_OPCIONES, SALA_TIPO_CONSTRUCCION_LABEL } from "./types";

interface InitialForm {
  provinciaFiltro: string;
  ubicacionId: string;
  localidadNueva: string;
  sitioNueva: string;
  plantaNueva: string;
  oficinaNueva: string;
  gps: GpsCapturado | null;
  denominacion: string;
  tipoConstruccion: SalaTipoConstruccion;
  fecha: string;
}

/**
 * Edición (solo Administrador) de una sala ya relevada — mismo criterio que
 * informe-tecnico/wizard-editar.tsx: reabre el formulario precargado. Las
 * fotos generales quedan como están (ver actualizarSalaAction) — no hay UI
 * acá para agregar/sacar fotos, solo se muestra cuántas tiene guardadas.
 */
export function EditarRelevamientoSalaForm({
  salaId,
  numeroGeneracion,
  cantidadFotos,
  initialForm,
  ubicaciones,
  provincias,
}: {
  salaId: string;
  numeroGeneracion: string;
  cantidadFotos: number;
  initialForm: InitialForm;
  ubicaciones: Ubicacion[];
  provincias: string[];
}) {
  const [provinciaFiltro, setProvinciaFiltro] = useState(initialForm.provinciaFiltro);
  const [ubicacionId, setUbicacionId] = useState<string>(initialForm.ubicacionId);
  const [localidadNueva, setLocalidadNueva] = useState(initialForm.localidadNueva);
  const [sitioNueva, setSitioNueva] = useState(initialForm.sitioNueva);
  const [plantaNueva, setPlantaNueva] = useState(initialForm.plantaNueva);
  const [oficinaNueva, setOficinaNueva] = useState(initialForm.oficinaNueva);
  const [gps, setGps] = useState<GpsCapturado | null>(initialForm.gps);
  const [denominacion, setDenominacion] = useState(initialForm.denominacion);
  const [tipoConstruccion, setTipoConstruccion] = useState<SalaTipoConstruccion | "">(initialForm.tipoConstruccion);
  const [fecha, setFecha] = useState(initialForm.fecha);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ pdfUrl: string | null } | null>(null);

  function elegirProvinciaFiltro(provincia: string) {
    setProvinciaFiltro(provincia);
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
          ubicacionId: ubicacionId === initialForm.ubicacionId ? "" : ubicacionId,
          provinciaFiltro,
          localidadNueva,
          sitioNueva,
          plantaNueva,
          oficinaNueva,
          gps,
          denominacion: denominacion.trim(),
          tipoConstruccion,
          fecha,
        }),
      );
      const res = await actualizarSalaAction(salaId, fd);
      if (!res.success) {
        const mensaje = res.error || "No se pudo actualizar la sala.";
        setError(mensaje);
        reportarErrorCliente(mensaje, "editar-sala");
        return;
      }
      setSuccess({ pdfUrl: res.pdfUrl ?? null });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Ocurrió un error inesperado actualizando la sala.";
      setError(mensaje);
      reportarErrorCliente(mensaje, "editar-sala", err instanceof Error ? err.stack : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-heading">
        <h1>Editar Sala / Shelter</h1>
        <p>
          N° {numeroGeneracion} — las fotos ya guardadas ({cantidadFotos}) no se tocan acá, solo los datos.
        </p>
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
        <div className="field" style={{ marginBottom: 0 }}>
          <label>
            Fecha <span className="req">*</span>
          </label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={submitting} style={{ maxWidth: 220 }} />
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {success && (
        <>
          <SuccessNote>
            Sala actualizada. {success.pdfUrl && <VerPdfLink obtenerUrl={() => obtenerUrlPdfSalaAction(salaId)} />}
          </SuccessNote>
          <div className="footer-nav">
            <span />
            <Link href="/salas/historial" className="btn btn-primary">
              Volver al historial
            </Link>
          </div>
        </>
      )}
      {!success && (
        <div className="footer-nav">
          <Link href="/salas/historial" className="btn btn-secondary">
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
