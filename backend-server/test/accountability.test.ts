import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularAccountability, ordenarPedidosDeAyuda } from "../src/logic/accountability.js";
import type { Confirmacion, PuntoEncuentro } from "../src/types.js";

function confirmacion(overrides: Partial<Confirmacion> = {}): Confirmacion {
  return {
    id: "c1",
    evento_id: "evt1",
    persona_id: "p1",
    estado: "pendiente",
    punto_id: null,
    canal: "push",
    ...overrides,
  };
}

test("calcularAccountability cuenta correctamente ok/ayuda/pendiente y por punto", () => {
  const puntos: PuntoEncuentro[] = [
    { id: "pt1", sitio_id: "s1", nombre: "Punto A", activo: true },
    { id: "pt2", sitio_id: "s1", nombre: "Punto B", activo: true },
  ];
  const confirmaciones: Confirmacion[] = [
    confirmacion({ id: "1", estado: "ok", punto_id: "pt1" }),
    confirmacion({ id: "2", estado: "ok", punto_id: "pt1" }),
    confirmacion({ id: "3", estado: "ayuda", punto_id: "pt2" }),
    confirmacion({ id: "4", estado: "pendiente", punto_id: null }),
    // de otro evento — no debe contarse
    confirmacion({ id: "5", evento_id: "evt-otro", estado: "ok", punto_id: "pt1" }),
  ];

  const resumen = calcularAccountability("evt1", confirmaciones, puntos);

  assert.equal(resumen.notificados, 4);
  assert.equal(resumen.ok, 2);
  assert.equal(resumen.ayuda, 1);
  assert.equal(resumen.pendiente, 1);

  const puntoA = resumen.porPunto.find((p) => p.puntoId === "pt1")!;
  assert.equal(puntoA.ok, 2);
  assert.equal(puntoA.ayuda, 0);

  const puntoB = resumen.porPunto.find((p) => p.puntoId === "pt2")!;
  assert.equal(puntoB.ayuda, 1);
});

test("calcularAccountability con cero confirmaciones no rompe (evento recién abierto)", () => {
  const resumen = calcularAccountability("evt1", [], []);
  assert.equal(resumen.notificados, 0);
  assert.equal(resumen.ok, 0);
  assert.equal(resumen.ayuda, 0);
  assert.equal(resumen.pendiente, 0);
  assert.deepEqual(resumen.porPunto, []);
});

test("ordenarPedidosDeAyuda: más reciente primero, sin hora al final", () => {
  const pedidos = [
    { id: "a", confirmadoAt: "2026-01-01T10:00:00Z" },
    { id: "b", confirmadoAt: "2026-01-01T10:05:00Z" },
    { id: "c", confirmadoAt: null },
    { id: "d", confirmadoAt: "2026-01-01T10:03:00Z" },
  ];
  const ordenados = ordenarPedidosDeAyuda(pedidos);
  assert.deepEqual(
    ordenados.map((p) => p.id),
    ["b", "d", "a", "c"]
  );
});
