"use client";

import { labelUbicacion, type Ubicacion } from "./types";

/**
 * Selector de Ubicación (Provincia → Sector/Oficina → Sala) reutilizado por
 * Tableros y Racks — reemplaza el campo de texto libre "sitio" que tenía
 * cada módulo por separado, que se fragmentaba (mismo lugar físico cargado
 * con variantes de texto distintas) y no dejaba agrupar/contar entre
 * módulos. Elegí una Ubicación existente o creá una nueva (alta al vuelo,
 * mismo criterio que el resto de los catálogos de la app).
 */
export function UbicacionFields({
  ubicaciones,
  provincias,
  ubicacionId,
  onUbicacionIdChange,
  provinciaNueva,
  onProvinciaNuevaChange,
  sectorOficinaNueva,
  onSectorOficinaNuevaChange,
  salaNueva,
  onSalaNuevaChange,
  disabled,
}: {
  ubicaciones: Ubicacion[];
  provincias: string[];
  ubicacionId: string; // "" | "__new" | id
  onUbicacionIdChange: (id: string) => void;
  provinciaNueva: string;
  onProvinciaNuevaChange: (v: string) => void;
  sectorOficinaNueva: string;
  onSectorOficinaNuevaChange: (v: string) => void;
  salaNueva: string;
  onSalaNuevaChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <div className="field">
        <label>
          Ubicación (sitio/sala) <span className="req">*</span>
        </label>
        <select value={ubicacionId} onChange={(e) => onUbicacionIdChange(e.target.value)} disabled={disabled}>
          <option value="">Seleccionar ubicación...</option>
          {ubicaciones.map((u) => (
            <option key={u.id} value={u.id}>
              {labelUbicacion(u)}
            </option>
          ))}
          <option value="__new">+ Crear ubicación nueva...</option>
        </select>
      </div>
      {ubicacionId === "__new" && (
        <div className="grid2">
          <div className="field">
            <label>
              Provincia <span className="req">*</span>
            </label>
            <select value={provinciaNueva} onChange={(e) => onProvinciaNuevaChange(e.target.value)} disabled={disabled}>
              <option value="">Seleccionar provincia...</option>
              {provincias.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>
              Sector/Oficina <span className="opt">(opcional)</span>
            </label>
            <input
              type="text"
              placeholder="Ej: Sector Norte"
              value={sectorOficinaNueva}
              onChange={(e) => onSectorOficinaNuevaChange(e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>
              Sala <span className="req">*</span>
            </label>
            <input
              type="text"
              placeholder="Ej: Luján 1"
              value={salaNueva}
              onChange={(e) => onSalaNuevaChange(e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </>
  );
}
