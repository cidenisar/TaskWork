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
 * Primera ocurrencia de `regla` que cae en o después de `ahora` —
 * distinto de `calcularProximaOcurrencia`, que siempre salta
 * `cadaMeses` meses adelante del mes de la fecha que le pasás (tiene
 * sentido para "ya se resolvió esta, generá la siguiente", pero da un
 * resultado incorrecto si lo usás para el alta inicial: si hoy es el 3
 * y el admin programa "Primer Lunes", `calcularProximaOcurrencia` con
 * `fechaActual = ahora` se saltaría el lunes 6 de ESTE mes y ofrecería
 * el del mes que viene). Usado por el handler de alta/edición de
 * simulacros (ver handlers/simulacro.ts) — nunca por el motor de
 * resolución, que sigue usando `calcularProximaOcurrencia` tal cual.
 *
 * `horas`/`minutos` son la hora que eligió el admin en el formulario —
 * se prueba primero ese día-de-semana en el mes de `ahora`, a esa
 * hora; si ya pasó, se cae al camino normal de `calcularProximaOcurrencia`
 * (que sí sabe saltar correctamente al próximo salto de `cadaMeses`).
 * No soporta `tipo: "intervalo"` — no tiene un "día calculable en este
 * período" análogo, y la pantalla de Frontend Web que arma esto no
 * ofrece esa forma de regla (ver frontend-web/README.md).
 */
export function primeraOcurrenciaDesde(
  regla: Extract<ReglaRecurrencia, { tipo: "posicion" }>,
  ahora: Date,
  horas: number,
  minutos: number
): Date {
  const ancla = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1, horas, minutos, 0));
  const candidatoEsteMes = nEsimoDiaSemanaDelMes(ancla, regla.diaSemana, regla.posicion);
  if (candidatoEsteMes.getTime() >= ahora.getTime()) return candidatoEsteMes;
  return calcularProximaOcurrencia(regla, candidatoEsteMes);
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
