// Elige "el próximo simulacro" de un sitio — pura, sin I/O (ver
// test/simulacro.test.ts). El handler (src/handlers/simulacro.ts) trae las
// filas `programado` de simulacros_programados y llama a esto.
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
