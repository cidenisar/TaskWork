import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularCumplimiento } from "../src/logic/cumplimiento.js";
import type { FilaHistorialSimulacro } from "../src/types.js";

function fila(overrides: Partial<FilaHistorialSimulacro> = {}): FilaHistorialSimulacro {
  return {
    sitioId: "sitio1",
    sitioNombre: "Planta de Refinación Principal",
    tipoEventoId: "tipoIncendio",
    tipoEventoNombre: "Incendio",
    fechaHora: "2026-06-01T10:00:00.000Z",
    estado: "programado",
    ...overrides,
  };
}

test("calcularCumplimiento: último realizado -> alDia true", () => {
  const historial = [
    fila({ estado: "realizado", fechaHora: "2026-05-01T10:00:00.000Z" }),
    fila({ estado: "programado", fechaHora: "2026-08-01T10:00:00.000Z" }),
  ];
  const [resultado] = calcularCumplimiento(historial);
  assert.equal(resultado.alDia, true);
  assert.deepEqual(resultado.ultimoResuelto, { fechaHora: "2026-05-01T10:00:00.000Z", estado: "realizado" });
  assert.equal(resultado.proximoProgramado, "2026-08-01T10:00:00.000Z");
});

test("calcularCumplimiento: último no_realizado -> alDia false", () => {
  const historial = [fila({ estado: "no_realizado", fechaHora: "2026-05-01T10:00:00.000Z" })];
  const [resultado] = calcularCumplimiento(historial);
  assert.equal(resultado.alDia, false);
  assert.equal(resultado.ultimoResuelto?.estado, "no_realizado");
});

test("calcularCumplimiento: sin historial resuelto (solo programado) -> alDia false, ultimoResuelto null", () => {
  const historial = [fila({ estado: "programado", fechaHora: "2026-08-01T10:00:00.000Z" })];
  const [resultado] = calcularCumplimiento(historial);
  assert.equal(resultado.alDia, false);
  assert.equal(resultado.ultimoResuelto, null);
  assert.equal(resultado.proximoProgramado, "2026-08-01T10:00:00.000Z");
});

test("calcularCumplimiento: usa el resuelto MÁS RECIENTE, no el primero de la lista", () => {
  const historial = [
    fila({ estado: "no_realizado", fechaHora: "2026-01-01T10:00:00.000Z" }),
    fila({ estado: "realizado", fechaHora: "2026-06-01T10:00:00.000Z" }), // el más reciente
    fila({ estado: "realizado", fechaHora: "2026-03-01T10:00:00.000Z" }),
  ];
  const [resultado] = calcularCumplimiento(historial);
  assert.equal(resultado.ultimoResuelto?.fechaHora, "2026-06-01T10:00:00.000Z");
  assert.equal(resultado.alDia, true);
});

test("calcularCumplimiento: sin próximo programado -> proximoProgramado null", () => {
  const historial = [fila({ estado: "realizado", fechaHora: "2026-05-01T10:00:00.000Z" })];
  const [resultado] = calcularCumplimiento(historial);
  assert.equal(resultado.proximoProgramado, null);
});

test("calcularCumplimiento: agrupa por (sitio, tipo) — no mezcla Incendio con Tóxico del mismo sitio", () => {
  const historial = [
    fila({ tipoEventoId: "tipoIncendio", tipoEventoNombre: "Incendio", estado: "realizado" }),
    fila({ tipoEventoId: "tipoToxico", tipoEventoNombre: "Tóxico", estado: "no_realizado" }),
  ];
  const resultado = calcularCumplimiento(historial);
  assert.equal(resultado.length, 2);
  const incendio = resultado.find((r) => r.tipoEventoId === "tipoIncendio");
  const toxico = resultado.find((r) => r.tipoEventoId === "tipoToxico");
  assert.equal(incendio?.alDia, true);
  assert.equal(toxico?.alDia, false);
});

test("calcularCumplimiento: agrupa por (sitio, tipo) — no mezcla dos sitios distintos con el mismo tipo", () => {
  const historial = [
    fila({ sitioId: "sitioA", sitioNombre: "Sitio A", estado: "realizado" }),
    fila({ sitioId: "sitioB", sitioNombre: "Sitio B", estado: "no_realizado" }),
  ];
  const resultado = calcularCumplimiento(historial);
  assert.equal(resultado.length, 2);
  const a = resultado.find((r) => r.sitioId === "sitioA");
  const b = resultado.find((r) => r.sitioId === "sitioB");
  assert.equal(a?.alDia, true);
  assert.equal(b?.alDia, false);
});

test("calcularCumplimiento: sin historial devuelve lista vacía", () => {
  assert.deepEqual(calcularCumplimiento([]), []);
});
