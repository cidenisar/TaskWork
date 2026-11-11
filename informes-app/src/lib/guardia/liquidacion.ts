/**
 * Liquidación por período (HANDOFF §8/§11/§12.11/§13, Fase 6) — construido
 * ENCIMA del motor (`motor.ts`), sin tocar ni una de sus reglas ya
 * confirmadas por Ivan. Agrega solo lo que hace falta para mostrar en
 * pantalla y exportar a CSV: cuántos EVENTOS tocaron cada día (lo que
 * Ivan ya lleva a mano en su planilla) y el tipo de día.
 *
 * "Derivados, no guardados" (HANDOFF §11): esto se vuelve a calcular cada
 * vez a partir de `guardia_participacion` — nunca se guarda un contador
 * que se actualice a mano. Solo al cerrar un período (ver
 * `guardia_periodo_cierre`) se guarda una foto fija de lo que esta
 * función devolvió en ese momento.
 */
import { calcularEvento, centesimasDelDia, formatActivaciones, PARAMETROS_DEFAULT, type ParametrosGuardia, type Participacion } from "./motor";

export type TipoDia = "Feriado" | "Fin de semana" | "Día hábil";

export interface ParticipacionDetalle extends Participacion {
  /** true si esta participación todavía no tiene `fin` real (se calculó usando "ahora" como fin provisorio). */
  enCurso?: boolean;
}

export interface DiaLiquidadoDetalle {
  minutos: number;
  /** Centésimas — ver `formatActivaciones()` para mostrarlo. */
  centesimas: number;
  /** Cuántos eventos distintos aportaron minutos este día — la columna "Eventos" del CSV (HANDOFF §12.11). */
  eventos: number;
  tipoDia: TipoDia;
  /** Alguno de los eventos de este día todavía no terminó. */
  enCurso: boolean;
}

export interface FichaPersonaDetalle {
  porDia: Record<string, DiaLiquidadoDetalle>;
  totalMinutos: number;
  totalCentesimas: number;
}

/** "Feriado" > "Fin de semana" > "Día hábil" — mismo criterio que el prototipo (`tipoDiaLabel`). */
export function tipoDiaDe(fecha: string, feriados: Set<string>): TipoDia {
  if (feriados.has(fecha)) return "Feriado";
  const [y, m, d] = fecha.split("-").map(Number);
  const diaSemana = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 domingo, 6 sábado
  return diaSemana === 0 || diaSemana === 6 ? "Fin de semana" : "Día hábil";
}

/** Minutos -> "H:MM", para mostrar en pantalla y en el CSV. */
export function formatMinutosHoras(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

/**
 * Igual resultado que `liquidar()` del motor (mismos minutos, mismas
 * centésimas), pero por día también cuenta cuántos eventos aportaron y
 * marca "en curso" — nunca re-decide qué es activación ni cómo se corta
 * media/entera, eso lo sigue haciendo `calcularEvento`/`centesimasDelDia`
 * tal cual están.
 */
export function liquidarConDetalle(
  participaciones: ParticipacionDetalle[],
  feriados: Set<string> = new Set(),
  p: ParametrosGuardia = PARAMETROS_DEFAULT,
): Record<string, FichaPersonaDetalle> {
  const personas: Record<string, FichaPersonaDetalle> = {};
  for (const x of participaciones) {
    const r = calcularEvento(x.inicio, x.fin, feriados, p);
    const ficha = (personas[x.persona] ??= { porDia: {}, totalMinutos: 0, totalCentesimas: 0 });
    for (const [fecha, min] of Object.entries(r.minutosPorDia)) {
      const dia = (ficha.porDia[fecha] ??= {
        minutos: 0,
        centesimas: 0,
        eventos: 0,
        tipoDia: tipoDiaDe(fecha, feriados),
        enCurso: false,
      });
      dia.minutos += min;
      dia.eventos += 1;
      if (x.enCurso) dia.enCurso = true;
    }
  }
  for (const ficha of Object.values(personas)) {
    for (const dia of Object.values(ficha.porDia)) {
      dia.centesimas = centesimasDelDia(dia.minutos, p);
      ficha.totalMinutos += dia.minutos;
      ficha.totalCentesimas += dia.centesimas;
    }
  }
  return personas;
}

export interface FilaCsvPersona {
  nombre: string;
  area: string;
  detalle: FichaPersonaDetalle;
}

function fechaCsv(fecha: string): string {
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}

/** "Persona;Guardia;Fecha;Tipo de día;Eventos;Horas de activación;Resultado del día" + fila TOTAL por persona — formato fijo, HANDOFF §12.11. */
export function csvLiquidacion(filas: FilaCsvPersona[]): string {
  const lineas = ["Persona;Guardia;Fecha;Tipo de día;Eventos;Horas de activación;Resultado del día"];
  for (const { nombre, area, detalle } of filas) {
    for (const fecha of Object.keys(detalle.porDia).sort()) {
      const dia = detalle.porDia[fecha];
      lineas.push(
        [nombre, area, fechaCsv(fecha), dia.tipoDia, String(dia.eventos), formatMinutosHoras(dia.minutos), formatActivaciones(dia.centesimas)].join(";"),
      );
    }
    lineas.push([nombre, area, "TOTAL", "", "", formatMinutosHoras(detalle.totalMinutos), formatActivaciones(detalle.totalCentesimas)].join(";"));
  }
  return lineas.join("\n");
}
