"use client";

import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import type { Ubicacion } from "./types";

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
 * Selector de Ubicación (Provincia → Sitio → Planta/Oficina) reutilizado por
 * Tableros, Racks, Informe Técnico, Rendición de Gastos y Equipos —
 * reemplaza el campo de texto libre "sitio" que tenía cada módulo por
 * separado. El botón "Usar mi ubicación" toma el GPS del dispositivo y:
 *  - si cae cerca de una Ubicación que algún otro técnico ya confirmó antes
 *    (tiene lat/lng guardado), la selecciona directo — así la app "aprende"
 *    sitio por sitio con el uso real;
 *  - si no, geocodea con Nominatim para acotar Provincia/Localidad y entra
 *    directo al modo "crear sitio nuevo" con esos campos precargados,
 *    quedando solo elegir/escribir el Sitio.
 * El técnico puede ignorar el GPS y elegir todo a mano igual. País y Región
 * nunca se tipean: Región se deriva de la Provincia.
 *
 * El paso Sitio → Planta/Oficina existe porque un solo sitio grande (ej. una
 * refinería) puede tener decenas de plantas en el catálogo — listarlas todas
 * juntas en un desplegable plano (como era antes) es imposible de recorrer
 * en el celular. Primero se elige el Sitio (lista corta), y solo si ESE
 * sitio tiene más de una Planta/Oficina cargada aparece un segundo
 * desplegable ya acotado a ese sitio; si tiene una sola, se elige sola.
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
  requerido = true,
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
  /** false para módulos donde la ubicación es opcional (Informe Técnico, Rendición de Gastos) — no muestra los asteriscos de obligatorio. */
  requerido?: boolean;
}) {
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsAviso, setGpsAviso] = useState<string | null>(null);
  // "" = sin elegir, "__new" = crear sitio nuevo, o el nombre del sitio elegido.
  // Se inicializa en base al ubicacionId que venga de afuera (ej. un informe
  // viejo que ya tenía una Ubicación elegida al entrar a editarlo) — a partir
  // de ahí, cada lugar que cambia ubicacionId adentro de este componente
  // actualiza sitioFiltro a mano, en vez de usar un efecto para sincronizarlo.
  const [sitioFiltro, setSitioFiltro] = useState<string>(() => {
    if (ubicacionId === "__new") return "__new";
    if (!ubicacionId) return "";
    return ubicaciones.find((u) => u.id === ubicacionId)?.sitio ?? "";
  });

  const ubicacionesDeLaProvincia = useMemo(
    () => ubicaciones.filter((u) => u.provincia === provinciaFiltro),
    [ubicaciones, provinciaFiltro],
  );

  const sitiosDeLaProvincia = useMemo(() => {
    const vistos = new Set<string>();
    const lista: string[] = [];
    for (const u of ubicacionesDeLaProvincia) {
      if (!vistos.has(u.sitio)) {
        vistos.add(u.sitio);
        lista.push(u.sitio);
      }
    }
    return lista.sort((a, b) => a.localeCompare(b));
  }, [ubicacionesDeLaProvincia]);

  const filasDelSitio = useMemo(
    () => (sitioFiltro && sitioFiltro !== "__new" ? ubicacionesDeLaProvincia.filter((u) => u.sitio === sitioFiltro) : []),
    [ubicacionesDeLaProvincia, sitioFiltro],
  );

  function elegirSitio(s: string) {
    setSitioFiltro(s);
    if (s === "__new") {
      onUbicacionIdChange("__new");
      return;
    }
    const filas = ubicacionesDeLaProvincia.filter((u) => u.sitio === s);
    onUbicacionIdChange(filas.length === 1 ? filas[0].id : "");
  }

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
        const fila = ubicaciones.find((u) => u.id === data.ubicacionId);
        if (fila) setSitioFiltro(fila.sitio);
        setGpsAviso(`📍 Detectamos "${data.label}" a ${data.distanciaM}m${precisionAviso}.`);
      } else if (data.tipo === "geocoded") {
        onProvinciaFiltroChange(data.provincia);
        setSitioFiltro("__new");
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
          Provincia {requerido ? <span className="req">*</span> : <span className="opt">(opcional)</span>}
        </label>
        <select
          value={provinciaFiltro}
          onChange={(e) => {
            onProvinciaFiltroChange(e.target.value);
            setSitioFiltro("");
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
            Sitio {requerido ? <span className="req">*</span> : <span className="opt">(opcional)</span>}
          </label>
          <select value={sitioFiltro} onChange={(e) => elegirSitio(e.target.value)} disabled={disabled}>
            <option value="">Seleccionar sitio...</option>
            {sitiosDeLaProvincia.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value="__new">+ Crear sitio nuevo...</option>
          </select>
        </div>
      )}
      {sitioFiltro && sitioFiltro !== "__new" && filasDelSitio.length > 1 && (
        <div className="field">
          <label>
            Planta / Oficina {requerido ? <span className="req">*</span> : <span className="opt">(opcional)</span>}
          </label>
          <select value={ubicacionId} onChange={(e) => onUbicacionIdChange(e.target.value)} disabled={disabled}>
            <option value="">Seleccionar...</option>
            {filasDelSitio.map((u) => (
              <option key={u.id} value={u.id}>
                {[u.oficina, u.planta].filter(Boolean).join(" · ") || "(sin planta/oficina especificada)"}
              </option>
            ))}
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
