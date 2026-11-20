"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { corregirCoordenadasAction } from "@/app/(app)/ubicaciones/coordenadas-actions";
import { enlaceMapa, formatearCoordenada, parsearLatitud, parsearLongitud } from "@/lib/ubicaciones/coordenadas";

export interface FilaCoordenadas {
  id: string;
  label: string;
  lat: number | null;
  lng: number | null;
}

type Alcance = "este" | "sin_coordenadas" | "todos";

function Formulario({ fila, filas, onCerrar }: { fila: FilaCoordenadas; filas: FilaCoordenadas[]; onCerrar: () => void }) {
  const router = useRouter();
  const [lat, setLat] = useState(fila.lat !== null ? formatearCoordenada(fila.lat) : "");
  const [lng, setLng] = useState(fila.lng !== null ? formatearCoordenada(fila.lng) : "");
  const [alcance, setAlcance] = useState<Alcance>("este");
  const [busy, setBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latNum = parsearLatitud(lat);
  const lngNum = parsearLongitud(lng);
  const valido = latNum !== null && lngNum !== null;
  const otras = filas.filter((f) => f.id !== fila.id);
  const otrasSinCoordenadas = otras.filter((f) => f.lat === null).length;

  function idsAfectados(): string[] {
    if (alcance === "este") return [fila.id];
    if (alcance === "todos") return filas.map((f) => f.id);
    return [fila.id, ...otras.filter((f) => f.lat === null).map((f) => f.id)];
  }

  function usarMiUbicacion() {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError("Este dispositivo/navegador no soporta geolocalización.");
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(formatearCoordenada(pos.coords.latitude));
        setLng(formatearCoordenada(pos.coords.longitude));
        setGpsBusy(false);
      },
      (err) => {
        setError(err.code === 1 ? "Permiso de ubicación denegado — habilitalo en el navegador." : "No se pudo obtener tu ubicación.");
        setGpsBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function guardar(quitar: boolean) {
    setError(null);
    if (!quitar && !valido) {
      setError("Latitud (entre -90 y 90) y longitud (entre -180 y 180) tienen que ser números.");
      return;
    }
    setBusy(true);
    const res = await corregirCoordenadasAction({ ubicacionIds: idsAfectados(), lat: quitar ? null : latNum, lng: quitar ? null : lngNum });
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo guardar.");
      return;
    }
    onCerrar();
    router.refresh();
  }

  return (
    <div className="modal-overlay" onClick={() => !busy && onCerrar()}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="section-label" style={{ marginBottom: 4 }}>
          Coordenadas en el mapa
        </div>
        <p className="hint" style={{ margin: "0 0 12px" }}>
          {fila.label}
        </p>

        <div style={{ marginBottom: 10 }}>
          <button type="button" className="ai-btn" onClick={usarMiUbicacion} disabled={busy || gpsBusy}>
            <Icon name="map" size={13} /> {gpsBusy ? "Ubicando..." : "Usar mi ubicación"}
          </button>
        </div>
        <div className="grid2">
          <div className="field">
            <label>Latitud</label>
            <input type="text" inputMode="decimal" placeholder="Ej: -33.123456" value={lat} onChange={(e) => setLat(e.target.value)} disabled={busy} />
          </div>
          <div className="field">
            <label>Longitud</label>
            <input type="text" inputMode="decimal" placeholder="Ej: -68.456789" value={lng} onChange={(e) => setLng(e.target.value)} disabled={busy} />
          </div>
        </div>
        {valido && (
          <div className="hint" style={{ marginTop: -4, marginBottom: 8 }}>
            <a href={enlaceMapa(latNum, lngNum)} target="_blank" rel="noopener noreferrer">
              Ver este punto en el mapa
            </a>{" "}
            para comprobar que cae donde debe.
          </div>
        )}

        {otras.length > 0 && (
          <div className="field">
            <label>Aplicar a</label>
            <select value={alcance} onChange={(e) => setAlcance(e.target.value as Alcance)} disabled={busy}>
              <option value="este">Solo este lugar</option>
              <option value="sin_coordenadas">Este y los {otrasSinCoordenadas} del sitio que no tienen coordenadas</option>
              <option value="todos">Todos los lugares del sitio ({filas.length})</option>
            </select>
          </div>
        )}

        {error && <div className="error-text">{error}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => guardar(true)} disabled={busy || fila.lat === null}>
            Quitar coordenadas
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onCerrar} disabled={busy}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => guardar(false)} disabled={busy || !valido}>
              {busy ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Dónde está cada lugar del sitio en el mapa, y (Administrador/Supervisor)
 * cómo corregirlo. Cada sala/oficina/planta es su propia fila de ubicación con
 * sus propias coordenadas: la que no tiene no aparece en el mapa, y una
 * mal cargada aparece en otro punto.
 */
export function CoordenadasSitio({ filas, puedeEditar }: { filas: FilaCoordenadas[]; puedeEditar: boolean }) {
  const [editando, setEditando] = useState<FilaCoordenadas | null>(null);
  const sinCoordenadas = filas.filter((f) => f.lat === null).length;

  return (
    <div className="card">
      <div className="section-label">Ubicación en el mapa</div>
      {sinCoordenadas > 0 && (
        <p className="hint" style={{ margin: "4px 0 8px", color: "var(--warn)" }}>
          <Icon name="warning" size={12} /> {sinCoordenadas === filas.length ? "Ningún lugar de este sitio tiene coordenadas" : `${sinCoordenadas} de ${filas.length} lugares no tienen coordenadas`}, así que
          lo relevado ahí no aparece en el mapa.
        </p>
      )}
      <div className="detalle-table-wrap">
        <table className="detalle-table">
          <thead>
            <tr>
              <th>Lugar</th>
              <th>Latitud</th>
              <th>Longitud</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id}>
                <td>{f.label}</td>
                <td>{f.lat !== null ? formatearCoordenada(f.lat) : "—"}</td>
                <td>{f.lng !== null ? formatearCoordenada(f.lng) : "—"}</td>
                <td>
                  {f.lat !== null && f.lng !== null && (
                    <a className="icon-btn" href={enlaceMapa(f.lat, f.lng)} target="_blank" rel="noopener noreferrer" title="Ver en el mapa" aria-label="Ver en el mapa">
                      <Icon name="map" size={15} />
                    </a>
                  )}
                  {puedeEditar && (
                    <button type="button" className="icon-btn" title="Corregir coordenadas" aria-label="Corregir coordenadas" onClick={() => setEditando(f)}>
                      <Icon name="edit" size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editando && <Formulario fila={editando} filas={filas} onCerrar={() => setEditando(null)} />}
    </div>
  );
}
