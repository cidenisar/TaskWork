// Elige "el próximo simulacro" de un sitio, detecta cuáles ya vencieron, y
// decide la fila siguiente cuando una recurrente se resuelve — pura, sin
// I/O (ver test/simulacro.test.ts). El handler (src/handlers/simulacro.ts)
// trae/escribe las filas de simulacros_programados y llama a estas funciones.

import { calcularProximaOcurrencia } from "./recurrencia.js";
import type { SimulacroProgramado, PayloadProgramarSimulacroHttp } from "../types.js";

// --- Validación de POST /simulacros y PATCH /simulacros/:id ---

export type ResultadoValidacionSimulacro =
  | { ok: true; payload: PayloadProgramarSimulacroHttp }
  | { ok: false; error: string };

function esStringNoVacio(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

const FORMA_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FORMA_HORA = /^\d{2}:\d{2}$/;
const POSICIONES_VALIDAS = new Set([1, 2, 3, 4, -1]);

export function validarProgramarSimulacro(body: unknown): ResultadoValidacionSimulacro {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "body debe ser un objeto JSON" };
  }
  const b = body as Record<string, unknown>;

  if (!esStringNoVacio(b.sitioId)) return { ok: false, error: "sitioId es obligatorio" };
  if (!esStringNoVacio(b.tipoEventoId)) return { ok: false, error: "tipoEventoId es obligatorio" };
  if (typeof b.puntual !== "boolean") return { ok: false, error: "puntual debe ser boolean" };
  if (!esStringNoVacio(b.hora) || !FORMA_HORA.test(b.hora as string)) return { ok: false, error: 'hora debe tener el formato "HH:MM"' };

  if (b.puntual) {
    if (!esStringNoVacio(b.fecha) || !FORMA_FECHA.test(b.fecha as string)) {
      return { ok: false, error: 'fecha es obligatoria (formato "YYYY-MM-DD") cuando puntual es true' };
    }
    return {
      ok: true,
      payload: { sitioId: b.sitioId as string, tipoEventoId: b.tipoEventoId as string, puntual: true, fecha: b.fecha as string, hora: b.hora as string, diaSemana: null, posicion: null },
    };
  }

  if (typeof b.diaSemana !== "number" || !Number.isInteger(b.diaSemana) || b.diaSemana < 0 || b.diaSemana > 6) {
    return { ok: false, error: "diaSemana debe ser un entero entre 0 (domingo) y 6 (sábado) cuando puntual es false" };
  }
  if (typeof b.posicion !== "number" || !POSICIONES_VALIDAS.has(b.posicion)) {
    return { ok: false, error: "posicion debe ser 1, 2, 3, 4 (N-ésima) o -1 (última) cuando puntual es false" };
  }
  return {
    ok: true,
    payload: {
      sitioId: b.sitioId as string,
      tipoEventoId: b.tipoEventoId as string,
      puntual: false,
      fecha: null,
      hora: b.hora as string,
      diaSemana: b.diaSemana as PayloadProgramarSimulacroHttp["diaSemana"],
      posicion: b.posicion as PayloadProgramarSimulacroHttp["posicion"],
    },
  };
}

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
  rotacionTipos: string[] | null;
}

/**
 * El tipo de evento de la próxima ocurrencia de un programa recurrente.
 * Sin rotación configurada (null o lista vacía), sigue siendo el mismo
 * tipo de siempre — comportamiento sin cambios respecto de antes de que
 * existiera esto. Con rotación: avanza al siguiente de la lista,
 * volviendo al principio al llegar al final. Si el tipo actual no está en
 * la lista (ej. se cambió la rotación a mitad del programa), arranca de
 * nuevo desde el primero en vez de romper — no hay una posición "correcta"
 * que inferir ahí, así que no tiene sentido fallar por eso.
 */
export function proximoTipoEvento(tipoActualId: string, rotacion: string[] | null): string {
  if (!rotacion || rotacion.length === 0) return tipoActualId;
  const indice = rotacion.indexOf(tipoActualId);
  if (indice === -1) return rotacion[0];
  return rotacion[(indice + 1) % rotacion.length];
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
 * `sorpresa` y `rotacionTipos` se heredan tal cual (un programa sorpresa
 * sigue siendo sorpresa, la rotación sigue rotando) — `escenario` NO se
 * hereda, ver Db.insertProximaOcurrenciaSimulacro.
 */
export function proximaFilaSimulacro(resuelto: SimulacroProgramado): NuevaFilaSimulacro | null {
  if (!resuelto.recurrencia || !resuelto.fechaHora) return null;
  const proxima = calcularProximaOcurrencia(resuelto.recurrencia, new Date(resuelto.fechaHora));
  return {
    sitioId: resuelto.sitioId,
    tipoEventoId: proximoTipoEvento(resuelto.tipoEventoId, resuelto.rotacionTipos),
    fechaHora: proxima.toISOString(),
    recurrencia: resuelto.recurrencia,
    sorpresa: resuelto.sorpresa,
    rotacionTipos: resuelto.rotacionTipos,
  };
}
