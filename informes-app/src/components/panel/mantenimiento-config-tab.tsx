"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarIntervaloMantenimientoAction } from "@/app/(app)/configuracion/actions/mantenimiento-intervalos";
import { guardarSupuestosDotacionAction } from "@/app/(app)/configuracion/actions/mantenimiento-dotacion";
import { agregarChecklistItemAction, quitarChecklistItemAction } from "@/app/(app)/configuracion/actions/mantenimiento-checklist";
import { generarProgramacionAutomaticaAction } from "@/app/(app)/configuracion/actions/mantenimiento-programacion";
import {
  TIPO_EQUIPO_MANTENIMIENTO_OPCIONES,
  TIPO_EQUIPO_MANTENIMIENTO_LABEL,
  categoriasDeTipoEquipo,
} from "@/lib/mantenimiento/types";
import { Icon } from "@/components/icon";
import type { TipoEquipoBaja } from "@/lib/database.types";

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

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

export interface ChecklistItemCatalogo {
  id: string;
  tipoEquipo: TipoEquipoBaja;
  categoria: string;
  texto: string;
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
  checklistItems,
}: {
  intervalos: IntervaloConfigurado[];
  supuestosDotacion: SupuestosDotacion;
  checklistItems: ChecklistItemCatalogo[];
}) {
  const router = useRouter();

  const [generando, setGenerando] = useState(false);
  const [generarError, setGenerarError] = useState<string | null>(null);
  const [generarResultado, setGenerarResultado] = useState<{
    sitiosProgramados: number;
    equiposProgramados: number;
    primeraFecha: string | null;
    ultimaFecha: string | null;
  } | null>(null);

  async function generarProgramacion() {
    setGenerando(true);
    setGenerarError(null);
    setGenerarResultado(null);
    const res = await generarProgramacionAutomaticaAction();
    setGenerando(false);
    if (!res.success || !res.resultado) {
      setGenerarError(res.error || "No se pudo generar la programación.");
      return;
    }
    setGenerarResultado(res.resultado);
    router.refresh();
  }

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

  const [tipoEquipoChecklist, setTipoEquipoChecklist] = useState<TipoEquipoBaja>("rack_equipamiento");
  const [categoriaChecklist, setCategoriaChecklist] = useState("");
  const [nuevoItemTexto, setNuevoItemTexto] = useState("");
  const [checklistBusy, setChecklistBusy] = useState(false);
  const [checklistError, setChecklistError] = useState<string | null>(null);

  function onTipoEquipoChecklistChange(v: TipoEquipoBaja) {
    setTipoEquipoChecklist(v);
    setCategoriaChecklist("");
  }

  const itemsDeLaCategoria = checklistItems.filter((i) => i.tipoEquipo === tipoEquipoChecklist && i.categoria === categoriaChecklist);

  async function agregarItem() {
    if (!categoriaChecklist || !nuevoItemTexto.trim()) return;
    setChecklistBusy(true);
    setChecklistError(null);
    const res = await agregarChecklistItemAction(tipoEquipoChecklist, categoriaChecklist, nuevoItemTexto);
    setChecklistBusy(false);
    if (!res.success) {
      setChecklistError(res.error || "No se pudo agregar.");
      return;
    }
    setNuevoItemTexto("");
    router.refresh();
  }

  async function quitarItem(id: string) {
    setChecklistBusy(true);
    setChecklistError(null);
    const res = await quitarChecklistItemAction(id);
    setChecklistBusy(false);
    if (!res.success) {
      setChecklistError(res.error || "No se pudo quitar.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="card">
      <div className="panel-card-title">
        <h2>Programación automática</h2>
      </div>
      <div className="hint" style={{ margin: "-4px 0 12px" }}>
        Arma la agenda de los próximos ~90 días: agrupa equipos por sitio, agrupa sitios cercanos por provincia (distancia real entre
        coordenadas GPS, no inventada) y reparte las visitas respetando las horas/día configuradas abajo — así la fecha de cada visita
        sale calculada, no la inventa cada técnico en el campo. Se puede correr las veces que haga falta: nunca pisa una programación que
        un técnico ya cargó a mano como excepción puntual.
      </div>
      <button type="button" className="btn btn-primary btn-sm" onClick={generarProgramacion} disabled={generando}>
        <Icon name="calendar" size={13} /> {generando ? "Generando..." : "Generar programación automática"}
      </button>
      {generarResultado && !generarError && (
        <div className="hint" style={{ color: "var(--ok)", marginTop: 8 }}>
          <Icon name="check" size={12} />{" "}
          {generarResultado.sitiosProgramados === 0
            ? "No hay nada para programar en los próximos 90 días."
            : `Se programaron ${generarResultado.sitiosProgramados} sitio${generarResultado.sitiosProgramados === 1 ? "" : "s"} (${generarResultado.equiposProgramados} equipo${generarResultado.equiposProgramados === 1 ? "" : "s"}), entre el ${fmtFecha(generarResultado.primeraFecha!)} y el ${fmtFecha(generarResultado.ultimaFecha!)}.`}
        </div>
      )}
      {generarError && (
        <div className="error-text" style={{ marginTop: 8 }}>
          {generarError}
        </div>
      )}

      <div className="panel-card-title" style={{ marginTop: 20 }}>
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

      <div className="section-label" style={{ marginTop: 20 }}>
        Checklist de mantenimiento por categoría
      </div>
      <div className="hint" style={{ margin: "0 0 10px" }}>
        Ítems que aparecen para completar al registrar un mantenimiento de esa categoría (si la categoría no tiene ítems, no se muestra
        ningún checklist). Vienen precargados para UPS, Grupo electrógeno, Banco de baterías, Rectificador y Radioenlace — agregá/quitá
        según lo que de verdad se controla en el campo.
      </div>
      <div className="tech-form-grid">
        <select value={tipoEquipoChecklist} onChange={(e) => onTipoEquipoChecklistChange(e.target.value as TipoEquipoBaja)} disabled={checklistBusy}>
          {TIPO_EQUIPO_MANTENIMIENTO_OPCIONES.map((t) => (
            <option key={t} value={t}>
              {TIPO_EQUIPO_MANTENIMIENTO_LABEL[t]}
            </option>
          ))}
        </select>
        <select value={categoriaChecklist} onChange={(e) => setCategoriaChecklist(e.target.value)} disabled={checklistBusy}>
          <option value="">Elegí categoría...</option>
          {categoriasDeTipoEquipo(tipoEquipoChecklist).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {categoriaChecklist && (
        <>
          <div className="item-list" style={{ marginTop: 10 }}>
            {itemsDeLaCategoria.length === 0 ? (
              <div className="empty-note">Sin ítems configurados para esta categoría todavía.</div>
            ) : (
              itemsDeLaCategoria.map((item) => (
                <div className="list-item" key={item.id}>
                  <div className="item-name" style={{ fontSize: 13 }}>
                    {item.texto}
                  </div>
                  <button type="button" className="remove-btn" onClick={() => quitarItem(item.id)} disabled={checklistBusy}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="field" style={{ maxWidth: 420, marginTop: 10 }}>
            <label style={{ fontSize: 12 }}>Nuevo ítem</label>
            <input
              type="text"
              placeholder="Ej: Nivel de aceite de motor"
              value={nuevoItemTexto}
              onChange={(e) => setNuevoItemTexto(e.target.value)}
              disabled={checklistBusy}
            />
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={agregarItem} disabled={checklistBusy || !nuevoItemTexto.trim()}>
            + Agregar ítem
          </button>
        </>
      )}
      {checklistError && (
        <div className="error-text" style={{ marginTop: 8 }}>
          {checklistError}
        </div>
      )}
    </div>
  );
}
