import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirProximoSimulacro, simulacrosVencidos, proximaFilaSimulacro } from "../src/logic/simulacro.js";
import type { SimulacroProgramado } from "../src/types.js";

function simulacro(overrides: Partial<SimulacroProgramado> = {}): SimulacroProgramado {
  return {
    id: "s1",
    sitioId: "sitio1",
    tipoEventoId: "tipo1",
    tipoEventoNombre: "Incendio",
    puntual: true,
    fechaHora: "2026-06-01T10:00:00.000Z",
    estado: "programado",
    recurrencia: null,
    ...overrides,
  };
}

const ahora = new Date("2026-05-01T00:00:00.000Z");

test("elegirProximoSimulacro: entre varios futuros, elige el más próximo", () => {
  const a = simulacro({ id: "a", fechaHora: "2026-07-01T00:00:00.000Z" });
  const b = simulacro({ id: "b", fechaHora: "2026-06-01T00:00:00.000Z" });
  const c = simulacro({ id: "c", fechaHora: "2026-08-01T00:00:00.000Z" });
  const resultado = elegirProximoSimulacro([a, b, c], ahora);
  assert.equal(resultado?.id, "b");
});

test("elegirProximoSimulacro: ignora los que ya pasaron", () => {
  const pasado = simulacro({ id: "pasado", fechaHora: "2026-01-01T00:00:00.000Z" });
  const futuro = simulacro({ id: "futuro", fechaHora: "2026-06-01T00:00:00.000Z" });
  const resultado = elegirProximoSimulacro([pasado, futuro], ahora);
  assert.equal(resultado?.id, "futuro");
});

test("elegirProximoSimulacro: ignora los que no están en estado programado", () => {
  const realizado = simulacro({ id: "realizado", estado: "realizado", fechaHora: "2026-05-15T00:00:00.000Z" });
  const noRealizado = simulacro({ id: "no_realizado", estado: "no_realizado", fechaHora: "2026-05-16T00:00:00.000Z" });
  const pendiente = simulacro({
    id: "pendiente_confirmacion",
    estado: "pendiente_confirmacion",
    fechaHora: "2026-05-17T00:00:00.000Z",
  });
  const programado = simulacro({ id: "programado", fechaHora: "2026-06-01T00:00:00.000Z" });
  const resultado = elegirProximoSimulacro([realizado, noRealizado, pendiente, programado], ahora);
  assert.equal(resultado?.id, "programado");
});

test("elegirProximoSimulacro: un recurrente con fechaHora participa igual que un puntual", () => {
  const recurrente = simulacro({
    id: "recurrente",
    puntual: false,
    fechaHora: "2026-05-20T00:00:00.000Z",
    recurrencia: { tipo: "intervalo", unidad: "meses", cada: 3 },
  });
  const puntual = simulacro({ id: "puntual", fechaHora: "2026-06-01T00:00:00.000Z" });
  // El recurrente es más próximo — antes quedaba afuera por ser puntual: false, ya no.
  assert.equal(elegirProximoSimulacro([recurrente, puntual], ahora)?.id, "recurrente");
});

test("elegirProximoSimulacro: sin candidatos devuelve null", () => {
  assert.equal(elegirProximoSimulacro([], ahora), null);
});

test("simulacrosVencidos: programado hace más de 1h se considera vencido", () => {
  const haceDosHoras = new Date(ahora.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const s = simulacro({ id: "s", fechaHora: haceDosHoras });
  assert.deepEqual(
    simulacrosVencidos([s], ahora).map((x) => x.id),
    ["s"]
  );
});

test("simulacrosVencidos: dentro del margen de 1h todavía no se considera vencido", () => {
  const haceMediaHora = new Date(ahora.getTime() - 30 * 60 * 1000).toISOString();
  const s = simulacro({ id: "s", fechaHora: haceMediaHora });
  assert.deepEqual(simulacrosVencidos([s], ahora), []);
});

test("simulacrosVencidos: uno futuro nunca es vencido", () => {
  const enUnaHora = new Date(ahora.getTime() + 60 * 60 * 1000).toISOString();
  const s = simulacro({ id: "s", fechaHora: enUnaHora });
  assert.deepEqual(simulacrosVencidos([s], ahora), []);
});

test("simulacrosVencidos: un recurrente vencido también cuenta; ignora los ya resueltos", () => {
  const haceDosHoras = new Date(ahora.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const yaRealizado = simulacro({ id: "realizado", estado: "realizado", fechaHora: haceDosHoras });
  const yaNoRealizado = simulacro({ id: "no_realizado", estado: "no_realizado", fechaHora: haceDosHoras });
  const recurrenteVencido = simulacro({
    id: "recurrente_vencido",
    puntual: false,
    fechaHora: haceDosHoras,
    recurrencia: { tipo: "intervalo", unidad: "semanas", cada: 2 },
  });
  const vencido = simulacro({ id: "vencido", fechaHora: haceDosHoras });
  assert.deepEqual(
    simulacrosVencidos([yaRealizado, yaNoRealizado, recurrenteVencido, vencido], ahora)
      .map((x) => x.id)
      .sort(),
    ["recurrente_vencido", "vencido"]
  );
});

test("proximaFilaSimulacro: null si no es recurrente", () => {
  const puntual = simulacro({ recurrencia: null });
  assert.equal(proximaFilaSimulacro(puntual), null);
});

test("proximaFilaSimulacro: recurrente arma la fila siguiente con la misma regla", () => {
  const resuelto = simulacro({
    sitioId: "sitioX",
    tipoEventoId: "tipoY",
    fechaHora: "2026-06-01T10:00:00.000Z",
    recurrencia: { tipo: "intervalo", unidad: "meses", cada: 3 },
  });
  const proxima = proximaFilaSimulacro(resuelto);
  assert.deepEqual(proxima, {
    sitioId: "sitioX",
    tipoEventoId: "tipoY",
    fechaHora: "2026-09-01T10:00:00.000Z",
    recurrencia: { tipo: "intervalo", unidad: "meses", cada: 3 },
  });
});

test("proximaFilaSimulacro: null si es recurrente pero no tiene fechaHora (no se inventa un ancla)", () => {
  const sinFecha = simulacro({
    fechaHora: null,
    recurrencia: { tipo: "intervalo", unidad: "semanas", cada: 1 },
  });
  assert.equal(proximaFilaSimulacro(sinFecha), null);
});
