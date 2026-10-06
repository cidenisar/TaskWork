import type { TipoEquipoBaja } from "@/lib/database.types";
import { CATEGORIA_EQUIPO_OPCIONES as RACK_CATEGORIAS, CATEGORIA_EQUIPO_LABEL as RACK_CATEGORIA_LABEL } from "@/components/racks/types";
import { CATEGORIA_EQUIPO_OPCIONES as EQUIPO_CATEGORIAS, CATEGORIA_EQUIPO_LABEL as EQUIPO_CATEGORIA_LABEL } from "@/components/equipos/types";

/**
 * Plan de Mantenimiento (PDM): reusa a propósito el tipo `TipoEquipoBaja`
 * (ya compartido por Bajas de Equipamiento y Entregas a Depósito) en vez
 * de uno nuevo — es el mismo "a cuál tabla de equipamiento apunta esto".
 * Alcance de esta primera entrega: SOLO Racks y Equipos Individuales —
 * NO Tableros ni Torres de Comunicaciones.
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
export const TIPO_EQUIPO_MANTENIMIENTO_OPCIONES: TipoEquipoBaja[] = ["rack_equipamiento", "equipo_individual"];

export const TIPO_EQUIPO_MANTENIMIENTO_LABEL: Record<TipoEquipoBaja, string> = {
  tablero_circuito: "Tablero — circuito/elemento",
  rack_equipamiento: "Rack — equipamiento",
  equipo_individual: "Equipo individual",
};

/** Cada tipo_equipo tiene su PROPIO enum de categoría — no hay un solo tipo que sirva para los dos a la vez. */
export function categoriasDeTipoEquipo(tipoEquipo: TipoEquipoBaja): { value: string; label: string }[] {
  if (tipoEquipo === "rack_equipamiento") return RACK_CATEGORIAS.map((c) => ({ value: c, label: RACK_CATEGORIA_LABEL[c] }));
  return EQUIPO_CATEGORIAS.map((c) => ({ value: c, label: EQUIPO_CATEGORIA_LABEL[c] }));
}

export function labelCategoriaMantenimiento(tipoEquipo: TipoEquipoBaja, categoria: string): string {
  return categoriasDeTipoEquipo(tipoEquipo).find((o) => o.value === categoria)?.label ?? categoria;
}

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
