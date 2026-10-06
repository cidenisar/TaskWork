"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { addIntervaloMantenimientoAction, removeIntervaloMantenimientoAction } from "@/app/(app)/configuracion/actions/mantenimiento-intervalos";
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

export function MantenimientoIntervalosTab({
  intervalos,
  setIntervalos,
}: {
  intervalos: IntervaloItem[];
  setIntervalos: Dispatch<SetStateAction<IntervaloItem[]>>;
}) {
  const [tipoEquipo, setTipoEquipo] = useState<TipoEquipoBaja>("rack_equipamiento");
  const [categoria, setCategoria] = useState("");
  const [frecuencia, setFrecuencia] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    </div>
  );
}
