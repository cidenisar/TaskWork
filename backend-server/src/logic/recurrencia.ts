// Motor de recurrencia de simulacros — pura, sin I/O (ver test/recurrencia.test.ts).
// Ver types.ts (ReglaRecurrencia) para las dos formas de regla soportadas.
//
// Todo el cálculo usa los métodos UTC de Date (getUTC*/setUTC*) a propósito
// — así el resultado no depende de en qué zona horaria corre el proceso
// Node. `fecha_hora` es timestamptz en Postgres; el "día de la semana" y
// "posición en el mes" de una regla se calculan sobre esa marca UTC tal
// cual, no sobre una zona horaria local del sitio (no hay ninguna columna
// de timezone por sitio en el modelo — ver "Decisiones pendientes").

import type { ReglaRecurrencia } from "../types.js";

/**
 * Calcula la fecha de la próxima ocurrencia a partir de la fecha de LA
 * OCURRENCIA ACTUAL — no de "ahora". El programa avanza desde donde estaba
 * agendado, no desde cuándo se resolvió: si un simulacro se dispara con
 * unos días de atraso, eso no corre todo el programa hacia adelante.
 */
export function calcularProximaOcurrencia(regla: ReglaRecurrencia, fechaActual: Date): Date {
  if (regla.tipo === "intervalo") {
    const resultado = new Date(fechaActual);
    if (regla.unidad === "semanas") {
      resultado.setUTCDate(resultado.getUTCDate() + regla.cada * 7);
    } else {
      // setUTCMonth sobre el día original desborda cuando el mes destino
      // tiene menos días (ej. 31 de enero + 1 mes "es" el 3 de marzo, no
      // fin de febrero — Date normaliza el overflow al mes siguiente en
      // vez de recortar). Se arma el mes primero con el día en 1 (así
      // nunca desborda mientras cambia de mes), y recién ahí se fija el
      // día, recortado al último día real del mes destino si hace falta.
      const diaOriginal = resultado.getUTCDate();
      resultado.setUTCDate(1);
      resultado.setUTCMonth(resultado.getUTCMonth() + regla.cada);
      const ultimoDiaDelMesDestino = new Date(
        Date.UTC(resultado.getUTCFullYear(), resultado.getUTCMonth() + 1, 0)
      ).getUTCDate();
      resultado.setUTCDate(Math.min(diaOriginal, ultimoDiaDelMesDestino));
    }
    return resultado;
  }

  // tipo === "posicion": el N-ésimo <diaSemana> del mes, `cadaMeses` meses
  // después del mes de la ocurrencia actual.
  const mesObjetivo = new Date(
    Date.UTC(
      fechaActual.getUTCFullYear(),
      fechaActual.getUTCMonth() + regla.cadaMeses,
      1,
      fechaActual.getUTCHours(),
      fechaActual.getUTCMinutes(),
      fechaActual.getUTCSeconds()
    )
  );
  return nEsimoDiaSemanaDelMes(mesObjetivo, regla.diaSemana, regla.posicion);
}

/**
 * @param unaFechaDelMes cualquier fecha del mes objetivo alcanza — solo se
 *   usan año/mes/hora de acá, el día se recalcula desde cero.
 * @param posicion 1..4 = la N-ésima ocurrencia de ese día de semana en el
 *   mes; -1 = la última. No hace falta cubrir "5ta" — todo día de semana
 *   ocurre al menos 4 veces en cualquier mes (mínimo 28 días).
 */
function nEsimoDiaSemanaDelMes(unaFechaDelMes: Date, diaSemana: number, posicion: number): Date {
  const anio = unaFechaDelMes.getUTCFullYear();
  const mes = unaFechaDelMes.getUTCMonth();
  const hora = unaFechaDelMes.getUTCHours();
  const minuto = unaFechaDelMes.getUTCMinutes();
  const segundo = unaFechaDelMes.getUTCSeconds();

  if (posicion === -1) {
    // Último <diaSemana> del mes: arrancar del último día del mes y retroceder.
    const ultimoDiaDelMes = new Date(Date.UTC(anio, mes + 1, 0, hora, minuto, segundo));
    const retroceso = (ultimoDiaDelMes.getUTCDay() - diaSemana + 7) % 7;
    ultimoDiaDelMes.setUTCDate(ultimoDiaDelMes.getUTCDate() - retroceso);
    return ultimoDiaDelMes;
  }

  const primerDiaDelMes = new Date(Date.UTC(anio, mes, 1, hora, minuto, segundo));
  const avanceAlPrimero = (diaSemana - primerDiaDelMes.getUTCDay() + 7) % 7;
  const dia = 1 + avanceAlPrimero + (posicion - 1) * 7;
  return new Date(Date.UTC(anio, mes, dia, hora, minuto, segundo));
}
