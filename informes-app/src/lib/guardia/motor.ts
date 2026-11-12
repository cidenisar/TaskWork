/**
 * Motor de cálculo de activaciones de guardia — portado tal cual desde
 * `docs/guardia-general/codigo-motor/motor-guardia.mjs` (22 tests de
 * aceptación, confirmados contra el caso real de septiembre 2026: A 3,0 ·
 * B 2,0 · C 0,5 · D 1,5 · E 0,5 = 7,5 activaciones). Reglas CONFIRMADAS por
 * Ivan (HANDOFF-guardia-general.md §6) — no cambiar sin consultarlo.
 *
 * Única diferencia real con el original: el original guarda el resultado en
 * "medias" (1 = 0,5 · 2 = 1,0); acá se guarda en CENTÉSIMAS enteras (50 =
 * 0,5 · 100 = 1,0), como pide el HANDOFF, para poder bajar el corte a 0,25
 * el día de mañana sin tocar código. Minutos y centésimas siempre enteros,
 * nunca decimales ni coma flotante.
 *
 * Las fechas entran como hora LOCAL "AAAA-MM-DDTHH:mm": quien llama (el
 * servidor) ya tiene que haber convertido la hora real a la zona de la
 * guardia — este módulo no sabe de zonas horarias.
 */

/** Todo lo que la empresa puede revisar vive acá como dato, no clavado en la lógica — en producción sale de `guardia_parametro` con historial. */
export interface ParametrosGuardia {
  /** 07:30 — desde acá, en día hábil, un llamado es dedicación funcional. */
  entradaMin: number;
  /** 17:00 — desde acá, en día hábil, un llamado es activación. */
  salidaActivacionMin: number;
  /** 07:30 — una activación de madrugada cuenta solo hasta acá. */
  madrugadaHastaMin: number;
  /** 4:30 (270 min) — hasta esto en el día = media activación; más = entera. */
  topeMediaMin: number;
  /** Centésimas: 50 = 0,5 activación. */
  valorMedia: number;
  /** Centésimas: 100 = 1,0 activación. */
  valorEntera: number;
}

export const PARAMETROS_DEFAULT: ParametrosGuardia = {
  entradaMin: 7 * 60 + 30,
  salidaActivacionMin: 17 * 60,
  madrugadaHastaMin: 7 * 60 + 30,
  topeMediaMin: 4 * 60 + 30,
  valorMedia: 50,
  valorEntera: 100,
};

const MIN_DIA = 1440;

export type TipoParticipacion = "dedicacion_funcional" | "activacion";

export interface ResultadoEvento {
  tipo: TipoParticipacion;
  /** fecha ISO (AAAA-MM-DD) -> minutos de activación ese día. Vacío si es dedicación funcional. */
  minutosPorDia: Record<string, number>;
}

export interface Participacion {
  persona: string;
  /** "AAAA-MM-DDTHH:mm", hora local de la guardia. */
  inicio: string;
  fin: string;
}

export interface DiaLiquidado {
  minutos: number;
  /** Centésimas (ver ParametrosGuardia). */
  centesimas: number;
}

export interface FichaPersona {
  porDia: Record<string, DiaLiquidado>;
  eventos: (Participacion & { tipo: TipoParticipacion })[];
  /** Centésimas totales — dividir por 100 para activaciones, o usar formatActivaciones(). */
  totalCentesimas: number;
}

function absoluto(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Fecha inválida: ${iso} (formato AAAA-MM-DDTHH:mm)`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  return (Date.UTC(y, mo - 1, d) / 86_400_000) * MIN_DIA + h * 60 + mi;
}

function fechaDeDia(dia: number): string {
  return new Date(dia * 86_400_000).toISOString().slice(0, 10);
}

function esNoLaborable(dia: number, feriados: Set<string>): boolean {
  const semana = new Date(dia * 86_400_000).getUTCDay(); // 0 domingo, 6 sábado
  return semana === 0 || semana === 6 || feriados.has(fechaDeDia(dia));
}

/**
 * Un evento de UNA persona. El INICIO clasifica todo el evento; después,
 * si es activación, cada día calendario que toca se evalúa por separado
 * (0 a 24) y se parte en los días que corresponda.
 */
export function calcularEvento(
  inicioIso: string,
  finIso: string,
  feriados: Set<string> = new Set(),
  p: ParametrosGuardia = PARAMETROS_DEFAULT,
): ResultadoEvento {
  const ini = absoluto(inicioIso);
  const fin = absoluto(finIso);
  if (fin <= ini) throw new Error("El fin tiene que ser posterior al inicio");

  const diaInicio = Math.floor(ini / MIN_DIA);
  const minInicio = ini - diaInicio * MIN_DIA;

  const arrancaEnJornada =
    !esNoLaborable(diaInicio, feriados) && minInicio >= p.entradaMin && minInicio < p.salidaActivacionMin;
  if (arrancaEnJornada) return { tipo: "dedicacion_funcional", minutosPorDia: {} };

  const minutosPorDia: Record<string, number> = {};
  for (let dia = diaInicio; dia * MIN_DIA < fin; dia++) {
    const desde = Math.max(ini, dia * MIN_DIA);
    const hasta = Math.min(fin, (dia + 1) * MIN_DIA);
    let contados: number;
    if (esNoLaborable(dia, feriados)) {
      contados = hasta - desde; // fin de semana o feriado: 0 a 24
    } else if (dia === diaInicio && minInicio >= p.salidaActivacionMin) {
      contados = hasta - desde; // llamado desde las 17:00: hasta la medianoche
    } else {
      // madrugada (o día siguiente de un evento nocturno): solo hasta las 07:30
      contados = Math.max(0, Math.min(hasta, dia * MIN_DIA + p.madrugadaHastaMin) - desde);
    }
    if (contados > 0) minutosPorDia[fechaDeDia(dia)] = contados;
  }
  return { tipo: "activacion", minutosPorDia };
}

/** Minutos de activación de UN día completo de UNA persona -> centésimas. El corte es sobre la suma del día, nunca evento por evento. */
export function centesimasDelDia(minutos: number, p: ParametrosGuardia = PARAMETROS_DEFAULT): number {
  if (minutos <= 0) return 0;
  return minutos <= p.topeMediaMin ? p.valorMedia : p.valorEntera;
}

/** "0,5" / "1,0" / "2,0" — para mostrar en pantalla. */
export function formatActivaciones(centesimas: number): string {
  return (centesimas / 100).toFixed(1).replace(".", ",");
}

/**
 * Suma minutos por persona y por día entre TODAS sus participaciones, y
 * recién después aplica el corte de 4:30 — nunca evento por evento.
 */
export function liquidar(
  participaciones: Participacion[],
  feriados: Set<string> = new Set(),
  p: ParametrosGuardia = PARAMETROS_DEFAULT,
): Record<string, FichaPersona> {
  const personas: Record<string, FichaPersona> = {};
  for (const x of participaciones) {
    const r = calcularEvento(x.inicio, x.fin, feriados, p);
    const ficha = (personas[x.persona] ??= { porDia: {}, eventos: [], totalCentesimas: 0 });
    ficha.eventos.push({ ...x, tipo: r.tipo });
    for (const [fecha, min] of Object.entries(r.minutosPorDia)) {
      ficha.porDia[fecha] = { minutos: (ficha.porDia[fecha]?.minutos ?? 0) + min, centesimas: 0 };
    }
  }
  for (const ficha of Object.values(personas)) {
    for (const [fecha, dia] of Object.entries(ficha.porDia)) {
      const centesimas = centesimasDelDia(dia.minutos, p);
      ficha.porDia[fecha] = { minutos: dia.minutos, centesimas };
      ficha.totalCentesimas += centesimas;
    }
  }
  return personas;
}
