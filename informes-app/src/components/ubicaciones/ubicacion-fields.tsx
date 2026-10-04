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

const SIN_VALOR = ""; // agrupa filas sin planta/oficina cargada (null) bajo una sola clave

/**
 * Selector de Ubicación (Provincia → Sitio → Planta → Oficina) reutilizado
 * por Tableros, Racks, Informe Técnico, Rendición de Gastos y Equipos —
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
 * Cada nivel de la jerarquía (Sitio → Planta → Oficina) es su PROPIO paso,
 * con su propio "+ Crear nuevo..." — un sitio grande (ej. una refinería)
 * tiene varias Plantas (Comunicaciones, Puesto 1, Puesto 2...), y algunas de
 * esas Plantas a su vez se dividen en Oficinas (Radio Luján 1, Sala de
 * baterías...), pero la mayoría no — ahí el flujo termina en Planta sin
 * pedir Oficina. Listar todo junto en un solo desplegable (como era antes)
 * es imposible de recorrer en el celular para un sitio con decenas de
 * plantas, así que cada paso solo muestra las opciones del nivel anterior.
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

  // "" = sin elegir, "__new" = crear nuevo en ese nivel, o el valor elegido.
  // Se inicializan en base al ubicacionId que venga de afuera (ej. un
  // informe viejo que ya tenía una Ubicación elegida al entrar a editarlo) —
  // a partir de ahí, cada lugar que cambia ubicacionId adentro de este
  // componente actualiza estos 3 a mano, en vez de usar un efecto.
  const estadoInicial = (campo: "sitio" | "planta" | "oficina") => {
    if (ubicacionId === "__new") return campo === "sitio" ? "__new" : "";
    if (!ubicacionId) return "";
    const fila = ubicaciones.find((u) => u.id === ubicacionId);
    if (!fila) return "";
    if (campo === "sitio") return fila.sitio;
    if (campo === "planta") return fila.planta ?? SIN_VALOR;
    return fila.oficina ?? SIN_VALOR;
  };
  const [sitioEl, setSitioEl] = useState<string>(() => estadoInicial("sitio"));
  const [plantaEl, setPlantaEl] = useState<string>(() => estadoInicial("planta"));
  const [oficinaEl, setOficinaEl] = useState<string>(() => estadoInicial("oficina"));

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
    () => (sitioEl && sitioEl !== "__new" ? ubicacionesDeLaProvincia.filter((u) => u.sitio === sitioEl) : []),
    [ubicacionesDeLaProvincia, sitioEl],
  );

  const plantasDelSitio = useMemo(() => {
    const vistas = new Set<string>();
    const lista: string[] = [];
    for (const u of filasDelSitio) {
      const p = u.planta ?? SIN_VALOR;
      if (!vistas.has(p)) {
        vistas.add(p);
        lista.push(p);
      }
    }
    return lista.sort((a, b) => a.localeCompare(b));
  }, [filasDelSitio]);

  const filasDeLaPlanta = useMemo(
    () => (plantaEl && plantaEl !== "__new" ? filasDelSitio.filter((u) => (u.planta ?? SIN_VALOR) === plantaEl) : []),
    [filasDelSitio, plantaEl],
  );

  const oficinasDeLaPlanta = useMemo(() => {
    const vistas = new Set<string>();
    const lista: string[] = [];
    for (const u of filasDeLaPlanta) {
      const o = u.oficina ?? SIN_VALOR;
      if (!vistas.has(o)) {
        vistas.add(o);
        lista.push(o);
      }
    }
    return lista.sort((a, b) => a.localeCompare(b));
  }, [filasDeLaPlanta]);

  /** Precarga sitioNueva/localidadNueva (y plantaNueva si corresponde) desde una fila existente, para crear un nivel nuevo sin reescribir lo que ya se eligió. */
  function precargarDesde(fila: Ubicacion | undefined, incluirPlanta: boolean) {
    if (!fila) return;
    onSitioNuevaChange(fila.sitio);
    onLocalidadNuevaChange(fila.localidad ?? "");
    if (incluirPlanta) onPlantaNuevaChange(fila.planta ?? "");
  }

  function elegirSitio(s: string) {
    setSitioEl(s);
    setPlantaEl("");
    setOficinaEl("");
    if (s === "__new") {
      onUbicacionIdChange("__new");
      onSitioNuevaChange("");
      onLocalidadNuevaChange("");
      onPlantaNuevaChange("");
      onOficinaNuevaChange("");
      return;
    }
    const filas = ubicacionesDeLaProvincia.filter((u) => u.sitio === s);
    const plantas = [...new Set(filas.map((u) => u.planta ?? SIN_VALOR))];
    if (plantas.length === 1) {
      elegirPlantaInterno(plantas[0], filas);
    } else {
      onUbicacionIdChange("");
    }
  }

  function elegirPlanta(p: string) {
    elegirPlantaInterno(p, filasDelSitio);
  }

  function elegirPlantaInterno(p: string, filasSitio: Ubicacion[]) {
    setPlantaEl(p);
    setOficinaEl("");
    if (p === "__new") {
      onUbicacionIdChange("__new");
      precargarDesde(filasSitio[0], false);
      onPlantaNuevaChange("");
      onOficinaNuevaChange("");
      return;
    }
    const filas = filasSitio.filter((u) => (u.planta ?? SIN_VALOR) === p);
    const oficinas = [...new Set(filas.map((u) => u.oficina ?? SIN_VALOR))];
    if (oficinas.length === 1) {
      onUbicacionIdChange(filas[0].id);
    } else {
      onUbicacionIdChange("");
    }
  }

  function elegirOficina(o: string) {
    setOficinaEl(o);
    if (o === "__new") {
      onUbicacionIdChange("__new");
      precargarDesde(filasDeLaPlanta[0], true);
      onOficinaNuevaChange("");
      return;
    }
    const fila = filasDeLaPlanta.find((u) => (u.oficina ?? SIN_VALOR) === o);
    onUbicacionIdChange(fila ? fila.id : "");
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
        if (fila) {
          setSitioEl(fila.sitio);
          setPlantaEl(fila.planta ?? SIN_VALOR);
          setOficinaEl(fila.oficina ?? SIN_VALOR);
        }
        setGpsAviso(`📍 Detectamos "${data.label}" a ${data.distanciaM}m${precisionAviso}.`);
      } else if (data.tipo === "geocoded") {
        onProvinciaFiltroChange(data.provincia);
        setSitioEl("__new");
        setPlantaEl("");
        setOficinaEl("");
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
            setSitioEl("");
            setPlantaEl("");
            setOficinaEl("");
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
          <select value={sitioEl} onChange={(e) => elegirSitio(e.target.value)} disabled={disabled}>
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
      {sitioEl && sitioEl !== "__new" && plantasDelSitio.length > 1 && (
        <div className="field">
          <label>Planta</label>
          <select value={plantaEl} onChange={(e) => elegirPlanta(e.target.value)} disabled={disabled}>
            <option value="">Seleccionar planta...</option>
            {plantasDelSitio.map((p) => (
              <option key={p || "__sin"} value={p}>
                {p || "(sin planta especificada)"}
              </option>
            ))}
            <option value="__new">+ Crear planta nueva...</option>
          </select>
        </div>
      )}
      {plantaEl === "__new" && (
        <div className="grid2">
          <div className="field">
            <div className="hint" style={{ margin: 0 }}>
              Sitio: {sitioNueva}
            </div>
          </div>
          <div className="field">
            <label>
              Planta <span className="req">*</span>
            </label>
            <input
              type="text"
              placeholder="Ej: Edificio Comunicaciones"
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
              placeholder="Ej: Sala de Radio"
              value={oficinaNueva}
              onChange={(e) => onOficinaNuevaChange(e.target.value)}
              disabled={disabled}
            />
          </div>
        </div>
      )}
      {plantaEl && plantaEl !== "__new" && oficinasDeLaPlanta.length > 1 && (
        <div className="field">
          <label>Oficina</label>
          <select value={oficinaEl} onChange={(e) => elegirOficina(e.target.value)} disabled={disabled}>
            <option value="">Seleccionar oficina...</option>
            {oficinasDeLaPlanta.map((o) => (
              <option key={o || "__sin"} value={o}>
                {o || "(sin oficina especificada)"}
              </option>
            ))}
            <option value="__new">+ Crear oficina nueva...</option>
          </select>
        </div>
      )}
      {oficinaEl === "__new" && (
        <div className="field">
          <div className="hint" style={{ margin: "0 0 6px" }}>
            Sitio: {sitioNueva} · Planta: {plantaNueva}
          </div>
          <label>
            Oficina <span className="req">*</span>
          </label>
          <input
            type="text"
            placeholder="Ej: Radio Luján 1"
            value={oficinaNueva}
            onChange={(e) => onOficinaNuevaChange(e.target.value)}
            disabled={disabled}
          />
        </div>
      )}
      {sitioEl === "__new" && (
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
