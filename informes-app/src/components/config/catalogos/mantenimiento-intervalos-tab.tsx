"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { addIntervaloMantenimientoAction, removeIntervaloMantenimientoAction } from "@/app/(app)/configuracion/actions/mantenimiento-intervalos";
import { guardarSupuestosDotacionAction } from "@/app/(app)/configuracion/actions/mantenimiento-dotacion";
import {
  TIPO_EQUIPO_MANTENIMIENTO_OPCIONES,
  TIPO_EQUIPO_MANTENIMIENTO_LABEL,
  categoriasDeTipoEquipo,
  labelCategoriaMantenimiento,
} from "@/lib/mantenimiento/types";
import { Icon } from "@/components/icon";
import type { TipoEquipoBaja } from "@/lib/database.types";

export interface IntervaloItem {
  id: string;
  tipoEquipo: TipoEquipoBaja;
  categoria: string;
  frecuenciaDias: number;
}

export interface SupuestosDotacion {
  horasPorDia: number;
  diasHabilesAnio: number;
  horasPorVisita: number;
  velocidadKmh: number;
}

export function MantenimientoIntervalosTab({
  intervalos,
  setIntervalos,
  supuestosDotacion,
}: {
  intervalos: IntervaloItem[];
  setIntervalos: Dispatch<SetStateAction<IntervaloItem[]>>;
  supuestosDotacion: SupuestosDotacion;
}) {
  const [tipoEquipo, setTipoEquipo] = useState<TipoEquipoBaja>("rack_equipamiento");
  const [categoria, setCategoria] = useState("");
  const [frecuencia, setFrecuencia] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [horasPorDia, setHorasPorDia] = useState(String(supuestosDotacion.horasPorDia));
  const [diasHabilesAnio, setDiasHabilesAnio] = useState(String(supuestosDotacion.diasHabilesAnio));
  const [horasPorVisita, setHorasPorVisita] = useState(String(supuestosDotacion.horasPorVisita));
  const [velocidadKmh, setVelocidadKmh] = useState(String(supuestosDotacion.velocidadKmh));
  const [dotacionBusy, setDotacionBusy] = useState(false);
  const [dotacionError, setDotacionError] = useState<string | null>(null);
  const [dotacionOk, setDotacionOk] = useState(false);

  async function guardarDotacion() {
    setDotacionBusy(true);
    setDotacionError(null);
    setDotacionOk(false);
    const res = await guardarSupuestosDotacionAction({ horasPorDia, diasHabilesAnio, horasPorVisita, velocidadKmh });
    setDotacionBusy(false);
    if (!res.success) {
      setDotacionError(res.error || "No se pudo guardar.");
      return;
    }
    setDotacionOk(true);
  }

  const opcionesCategoria = categoriasDeTipoEquipo(tipoEquipo);

  function onTipoEquipoChange(v: TipoEquipoBaja) {
    setTipoEquipo(v);
    setCategoria("");
  }

  async function add() {
    if (!categoria || !frecuencia) return;
    setBusy(true);
    setError(null);
    const res = await addIntervaloMantenimientoAction(tipoEquipo, categoria, frecuencia);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "No se pudo agregar el intervalo.");
      return;
    }
    setIntervalos((prev) => [...prev, { id: crypto.randomUUID(), tipoEquipo, categoria, frecuenciaDias: Math.round(Number(frecuencia)) }]);
    setCategoria("");
    setFrecuencia("");
  }

  async function remove(item: IntervaloItem) {
    setBusy(true);
    const res = await removeIntervaloMantenimientoAction(item.id);
    setBusy(false);
    if (res.success) setIntervalos((prev) => prev.filter((i) => i.id !== item.id));
  }

  return (
    <div>
      <div className="hint" style={{ margin: "0 0 10px" }}>
        Definí cada cuántos días corresponde el mantenimiento de cada categoría de equipo — se usa en el Panel para avisar cuándo toca el
        próximo. No se mide solo: hace falta que alguien registre cada mantenimiento realizado (desde la ficha de Sitio) para que la
        cuenta ande.
      </div>
      <div className="tech-form-grid">
        <select value={tipoEquipo} onChange={(e) => onTipoEquipoChange(e.target.value as TipoEquipoBaja)} disabled={busy}>
          {TIPO_EQUIPO_MANTENIMIENTO_OPCIONES.map((t) => (
            <option key={t} value={t}>
              {TIPO_EQUIPO_MANTENIMIENTO_LABEL[t]}
            </option>
          ))}
        </select>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={busy}>
          <option value="">Elegí categoría...</option>
          {opcionesCategoria.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ maxWidth: 200 }}>
        <label style={{ fontSize: 12 }}>Frecuencia (días)</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="Ej: 180"
          value={frecuencia}
          onChange={(e) => setFrecuencia(e.target.value)}
          disabled={busy}
        />
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={add} disabled={busy || !categoria || !frecuencia}>
        + Agregar intervalo
      </button>
      {error && (
        <div className="error-text" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}

      <div className="item-list" style={{ marginTop: 14 }}>
        {intervalos.length === 0 ? (
          <div className="empty-note">Todavía no configuraste ningún intervalo.</div>
        ) : (
          intervalos.map((item) => (
            <div className="list-item" key={item.id}>
              <div className="info">
                <div className="avatar">
                  <Icon name="wrench" size={16} />
                </div>
                <div>
                  <div className="item-name">{labelCategoriaMantenimiento(item.tipoEquipo, item.categoria)}</div>
                  <div className="item-sub">
                    {TIPO_EQUIPO_MANTENIMIENTO_LABEL[item.tipoEquipo]} · cada {item.frecuenciaDias} días
                  </div>
                </div>
              </div>
              <button type="button" className="remove-btn" onClick={() => remove(item)} disabled={busy}>
                <Icon name="x" size={12} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="section-label" style={{ marginTop: 20 }}>
        Supuestos para estimar dotación necesaria
      </div>
      <div className="hint" style={{ margin: "0 0 10px" }}>
        Se usan en Panel → Mantenimientos → &ldquo;Dotación&rdquo; para estimar cuántos técnicos hacen falta para cumplir el plan — ajustalos a la
        realidad real de la cuadrilla (nunca los inventa la IA).
      </div>
      <div className="tech-form-grid">
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>Horas de trabajo por día</label>
          <input type="text" inputMode="decimal" value={horasPorDia} onChange={(e) => setHorasPorDia(e.target.value)} disabled={dotacionBusy} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>Días hábiles por año</label>
          <input
            type="text"
            inputMode="numeric"
            value={diasHabilesAnio}
            onChange={(e) => setDiasHabilesAnio(e.target.value)}
            disabled={dotacionBusy}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>Horas de trabajo por visita</label>
          <input
            type="text"
            inputMode="decimal"
            value={horasPorVisita}
            onChange={(e) => setHorasPorVisita(e.target.value)}
            disabled={dotacionBusy}
          />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label style={{ fontSize: 12 }}>Velocidad de viaje promedio (km/h)</label>
          <input type="text" inputMode="decimal" value={velocidadKmh} onChange={(e) => setVelocidadKmh(e.target.value)} disabled={dotacionBusy} />
        </div>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={guardarDotacion} disabled={dotacionBusy} style={{ marginTop: 10 }}>
        {dotacionBusy ? "Guardando..." : "Guardar supuestos"}
      </button>
      {dotacionOk && !dotacionError && (
        <div className="hint" style={{ color: "var(--ok)", marginTop: 6 }}>
          <Icon name="check" size={12} /> Guardado.
        </div>
      )}
      {dotacionError && (
        <div className="error-text" style={{ marginTop: 8 }}>
          {dotacionError}
        </div>
      )}
    </div>
  );
}
