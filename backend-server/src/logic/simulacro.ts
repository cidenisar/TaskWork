// Elige "el próximo simulacro" de un sitio, y detecta cuáles ya vencieron
// — pura, sin I/O (ver test/simulacro.test.ts). El handler
// (src/handlers/simulacro.ts) trae las filas `programado` de
// simulacros_programados y llama a estas funciones.
//
// ALCANCE ACTUAL: solo cubre simulacros PUNTUALES (`puntual: true`, con
// `fechaHora` fija). Los recurrentes (`puntual: false`) no tienen forma de
// calcular su próxima ocurrencia todavía — el formato de la columna
// `recurrencia` (jsonb) no está definido en ningún lado de este repo, así
// que quedan fuera de esta selección hasta que se decida ese formato (ver
// README, "Decisiones pendientes"). No es un bug: es preferible no publicar
// nada sobre un recurrente antes que inventarle una fecha.

import type { SimulacroProgramado } from "../types.js";

/**
 * @param simulacros ya filtrados por sitio (el caller decide el sitio) — se
 *   espera que el caller también haya filtrado por `estado: "programado"`,
 *   pero esta función igual lo revalida, no confía ciegamente en el caller.
 * @param ahora inyectado para poder testear sin depender del reloj real.
 */
export function elegirProximoSimulacro(
  simulacros: SimulacroProgramado[],
  ahora: Date
): SimulacroProgramado | null {
  const candidatos = simulacros
    .filter((s) => s.estado === "programado" && s.puntual && s.fechaHora !== null)
    .filter((s) => new Date(s.fechaHora as string).getTime() >= ahora.getTime())
    .sort((a, b) => new Date(a.fechaHora as string).getTime() - new Date(b.fechaHora as string).getTime());
  return candidatos[0] ?? null;
}

/** Margen de tolerancia tras la fecha_hora programada antes de dar un simulacro por "no_realizado" — decisión confirmada con el usuario (2026-08-27). */
export const MARGEN_NO_REALIZADO_MS = 60 * 60 * 1000; // 1 hora

/**
 * Simulacros puntuales `programado` cuya fecha_hora ya pasó hace más del
 * margen de tolerancia — candidatos a marcar `no_realizado` (ver
 * handlers/simulacro.ts, marcarSimulacrosVencidosComoNoRealizados). Mismo
 * alcance que elegirProximoSimulacro: solo puntuales; los recurrentes
 * quedan fuera hasta que se defina el formato de `recurrencia`.
 *
 * @param ahora inyectado para poder testear sin depender del reloj real.
 */
export function simulacrosVencidos(simulacros: SimulacroProgramado[], ahora: Date): SimulacroProgramado[] {
  const limite = ahora.getTime() - MARGEN_NO_REALIZADO_MS;
  return simulacros.filter(
    (s) => s.estado === "programado" && s.puntual && s.fechaHora !== null && new Date(s.fechaHora).getTime() < limite
  );
}
