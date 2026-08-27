// Elige "el próximo simulacro" de un sitio, detecta cuáles ya vencieron, y
// decide la fila siguiente cuando una recurrente se resuelve — pura, sin
// I/O (ver test/simulacro.test.ts). El handler (src/handlers/simulacro.ts)
// trae/escribe las filas de simulacros_programados y llama a estas funciones.

import { calcularProximaOcurrencia } from "./recurrencia.js";
import type { SimulacroProgramado } from "../types.js";

/**
 * "El próximo simulacro" para el broadcast anticipado a las consolas (ver
 * handlers/simulacro.ts, sincronizarSimulacroDeSitio) — excluye los
 * marcados `sorpresa`: avisarlos por acá sería anunciarlos, que es
 * exactamente lo que "sorpresa" quiere evitar. Un sorpresa igual se
 * dispara y se audita normal — esto solo lo saca del aviso previo.
 *
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
    .filter((s) => s.estado === "programado" && s.fechaHora !== null && !s.sorpresa)
    .filter((s) => new Date(s.fechaHora as string).getTime() >= ahora.getTime())
    .sort((a, b) => new Date(a.fechaHora as string).getTime() - new Date(b.fechaHora as string).getTime());
  return candidatos[0] ?? null;
}

/** Margen de tolerancia tras la fecha_hora programada antes de dar un simulacro por "no_realizado" — decisión confirmada con el usuario (2026-08-27). */
export const MARGEN_NO_REALIZADO_MS = 60 * 60 * 1000; // 1 hora

/**
 * Simulacros `programado` cuya fecha_hora ya pasó hace más del margen de
 * tolerancia — candidatos a marcar `no_realizado` (ver
 * handlers/simulacro.ts, marcarSimulacrosVencidosComoNoRealizados).
 */
export function simulacrosVencidos(simulacros: SimulacroProgramado[], ahora: Date): SimulacroProgramado[] {
  const limite = ahora.getTime() - MARGEN_NO_REALIZADO_MS;
  return simulacros.filter(
    (s) => s.estado === "programado" && s.fechaHora !== null && new Date(s.fechaHora).getTime() < limite
  );
}

/** Lo que hace falta para insertar la fila de la próxima ocurrencia — ver Db.insertProximaOcurrenciaSimulacro. */
export interface NuevaFilaSimulacro {
  sitioId: string;
  tipoEventoId: string;
  fechaHora: string; // ISO
  recurrencia: SimulacroProgramado["recurrencia"];
  sorpresa: boolean;
}

/**
 * Decide si una fila recién resuelta (`realizado` o `no_realizado`) debe
 * generar la siguiente ocurrencia del programa, y cuál sería. Devuelve
 * null si no es recurrente (`recurrencia` null) — un simulacro puntual
 * simplemente termina ahí, no genera nada.
 *
 * La próxima fecha se calcula desde la `fechaHora` de ESTA ocurrencia, no
 * desde "ahora" (ver calcularProximaOcurrencia) — y si por algún motivo
 * esta fila no tiene fechaHora (no debería pasar en una fila `programado`
 * real), tampoco se inventa nada: se devuelve null antes que adivinar un
 * ancla.
 *
 * `sorpresa` se hereda tal cual (un programa sorpresa sigue siendo
 * sorpresa) — `escenario` NO se hereda, ver Db.insertProximaOcurrenciaSimulacro.
 */
export function proximaFilaSimulacro(resuelto: SimulacroProgramado): NuevaFilaSimulacro | null {
  if (!resuelto.recurrencia || !resuelto.fechaHora) return null;
  const proxima = calcularProximaOcurrencia(resuelto.recurrencia, new Date(resuelto.fechaHora));
  return {
    sitioId: resuelto.sitioId,
    tipoEventoId: resuelto.tipoEventoId,
    fechaHora: proxima.toISOString(),
    recurrencia: resuelto.recurrencia,
    sorpresa: resuelto.sorpresa,
  };
}
