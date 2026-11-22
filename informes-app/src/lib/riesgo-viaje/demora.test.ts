import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularDemora, formatearDemora } from "./demora";

const t = (iso: string) => new Date(iso);
const base = { llegadaEstimadaAt: null, iniciadoAt: "2026-11-20T08:00:00Z", fechaHora: "2026-11-20T08:00:00Z" } as const;

test("un viaje sin iniciar o finalizado nunca está demorado", () => {
  assert.equal(calcularDemora({ ...base, estado: "pendiente" }, t("2026-11-25T00:00:00Z")).demorado, false);
  assert.equal(calcularDemora({ ...base, estado: "finalizado" }, t("2026-11-25T00:00:00Z")).demorado, false);
});

test("con hora estimada de llegada: dentro de la tolerancia no, pasada la tolerancia sí", () => {
  const v = { ...base, estado: "iniciado" as const, llegadaEstimadaAt: "2026-11-20T14:00:00Z" };
  assert.equal(calcularDemora(v, t("2026-11-20T14:20:00Z")).demorado, false);
  const tarde = calcularDemora(v, t("2026-11-20T16:00:00Z"));
  assert.equal(tarde.demorado, true);
  assert.equal(tarde.porLlegadaEstimada, true);
  assert.ok(Math.abs(tarde.horasDeDemora - 2) < 1e-9);
});

test("sin hora estimada: se marca pasadas 12 h desde que salió", () => {
  const v = { ...base, estado: "en_punto_medio" as const };
  assert.equal(calcularDemora(v, t("2026-11-20T19:00:00Z")).demorado, false);
  const r = calcularDemora(v, t("2026-11-21T04:00:00Z")); // 20 h en curso → 8 h pasadas del tope
  assert.equal(r.demorado, true);
  assert.equal(r.porLlegadaEstimada, false);
  assert.ok(Math.abs(r.horasDeDemora - 8) < 1e-9);
});

test("sin hora estimada ni salida registrada usa la fecha programada", () => {
  const r = calcularDemora({ estado: "iniciado", llegadaEstimadaAt: null, iniciadoAt: null, fechaHora: "2026-11-20T00:00:00Z" }, t("2026-11-20T13:00:00Z"));
  assert.equal(r.demorado, true);
});

test("formatea la demora", () => {
  assert.equal(formatearDemora(0.4), "menos de 1 h");
  assert.equal(formatearDemora(20.9), "20 h");
  assert.equal(formatearDemora(72), "3 días");
});
