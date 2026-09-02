import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularProximaOcurrencia, primeraOcurrenciaDesde } from "../src/logic/recurrencia.js";
import type { ReglaRecurrencia } from "../src/types.js";

test("intervalo semanas: suma N*7 días, conserva la hora", () => {
  const regla: ReglaRecurrencia = { tipo: "intervalo", unidad: "semanas", cada: 2 };
  const resultado = calcularProximaOcurrencia(regla, new Date("2026-06-01T14:30:00.000Z"));
  assert.equal(resultado.toISOString(), "2026-06-15T14:30:00.000Z");
});

test("intervalo meses: mensual", () => {
  const regla: ReglaRecurrencia = { tipo: "intervalo", unidad: "meses", cada: 1 };
  const resultado = calcularProximaOcurrencia(regla, new Date("2026-06-01T10:00:00.000Z"));
  assert.equal(resultado.toISOString(), "2026-07-01T10:00:00.000Z");
});

test("intervalo meses: trimestral, cruzando fin de año", () => {
  const regla: ReglaRecurrencia = { tipo: "intervalo", unidad: "meses", cada: 3 };
  const resultado = calcularProximaOcurrencia(regla, new Date("2026-11-15T09:00:00.000Z"));
  assert.equal(resultado.toISOString(), "2027-02-15T09:00:00.000Z");
});

test("intervalo meses: 31 de enero + 1 mes recorta a fin de febrero, no desborda a marzo", () => {
  const regla: ReglaRecurrencia = { tipo: "intervalo", unidad: "meses", cada: 1 };
  const resultado = calcularProximaOcurrencia(regla, new Date("2026-01-31T10:00:00.000Z"));
  // 2026 no es bisiesto — sin el recorte, Date normaliza "31 de febrero" al 3 de marzo.
  assert.equal(resultado.toISOString(), "2026-02-28T10:00:00.000Z");
});

test("intervalo meses: 31 de enero + 1 mes en año bisiesto recorta al 29", () => {
  const regla: ReglaRecurrencia = { tipo: "intervalo", unidad: "meses", cada: 1 };
  const resultado = calcularProximaOcurrencia(regla, new Date("2028-01-31T10:00:00.000Z"));
  assert.equal(resultado.toISOString(), "2028-02-29T10:00:00.000Z");
});

test("intervalo meses: 31 de marzo + 1 mes recorta a fin de abril (30 días)", () => {
  const regla: ReglaRecurrencia = { tipo: "intervalo", unidad: "meses", cada: 1 };
  const resultado = calcularProximaOcurrencia(regla, new Date("2026-03-31T10:00:00.000Z"));
  assert.equal(resultado.toISOString(), "2026-04-30T10:00:00.000Z");
});

test("posicion: el primer lunes de cada trimestre", () => {
  // 2026-06-01 es lunes — arranca ahí, cadaMeses:3 → septiembre 2026.
  const regla: ReglaRecurrencia = { tipo: "posicion", diaSemana: 1, posicion: 1, cadaMeses: 3 };
  const resultado = calcularProximaOcurrencia(regla, new Date("2026-06-01T10:00:00.000Z"));
  // 1° de septiembre de 2026 es martes → el primer lunes es el 7.
  assert.equal(resultado.toISOString(), "2026-09-07T10:00:00.000Z");
});

test("posicion: el último viernes del mes", () => {
  const regla: ReglaRecurrencia = { tipo: "posicion", diaSemana: 5, posicion: -1, cadaMeses: 1 };
  // Desde cualquier fecha de junio 2026, el mes objetivo es julio 2026.
  const resultado = calcularProximaOcurrencia(regla, new Date("2026-06-10T08:00:00.000Z"));
  // 31 de julio de 2026 es viernes → es el último viernes de ese mes.
  assert.equal(resultado.toISOString(), "2026-07-31T08:00:00.000Z");
});

test("posicion: cuarto martes del mes", () => {
  const regla: ReglaRecurrencia = { tipo: "posicion", diaSemana: 2, posicion: 4, cadaMeses: 1 };
  const resultado = calcularProximaOcurrencia(regla, new Date("2026-01-01T12:00:00.000Z"));
  // Febrero 2026: martes 3, 10, 17, 24 → el 4to es el 24.
  assert.equal(resultado.toISOString(), "2026-02-24T12:00:00.000Z");
});

test("posicion: semestral (cadaMeses: 6)", () => {
  const regla: ReglaRecurrencia = { tipo: "posicion", diaSemana: 3, posicion: 1, cadaMeses: 6 };
  const resultado = calcularProximaOcurrencia(regla, new Date("2026-03-04T00:00:00.000Z")); // ya es 1er miércoles de marzo
  // 6 meses después: septiembre 2026. 1° de septiembre es martes → 1er miércoles es el 2.
  assert.equal(resultado.toISOString(), "2026-09-02T00:00:00.000Z");
});

// primeraOcurrenciaDesde — usada al programar un simulacro recurrente
// nuevo desde Frontend Web (ver logic/simulacro.ts, handlers/simulacro.ts).
// Enero 2026: el 1° es jueves. "Primer lunes de enero 2026" = 5 de enero.

test("primeraOcurrenciaDesde: este mes todavía no pasó -> usa este mes", () => {
  const regla: ReglaRecurrencia = { tipo: "posicion", diaSemana: 1, posicion: 1, cadaMeses: 1 };
  const resultado = primeraOcurrenciaDesde(regla, new Date("2026-01-03T08:00:00.000Z"), 10, 0);
  assert.equal(resultado.toISOString(), "2026-01-05T10:00:00.000Z");
});

test("primeraOcurrenciaDesde: hoy ES el día pero la hora elegida todavía no llegó -> hoy mismo", () => {
  const regla: ReglaRecurrencia = { tipo: "posicion", diaSemana: 1, posicion: 1, cadaMeses: 1 };
  const resultado = primeraOcurrenciaDesde(regla, new Date("2026-01-05T08:00:00.000Z"), 10, 0);
  assert.equal(resultado.toISOString(), "2026-01-05T10:00:00.000Z");
});

test("primeraOcurrenciaDesde: este mes ya pasó -> salta al próximo salto de cadaMeses", () => {
  const regla: ReglaRecurrencia = { tipo: "posicion", diaSemana: 1, posicion: 1, cadaMeses: 1 };
  // 10 de enero 2026 es posterior al 5 de enero (primer lunes).
  const resultado = primeraOcurrenciaDesde(regla, new Date("2026-01-10T08:00:00.000Z"), 10, 0);
  // Febrero 2026: 1° es domingo -> primer lunes es el 2.
  assert.equal(resultado.toISOString(), "2026-02-02T10:00:00.000Z");
});

test("primeraOcurrenciaDesde: hoy ES el día pero la hora elegida ya pasó -> salta al mes que viene, no se repite este mes", () => {
  const regla: ReglaRecurrencia = { tipo: "posicion", diaSemana: 1, posicion: 1, cadaMeses: 1 };
  const resultado = primeraOcurrenciaDesde(regla, new Date("2026-01-05T12:00:00.000Z"), 10, 0);
  assert.equal(resultado.toISOString(), "2026-02-02T10:00:00.000Z");
});

test("primeraOcurrenciaDesde: posición 'último' (viernes) todavía no llegó este mes", () => {
  const regla: ReglaRecurrencia = { tipo: "posicion", diaSemana: 5, posicion: -1, cadaMeses: 1 };
  // Julio 2026: el último viernes es el 31.
  const resultado = primeraOcurrenciaDesde(regla, new Date("2026-07-01T00:00:00.000Z"), 14, 0);
  assert.equal(resultado.toISOString(), "2026-07-31T14:00:00.000Z");
});

test("primeraOcurrenciaDesde: posición 'último' ya pasó este mes -> mes siguiente", () => {
  const regla: ReglaRecurrencia = { tipo: "posicion", diaSemana: 5, posicion: -1, cadaMeses: 1 };
  // Agosto 2026: último viernes es el 28 — probamos desde el 29/ago, ya pasado.
  const resultado = primeraOcurrenciaDesde(regla, new Date("2026-08-29T12:00:00.000Z"), 14, 0);
  // Septiembre 2026: último viernes es el 25.
  assert.equal(resultado.toISOString(), "2026-09-25T14:00:00.000Z");
});
