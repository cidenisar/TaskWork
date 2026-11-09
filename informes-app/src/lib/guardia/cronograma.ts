/**
 * Cronograma de guardia, cambios y "quién está de guardia ahora" — portado
 * desde `docs/guardia-general/prototipo/guardia-general-prototipo.html`
 * (HANDOFF-guardia-general.md §7). El prototipo es la fuente de verdad del
 * COMPORTAMIENTO, pero muta un estado global en memoria; estas funciones
 * son las mismas reglas escritas PURAS (reciben el estado actual, devuelven
 * uno nuevo) para que el servidor las pueda llamar de forma predecible y
 * testeable, sin depender de ningún estado compartido.
 *
 * Las fechas de guardia ("día de guardia", "semana de guardia") son
 * distintas de la fecha calendario: la semana de guardia arranca el
 * miércoles a `cambioMin` (default 10:00) — ver §7.1 y §15 ("documentos con
 * la palabra guardia y semana mezclan dos cosas").
 */

export const AREAS_GUARDIA = ["General", "Infraestructura", "Datos", "Enlaces"] as const;
export type AreaGuardia = (typeof AREAS_GUARDIA)[number];

const MIN_DIA = 1440;

function absoluto(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) throw new Error(`Fecha inválida: ${iso}`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  return (Date.UTC(y, mo - 1, d) / 86_400_000) * MIN_DIA + h * 60 + mi;
}

function fechaDeDia(dia: number): string {
  return new Date(dia * 86_400_000).toISOString().slice(0, 10);
}

function diaDeFecha(fecha: string): number {
  const [y, mo, d] = fecha.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, mo - 1, d) / 86_400_000;
}

/** Día de guardia: el "día calendario" se corre `cambioMin` minutos — antes de esa hora todavía es el día de guardia anterior. */
export function diaGuardia(iso: string, cambioMin: number): number {
  return Math.floor((absoluto(iso) - cambioMin) / MIN_DIA);
}

/** La clave de la semana de guardia: el miércoles (≤ el día de guardia del instante) como fecha ISO. */
export function inicioSemana(iso: string, cambioMin: number): string {
  const dia = diaGuardia(iso, cambioMin);
  const dow = new Date(dia * 86_400_000).getUTCDay(); // 0 domingo ... 3 miércoles ... 6 sábado
  return fechaDeDia(dia - ((dow - 3 + 7) % 7));
}

export function finSemana(semanaInicio: string): string {
  return fechaDeDia(diaDeFecha(semanaInicio) + 6);
}

/**
 * Todos los miércoles (clave de semana) que tocan un año, desde el
 * miércoles ≤ 1/ene hasta el 31/dic. La semana-frontera (el miércoles ≤
 * 1/ene) puede coincidir con la última semana de la lista del año anterior
 * — no es un bug: es la misma semana real vista desde las dos puntas, y por
 * eso `generarProgramacion` no la vuelve a pisar al generar el año que
 * sigue (la rotación "nueva" arranca en la semana siguiente a esa).
 */
export function semanasDelAnio(anio: number): string[] {
  const ini = Date.UTC(anio, 0, 1) / 86_400_000;
  const fin = Date.UTC(anio, 11, 31) / 86_400_000;
  const dow = new Date(ini * 86_400_000).getUTCDay();
  const out: string[] = [];
  for (let d = ini - ((dow - 3 + 7) % 7); d <= fin; d += 7) out.push(fechaDeDia(d));
  return out;
}

export interface PersonaGuardia {
  id: string;
  area: AreaGuardia;
  /** Orden de rotación dentro del área (pregunta abierta §16.7 — resuelta con el default del HANDOFF: campo editable). */
  orden: number;
}

/** Ids de las personas de un área, en orden de rotación. */
export function listaArea(personas: PersonaGuardia[], area: AreaGuardia): string[] {
  return personas
    .filter((p) => p.area === area)
    .sort((a, b) => a.orden - b.orden)
    .map((p) => p.id);
}

/** semana_inicio -> área -> persona (null = sin asignar). */
export type Cronograma = Record<string, Partial<Record<AreaGuardia, string | null>>>;

export function guardiaSemana(cronograma: Cronograma, area: AreaGuardia, semanaInicio: string): string | null {
  return cronograma[semanaInicio]?.[area] ?? null;
}

export type EstadoCambioGuardia = "pendiente" | "aceptado" | "rechazado" | "anulado";

export interface CambioGuardia {
  id: string;
  area: AreaGuardia;
  /** Quien cubre. */
  persona: string;
  /** Quien no puede hacer su guardia. */
  original: string;
  /** Rango de DÍAS DE GUARDIA (fecha ISO, no de calendario) que cubre. */
  desde: string;
  hasta: string;
  estado: EstadoCambioGuardia;
}

/** El cambio ACEPTADO vigente para un área en un día de guardia — si hay varios que se superponen, gana el ÚLTIMO registrado (§7.2). */
export function cambioVigente(cambios: CambioGuardia[], area: AreaGuardia, diaGuardiaFecha: string): CambioGuardia | null {
  for (let i = cambios.length - 1; i >= 0; i--) {
    const c = cambios[i];
    if (c.estado === "aceptado" && c.area === area && c.desde <= diaGuardiaFecha && diaGuardiaFecha <= c.hasta) return c;
  }
  return null;
}

/**
 * Quién está de guardia en un área en un instante dado (§7.2): primero un
 * cambio aceptado que cubra ese día de guardia; si no hay, el cronograma de
 * la semana. Mientras un cambio está `pendiente` NO rige: sigue el
 * cronograma (por eso esta función solo mira `estado === "aceptado"`, vía
 * cambioVigente).
 */
export function guardiaDe(
  cronograma: Cronograma,
  cambios: CambioGuardia[],
  area: AreaGuardia,
  iso: string,
  cambioMin: number,
): string | null {
  const dia = fechaDeDia(diaGuardia(iso, cambioMin));
  const cambio = cambioVigente(cambios, area, dia);
  if (cambio) return cambio.persona;
  return guardiaSemana(cronograma, area, inicioSemana(iso, cambioMin));
}

/**
 * Generar la programación anual (§7.3): rotación de 1 por semana, continúa
 * desde quien estuvo de guardia la semana anterior (cruza de año sin
 * reiniciar: la semana anterior al 1er miércoles de 2027 es la última de
 * 2026). No pisa lo ya cargado salvo `pisar=true`. Devuelve un cronograma
 * NUEVO (no muta el que recibe) + cuántos turnos escribió.
 */
export function generarProgramacion(
  cronograma: Cronograma,
  personas: PersonaGuardia[],
  anio: number,
  area: AreaGuardia | "Todas",
  pisar: boolean,
): { cronograma: Cronograma; nuevos: number } {
  const nuevo: Cronograma = structuredClone(cronograma);
  const areas = area === "Todas" ? AREAS_GUARDIA : [area];
  let nuevos = 0;
  for (const a of areas) {
    const lista = listaArea(personas, a);
    if (lista.length === 0) continue;
    let prev: string | null = null;
    for (const ws of semanasDelAnio(anio)) {
      const semana = (nuevo[ws] ??= {});
      if (semana[a] && !pisar) {
        prev = semana[a];
        continue;
      }
      if (prev === null) {
        const semanaAnterior = nuevo[fechaDeDia(diaDeFecha(ws) - 7)];
        prev = semanaAnterior?.[a] ?? null;
      }
      const i: number = prev === null ? -1 : lista.indexOf(prev);
      const siguiente: string = lista[i < 0 ? 0 : (i + 1) % lista.length];
      semana[a] = siguiente;
      prev = siguiente;
      nuevos++;
    }
  }
  return { cronograma: nuevo, nuevos };
}

/**
 * Rehacer el cronograma de un área desde la semana que viene (§7.4): lo
 * pasado y la semana en curso no se tocan, salvo que la persona de esta
 * semana ya no esté en la lista actual del área. Si el área queda sin
 * personas, sus semanas futuras quedan sin asignar. Devuelve un cronograma
 * NUEVO.
 */
export function regenerarDesde(
  cronograma: Cronograma,
  personas: PersonaGuardia[],
  area: AreaGuardia,
  semanaActual: string,
): Cronograma {
  const lista = listaArea(personas, area);
  const nuevo: Cronograma = structuredClone(cronograma);
  for (const ws of Object.keys(nuevo).sort()) {
    if (ws < semanaActual) continue;
    const semana = (nuevo[ws] ??= {});
    if (ws === semanaActual && semana[area] && lista.includes(semana[area] as string)) continue;
    if (lista.length === 0) {
      delete semana[area];
      continue;
    }
    const semanaAnterior = nuevo[fechaDeDia(diaDeFecha(ws) - 7)];
    const prev = semanaAnterior?.[area] ?? null;
    const i = prev ? lista.indexOf(prev) : -1;
    semana[area] = lista[i < 0 ? 0 : (i + 1) % lista.length];
  }
  return nuevo;
}

/** Celdas de `area` donde `antes` y `despues` difieren — para que el server action solo escriba (y deje historial de) lo que realmente cambió, no el cronograma entero. */
export function celdasCambiadas(
  antes: Cronograma,
  despues: Cronograma,
  area: AreaGuardia,
): { semanaInicio: string; antes: string | null; despues: string | null }[] {
  const claves = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  const cambios: { semanaInicio: string; antes: string | null; despues: string | null }[] = [];
  for (const semanaInicio of claves) {
    const a = antes[semanaInicio]?.[area] ?? null;
    const d = despues[semanaInicio]?.[area] ?? null;
    if (a !== d) cambios.push({ semanaInicio, antes: a, despues: d });
  }
  return cambios.sort((x, y) => x.semanaInicio.localeCompare(y.semanaInicio));
}
