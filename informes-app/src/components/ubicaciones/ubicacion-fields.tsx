"use client";

import { useMemo } from "react";
import { labelUbicacion, type Ubicacion } from "./types";

/**
 * Selector de Ubicación (Provincia → Localidad → Sitio → Planta → Oficina)
 * reutilizado por Tableros y Racks — reemplaza el campo de texto libre
 * "sitio" que tenía cada módulo por separado. Elegís primero la Provincia
 * para acotar el catálogo (puede tener miles de sitios entre todas las
 * provincias) y de ahí elegís una Ubicación existente o creás una nueva.
 * Región, País y las coordenadas GPS NO se piden acá: se completan solos
 * (Región se deriva de la Provincia, el resto llega con la captura de GPS
 * de una próxima mejora) — el técnico nunca los tipea a mano.
 */
export function UbicacionFields({
  ubicaciones,
  provincias,
  provinciaFiltro,
  onProvinciaFiltroChange,
  ubicacionId,
  onUbicacionIdChange,
  localidadNueva,
  onLocalidadNuevaChange,
  sitioNueva,
  onSitioNuevaChange,
  plantaNueva,
  onPlantaNuevaChange,
  oficinaNueva,
  onOficinaNuevaChange,
  disabled,
}: {
  ubicaciones: Ubicacion[];
  provincias: string[];
  provinciaFiltro: string;
  onProvinciaFiltroChange: (provincia: string) => void;
  ubicacionId: string; // "" | "__new" | id
  onUbicacionIdChange: (id: string) => void;
  localidadNueva: string;
  onLocalidadNuevaChange: (v: string) => void;
  sitioNueva: string;
  onSitioNuevaChange: (v: string) => void;
  plantaNueva: string;
  onPlantaNuevaChange: (v: string) => void;
  oficinaNueva: string;
  onOficinaNuevaChange: (v: string) => void;
  disabled?: boolean;
}) {
  const ubicacionesDeLaProvincia = useMemo(
    () => ubicaciones.filter((u) => u.provincia === provinciaFiltro),
    [ubicaciones, provinciaFiltro],
  );

  return (
    <>
      <div className="field">
        <label>
          Provincia <span className="req">*</span>
        </label>
        <select
          value={provinciaFiltro}
          onChange={(e) => {
            onProvinciaFiltroChange(e.target.value);
            onUbicacionIdChange("");
          }}
          disabled={disabled}
        >
          <option value="">Seleccionar provincia...</option>
          {provincias.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      {provinciaFiltro && (
        <div className="field">
          <label>
            Ubicación (sitio/sala) <span className="req">*</span>
          </label>
          <select value={ubicacionId} onChange={(e) => onUbicacionIdChange(e.target.value)} disabled={disabled}>
            <option value="">Seleccionar ubicación...</option>
            {ubicacionesDeLaProvincia.map((u) => (
              <option key={u.id} value={u.id}>
                {labelUbicacion(u)}
              </option>
            ))}
            <option value="__new">+ Crear ubicación nueva...</option>
          </select>
        </div>
      )}
      {ubicacionId === "__new" && (
        <div className="grid2">
          <div className="field">
            <label>
              Localidad <span className="opt">(opcional)</span>
            </label>
            <input
              type="text"
              placeholder="Ej: Luján de Cuyo"
              value={localidadNueva}
              onChange={(e) => onLocalidadNuevaChange(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label>
              Sitio <span className="req">*</span>
            </label>
            <input
              type="text"
              placeholder="Ej: Refinería Luján de Cuyo"
              value={sitioNueva}
              onChange={(e) => onSitioNuevaChange(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label>
              Planta <span className="opt">(opcional)</span>
            </label>
            <input
              type="text"
              placeholder="Ej: Sala de Radio Luján 1"
              value={plantaNueva}
              onChange={(e) => onPlantaNuevaChange(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label>
              Oficina <span className="opt">(opcional)</span>
            </label>
            <input
              type="text"
              placeholder="Ej: Oficina 2"
              value={oficinaNueva}
              onChange={(e) => onOficinaNuevaChange(e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </>
  );
}
