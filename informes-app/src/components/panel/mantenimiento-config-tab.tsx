"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarIntervaloMantenimientoAction } from "@/app/(app)/configuracion/actions/mantenimiento-intervalos";
import { guardarSupuestosDotacionAction } from "@/app/(app)/configuracion/actions/mantenimiento-dotacion";
import {
  TIPO_EQUIPO_MANTENIMIENTO_OPCIONES,
  TIPO_EQUIPO_MANTENIMIENTO_LABEL,
  categoriasDeTipoEquipo,
} from "@/lib/mantenimiento/types";
import { Icon } from "@/components/icon";
import type { TipoEquipoBaja } from "@/lib/database.types";

export interface IntervaloConfigurado {
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

/**
 * Configuración del Plan de Mantenimiento — vivía en Configuración →
 * Catálogos, se movió acá (Panel → Mantenimientos → pestaña
 * "Configuración", admin-only) para no tener que salir de la pantalla
 * del plan para ajustarlo. Tabla editable en el lugar: una fila por
 * categoría de equipo, en vez de agregar/quitar de a una.
 */
export function MantenimientoConfigTab({
  intervalos,
  supuestosDotacion,
}: {
  intervalos: IntervaloConfigurado[];
  supuestosDotacion: SupuestosDotacion;
}) {
  const router = useRouter();
  const frecuenciaPorClave = new Map(intervalos.map((i) => [`${i.tipoEquipo}:${i.categoria}`, String(i.frecuenciaDias)]));
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(frecuenciaPorClave));
  const [busyClave, setBusyClave] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function guardarFila(tipoEquipo: TipoEquipoBaja, categoria: string) {
    const clave = `${tipoEquipo}:${categoria}`;
    setBusyClave(clave);
    setError(null);
    const res = await guardarIntervaloMantenimientoAction(tipoEquipo, categoria, valores[clave] ?? "");
    setBusyClave(null);
    if (!res.success) {
      setError(res.error || "No se pudo guardar.");
      return;
    }
    router.refresh();
  }

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
    router.refresh();
  }

  return (
    <div className="card">
      <div className="panel-card-title">
        <h2>Intervalos por categoría</h2>
      </div>
      <div className="hint" style={{ margin: "-4px 0 12px" }}>
        Cada cuántos días corresponde el mantenimiento de cada categoría de equipo — se usa para calcular vencido/próximo en todo el
        Plan. Dejá el campo vacío y guardá para quitar la categoría del plan (deja de avisar).
      </div>
      {error && (
        <div className="error-text" style={{ marginBottom: 10 }}>
          {error}
        </div>
      )}
      {TIPO_EQUIPO_MANTENIMIENTO_OPCIONES.map((tipoEquipo) => (
        <div key={tipoEquipo} style={{ marginBottom: 18 }}>
          <div className="section-label" style={{ fontSize: 12, marginBottom: 6 }}>
            {TIPO_EQUIPO_MANTENIMIENTO_LABEL[tipoEquipo]}
          </div>
          <div className="detalle-table-wrap">
            <table className="detalle-table">
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th style={{ width: 160 }}>Frecuencia (días)</th>
                  <th style={{ width: 90 }} />
                </tr>
              </thead>
              <tbody>
                {categoriasDeTipoEquipo(tipoEquipo).map((opcion) => {
                  const clave = `${tipoEquipo}:${opcion.value}`;
                  return (
                    <tr key={clave}>
                      <td>{opcion.label}</td>
                      <td>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Sin configurar"
                          value={valores[clave] ?? ""}
                          onChange={(e) => setValores((prev) => ({ ...prev, [clave]: e.target.value }))}
                          disabled={busyClave === clave}
                          style={{ width: 120 }}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => guardarFila(tipoEquipo, opcion.value)}
                          disabled={busyClave === clave}
                        >
                          {busyClave === clave ? "..." : "Guardar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="section-label" style={{ marginTop: 10 }}>
        Supuestos para estimar dotación necesaria
      </div>
      <div className="hint" style={{ margin: "0 0 10px" }}>
        Se usan en la pestaña &ldquo;Dotación&rdquo; para estimar cuántos técnicos hacen falta para cumplir el plan — ajustalos a la realidad real de
        la cuadrilla (nunca los inventa la IA).
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
