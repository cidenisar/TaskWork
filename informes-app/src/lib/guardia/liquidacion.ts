/**
 * Liquidación por período (HANDOFF §8/§11/§12.11/§13, Fase 6) — construido
 * ENCIMA del motor (`motor.ts`), sin tocar ni una de sus reglas ya
 * confirmadas por Ivan. Agrega solo lo que hace falta para mostrar en
 * pantalla y exportar a planilla (ver `liquidacion-excel.ts`): cuántos
 * EVENTOS tocaron cada día (lo que Ivan ya lleva a mano) y el tipo de día.
 *
 * "Derivados, no guardados" (HANDOFF §11): esto se vuelve a calcular cada
 * vez a partir de `guardia_participacion` — nunca se guarda un contador
 * que se actualice a mano. Solo al cerrar un período (ver
 * `guardia_periodo_cierre`) se guarda una foto fija de lo que esta
 * función devolvió en ese momento.
 */
import { calcularEvento, centesimasDelDia, PARAMETROS_DEFAULT, type ParametrosGuardia, type Participacion } from "./motor";

export type TipoDia = "Feriado" | "Fin de semana" | "Día hábil";

/** Mismos valores que `ModalidadParticipacionGuardia` de `database.types.ts` — se redefine acá (y no se importa) para que este archivo siga siendo calculable sin la capa de datos, como el resto del motor. */
export type ModalidadDetalle = "REMOTO" | "CAMPO";

export interface ParticipacionDetalle extends Participacion {
  /** true si esta participación todavía no tiene `fin` real (se calculó usando "ahora" como fin provisorio). */
  enCurso?: boolean;
  /** Datos del incidente que originó esta participación — solo para mostrar/exportar, el motor no los usa para calcular nada. */
  eventoId?: string;
  /** Texto ya armado (ej. "#0007 · UPS — Mendoza") — mismo formato que `encabezadoEvento()` del detalle del evento. */
  incidente?: string;
  modalidad?: ModalidadDetalle | null;
}

/** Un evento puntual que aportó minutos a este día — para el detalle del CSV ("qué pasó ese día"). */
export interface EventoDelDia {
  eventoId: string;
  incidente: string;
  modalidad: ModalidadDetalle | null;
  minutos: number;
}

export interface DiaLiquidadoDetalle {
  minutos: number;
  /** Centésimas — ver `formatActivaciones()` para mostrarlo. */
  centesimas: number;
  /** Cuántos eventos distintos aportaron minutos este día. */
  eventos: number;
  tipoDia: TipoDia;
  /** Alguno de los eventos de este día todavía no terminó. */
  enCurso: boolean;
  /**
   * Franco compensatorio (pedido de Ivan) — fin de semana/feriado trabajado:
   * mismo corte de 4:30 que la activación (`centesimasDelDia`), pero como
   * beneficio EN PARALELO al valor en pesos, nunca en su lugar. 0 en día
   * hábil (ahí el franco no corresponde).
   */
  francos: number;
  /** Cada participación que aportó minutos este día — para el CSV detallado por incidente. */
  detalleEventos: EventoDelDia[];
}

export interface FichaPersonaDetalle {
  porDia: Record<string, DiaLiquidadoDetalle>;
  totalMinutos: number;
  totalCentesimas: number;
  totalFrancos: number;
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
    const ficha = (personas[x.persona] ??= { porDia: {}, totalMinutos: 0, totalCentesimas: 0, totalFrancos: 0 });
    for (const [fecha, min] of Object.entries(r.minutosPorDia)) {
      const dia = (ficha.porDia[fecha] ??= {
        minutos: 0,
        centesimas: 0,
        eventos: 0,
        tipoDia: tipoDiaDe(fecha, feriados),
        enCurso: false,
        francos: 0,
        detalleEventos: [],
      });
      dia.minutos += min;
      dia.eventos += 1;
      if (x.enCurso) dia.enCurso = true;
      if (x.eventoId) {
        dia.detalleEventos.push({ eventoId: x.eventoId, incidente: x.incidente ?? "—", modalidad: x.modalidad ?? null, minutos: min });
      }
    }
  }
  for (const ficha of Object.values(personas)) {
    for (const dia of Object.values(ficha.porDia)) {
      dia.centesimas = centesimasDelDia(dia.minutos, p);
      dia.francos = dia.tipoDia !== "Día hábil" ? centesimasDelDia(dia.minutos, p) : 0;
      ficha.totalMinutos += dia.minutos;
      ficha.totalCentesimas += dia.centesimas;
      ficha.totalFrancos += dia.francos;
    }
  }
  return personas;
}

/** Una fila de la liquidación lista para exportar (XLSX — ver `liquidacion-excel.ts`), por persona. */
export interface FilaLiquidacionExport {
  nombre: string;
  area: string;
  detalle: FichaPersonaDetalle;
}

/** DD/MM/AAAA — para mostrar fechas en la planilla exportada. */
export function fechaLegible(fecha: string): string {
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}
