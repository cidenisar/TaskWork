"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { labelUbicacion, type Ubicacion } from "./types";

export interface GpsCapturado {
  lat: number;
  lng: number;
  accuracy: number | null;
}

type ResolverGpsResponse =
  | { tipo: "match"; ubicacionId: string; provincia: string; label: string; distanciaM: number }
  | { tipo: "geocoded"; provincia: string; localidad: string | null }
  | { tipo: "sin_datos" };

/**
 * Selector de Ubicación (Provincia → Localidad → Sitio → Planta → Oficina)
 * reutilizado por Tableros y Racks — reemplaza el campo de texto libre
 * "sitio" que tenía cada módulo por separado. El botón "Usar mi ubicación"
 * toma el GPS del dispositivo y:
 *  - si cae cerca de una Ubicación que algún otro técnico ya confirmó antes
 *    (tiene lat/lng guardado), la selecciona directo — así la app "aprende"
 *    sitio por sitio con el uso real;
 *  - si no, geocodea con Nominatim para acotar Provincia/Localidad y entra
 *    directo al modo "crear ubicación nueva" con esos campos precargados,
 *    quedando solo elegir/escribir el Sitio.
 * El técnico puede ignorar el GPS y elegir todo a mano igual. País y Región
 * nunca se tipean: Región se deriva de la Provincia.
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
  onGpsCapturado,
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
  onGpsCapturado: (gps: GpsCapturado | null) => void;
  disabled?: boolean;
}) {
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsAviso, setGpsAviso] = useState<string | null>(null);

  const ubicacionesDeLaProvincia = useMemo(
    () => ubicaciones.filter((u) => u.provincia === provinciaFiltro),
    [ubicaciones, provinciaFiltro],
  );

  async function usarMiUbicacion() {
    setGpsError(null);
    setGpsAviso(null);
    if (!("geolocation" in navigator)) {
      setGpsError("Este dispositivo/navegador no soporta geolocalización.");
      return;
    }
    setGpsBusy(true);

    let posicion: GeolocationPosition;
    try {
      posicion = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 }),
      );
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? (err as GeolocationPositionError).code : null;
      if (code === 1) setGpsError("Permiso de ubicación denegado — habilitalo en el navegador para usar esta función.");
      else if (code === 3) setGpsError("Se agotó el tiempo esperando el GPS — probá de nuevo.");
      else setGpsError("No se pudo obtener tu ubicación.");
      setGpsBusy(false);
      return;
    }

    const lat = posicion.coords.latitude;
    const lng = posicion.coords.longitude;
    const accuracy = Number.isFinite(posicion.coords.accuracy) ? posicion.coords.accuracy : null;
    onGpsCapturado({ lat, lng, accuracy });
    const precisionAviso = accuracy && accuracy > 100 ? ` (precisión del GPS baja: ±${Math.round(accuracy)}m, confirmá bien)` : "";

    try {
      const res = await fetch("/api/ubicaciones/resolver-gps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng }),
      });
      const data: ResolverGpsResponse = await res.json();
      if (data.tipo === "match") {
        onProvinciaFiltroChange(data.provincia);
        onUbicacionIdChange(data.ubicacionId);
        setGpsAviso(`📍 Detectamos "${data.label}" a ${data.distanciaM}m${precisionAviso}.`);
      } else if (data.tipo === "geocoded") {
        onProvinciaFiltroChange(data.provincia);
        onUbicacionIdChange("__new");
        onLocalidadNuevaChange(data.localidad ?? "");
        setGpsAviso(
          `📍 Ubicación detectada: ${data.provincia}${data.localidad ? ` · ${data.localidad}` : ""}${precisionAviso} — elegí el ` +
            "sitio de la lista o creá uno nuevo.",
        );
      } else {
        setGpsAviso(`📍 No se pudo determinar la zona automáticamente${precisionAviso} — elegí la provincia a mano.`);
      }
    } catch {
      setGpsAviso("📍 Se guardó tu posición GPS, pero no se pudo determinar la zona automáticamente — elegí la provincia a mano.");
    } finally {
      setGpsBusy(false);
    }
  }

  return (
    <>
      <div className="field">
        <button type="button" className="ai-btn" onClick={() => void usarMiUbicacion()} disabled={disabled || gpsBusy}>
          <Icon name="map" size={13} /> {gpsBusy ? "Ubicando..." : "Usar mi ubicación"}
        </button>
        {gpsAviso && <div className="hint" style={{ marginTop: 6 }}>{gpsAviso}</div>}
        {gpsError && (
          <div className="hint" style={{ marginTop: 6, color: "var(--warn)" }}>
            {gpsError}
          </div>
        )}
      </div>
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
