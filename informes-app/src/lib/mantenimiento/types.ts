import type { TipoEquipoMantenimiento, MotivoReprogramacionMantenimiento } from "@/lib/database.types";
import { CATEGORIA_EQUIPO_OPCIONES as RACK_CATEGORIAS, CATEGORIA_EQUIPO_LABEL as RACK_CATEGORIA_LABEL } from "@/components/racks/types";
import { CATEGORIA_EQUIPO_OPCIONES as EQUIPO_CATEGORIAS, CATEGORIA_EQUIPO_LABEL as EQUIPO_CATEGORIA_LABEL } from "@/components/equipos/types";
import { SALA_TIPO_CONSTRUCCION_OPCIONES, SALA_TIPO_CONSTRUCCION_LABEL } from "@/components/salas/types";

/**
 * Plan de Mantenimiento (PDM): usa `TipoEquipoMantenimiento`, un tipo
 * PROPIO (ver database.types.ts) — separado de `TipoEquipoBaja`, que
 * siguen usando solo Bajas de Equipamiento y Entregas a Depósito. Alcance:
 * Racks, Equipos Individuales y Salas — NO Tableros ni Torres de
 * Comunicaciones.
 * - Tableros queda afuera porque YA tiene su propio sistema de
 *   mantenimiento (`tablero_mantenimientos`, con fecha de próxima visita
 *   que carga a mano el técnico en `/tableros/mantenimiento`) — construir
 *   uno paralelo acá hubiera sido exactamente la duplicación que
 *   CRITERIOS_Y_IDEAS.md pide evitar. Si más adelante conviene que
 *   Tableros también use intervalos configurables por categoría en vez
 *   de fecha manual, es una migración de ESE sistema, no una suma.
 * - Torres queda afuera por el mismo motivo que en Bajas/Entregas:
 *   todavía no tiene su propia sección en la ficha de Sitio.
 */
export const TIPO_EQUIPO_MANTENIMIENTO_OPCIONES: TipoEquipoMantenimiento[] = ["rack_equipamiento", "equipo_individual", "sala"];

export const TIPO_EQUIPO_MANTENIMIENTO_LABEL: Record<TipoEquipoMantenimiento, string> = {
  rack_equipamiento: "Rack — equipamiento",
  equipo_individual: "Equipo individual",
  sala: "Sala / Shelter",
};

/** Cada tipo_equipo tiene su PROPIO enum de categoría — no hay un solo tipo que sirva para los tres a la vez. */
export function categoriasDeTipoEquipo(tipoEquipo: TipoEquipoMantenimiento): { value: string; label: string }[] {
  if (tipoEquipo === "rack_equipamiento") return RACK_CATEGORIAS.map((c) => ({ value: c, label: RACK_CATEGORIA_LABEL[c] }));
  if (tipoEquipo === "sala") return SALA_TIPO_CONSTRUCCION_OPCIONES.map((c) => ({ value: c, label: SALA_TIPO_CONSTRUCCION_LABEL[c] }));
  return EQUIPO_CATEGORIAS.map((c) => ({ value: c, label: EQUIPO_CATEGORIA_LABEL[c] }));
}

export function labelCategoriaMantenimiento(tipoEquipo: TipoEquipoMantenimiento, categoria: string): string {
  return categoriasDeTipoEquipo(tipoEquipo).find((o) => o.value === categoria)?.label ?? categoria;
}

/** Por qué se reprograma a mano — ej. el técnico llegó al sitio y no pudo hacer el mantenimiento. Igual criterio que MotivoBaja: enum chico con "otro" de escape. */
export const MOTIVO_REPROGRAMACION_OPCIONES: MotivoReprogramacionMantenimiento[] = [
  "clima",
  "sitio_inaccesible",
  "falta_repuesto",
  "equipo_no_encontrado",
  "seguridad_sitio",
  "otro",
];

export const MOTIVO_REPROGRAMACION_LABEL: Record<MotivoReprogramacionMantenimiento, string> = {
  clima: "Clima (lluvia, tormenta, etc.)",
  sitio_inaccesible: "Sitio inaccesible (ruta, llave, etc.)",
  falta_repuesto: "Falta repuesto/herramienta",
  equipo_no_encontrado: "Equipo no se encontró / fue retirado",
  seguridad_sitio: "No se pudo ingresar (seguridad del sitio)",
  otro: "Otro",
};

export type UrgenciaMantenimiento = "vencido" | "proximo" | "ok" | "nunca" | "sin_intervalo";

export interface EstadoMantenimiento {
  urgencia: UrgenciaMantenimiento;
  mensaje: string;
  /** Negativo = vencido hace esos días. Null cuando no se puede calcular (sin intervalo o nunca se hizo). */
  diasRestantes: number | null;
}

/** Aviso con N días de anticipación, sea cual sea la frecuencia configurada — un intervalo corto (30 días) no debería avisar recién a 1 día. */
const VENTANA_PROXIMO_DIAS = 15;

/**
 * Mismo criterio que "próximo service" de Vehículos
 * (`lib/config/fleet-alerts.ts`): nunca se guarda un "próximo
 * mantenimiento" aparte, se recalcula al vuelo a partir del último
 * mantenimiento registrado + el intervalo configurado para esa categoría.
 */
export function calcularEstadoMantenimiento(
  frecuenciaDias: number | null,
  ultimaFecha: string | null,
  hoy: Date = new Date(),
): EstadoMantenimiento {
  if (frecuenciaDias == null) return { urgencia: "sin_intervalo", mensaje: "Sin intervalo configurado", diasRestantes: null };
  if (!ultimaFecha) return { urgencia: "nunca", mensaje: "Nunca tuvo un mantenimiento registrado", diasRestantes: null };

  const diasDesdeUltimo = Math.round((hoy.getTime() - new Date(`${ultimaFecha}T00:00:00`).getTime()) / 86_400_000);
  const restantes = frecuenciaDias - diasDesdeUltimo;
  if (restantes < 0) {
    return { urgencia: "vencido", mensaje: `Vencido hace ${Math.abs(restantes)} día${Math.abs(restantes) === 1 ? "" : "s"}`, diasRestantes: restantes };
  }
  if (restantes <= VENTANA_PROXIMO_DIAS) {
    return { urgencia: "proximo", mensaje: `Vence en ${restantes} día${restantes === 1 ? "" : "s"}`, diasRestantes: restantes };
  }
  return { urgencia: "ok", mensaje: `Faltan ${restantes} días`, diasRestantes: restantes };
}
