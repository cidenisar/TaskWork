import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularAccountability,
  armarAccountabilityDesdeContadores,
  ordenarPedidosDeAyuda,
} from "../src/logic/accountability.js";
import type { Confirmacion, ContadorAccountability, PuntoEncuentro } from "../src/types.js";

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

// Reduce confirmaciones a lo que produciría el trigger de Postgres
// (accountability_contadores) — no es código de producción, solo simula
// acá el agregado que en la base hace trg_confirmaciones_accountability,
// para poder comparar armarAccountabilityDesdeContadores contra
// calcularAccountability con el mismo fixture (ver logic/accountability.ts).
function contadoresDesdeConfirmaciones(eventoId: string, confirmaciones: Confirmacion[]): ContadorAccountability[] {
  const porBucket = new Map<string | null, ContadorAccountability>();
  for (const c of confirmaciones) {
    if (c.evento_id !== eventoId) continue;
    const existente = porBucket.get(c.punto_id) ?? { puntoId: c.punto_id, ok: 0, ayuda: 0, pendiente: 0 };
    existente[c.estado] += 1;
    porBucket.set(c.punto_id, existente);
  }
  return [...porBucket.values()];
}

test("armarAccountabilityDesdeContadores da lo mismo que calcularAccountability (mismo fixture)", () => {
  const puntos: PuntoEncuentro[] = [
    { id: "pt1", sitio_id: "s1", nombre: "Punto A", activo: true },
    { id: "pt2", sitio_id: "s1", nombre: "Punto B", activo: true },
  ];
  const confirmaciones: Confirmacion[] = [
    confirmacion({ id: "1", estado: "ok", punto_id: "pt1" }),
    confirmacion({ id: "2", estado: "ok", punto_id: "pt1" }),
    confirmacion({ id: "3", estado: "ayuda", punto_id: "pt2" }),
    confirmacion({ id: "4", estado: "pendiente", punto_id: null }),
    // de otro evento — no debe contarse en ninguno de los dos caminos
    confirmacion({ id: "5", evento_id: "evt-otro", estado: "ok", punto_id: "pt1" }),
  ];

  const desdeRecount = calcularAccountability("evt1", confirmaciones, puntos);
  const contadores = contadoresDesdeConfirmaciones("evt1", confirmaciones);
  const desdeContadores = armarAccountabilityDesdeContadores("evt1", contadores, puntos);

  // Orden de porPunto puede diferir (uno recorre puntos, el otro también,
  // así que en este caso ya coincide) — comparamos por campo en vez de
  // deepEqual crudo para no atarnos a un orden que no es parte del contrato.
  assert.equal(desdeContadores.notificados, desdeRecount.notificados);
  assert.equal(desdeContadores.ok, desdeRecount.ok);
  assert.equal(desdeContadores.ayuda, desdeRecount.ayuda);
  assert.equal(desdeContadores.pendiente, desdeRecount.pendiente);
  assert.deepEqual(
    [...desdeContadores.porPunto].sort((a, b) => a.puntoId.localeCompare(b.puntoId)),
    [...desdeRecount.porPunto].sort((a, b) => a.puntoId.localeCompare(b.puntoId))
  );
});

test("armarAccountabilityDesdeContadores: punto sin fila en contadores todavía cuenta 0, no rompe", () => {
  const puntos: PuntoEncuentro[] = [
    { id: "pt1", sitio_id: "s1", nombre: "Punto A", activo: true },
    { id: "pt2", sitio_id: "s1", nombre: "Punto B (nadie llegó todavía)", activo: true },
  ];
  const contadores: ContadorAccountability[] = [{ puntoId: "pt1", ok: 3, ayuda: 0, pendiente: 1 }];

  const resumen = armarAccountabilityDesdeContadores("evt1", contadores, puntos);

  assert.equal(resumen.notificados, 4);
  assert.equal(resumen.ok, 3);
  const puntoB = resumen.porPunto.find((p) => p.puntoId === "pt2")!;
  assert.deepEqual(puntoB, { puntoId: "pt2", nombre: "Punto B (nadie llegó todavía)", ok: 0, ayuda: 0, pendiente: 0 });
});

test("armarAccountabilityDesdeContadores: bucket puntoId null (sin punto asignado) suma al total pero no a ningún punto", () => {
  const puntos: PuntoEncuentro[] = [{ id: "pt1", sitio_id: "s1", nombre: "Punto A", activo: true }];
  const contadores: ContadorAccountability[] = [
    { puntoId: "pt1", ok: 1, ayuda: 0, pendiente: 0 },
    { puntoId: null, ok: 0, ayuda: 1, pendiente: 0 },
  ];

  const resumen = armarAccountabilityDesdeContadores("evt1", contadores, puntos);

  assert.equal(resumen.notificados, 2);
  assert.equal(resumen.ok, 1);
  assert.equal(resumen.ayuda, 1);
  assert.equal(resumen.porPunto.length, 1); // el bucket null no genera una entrada de "punto"
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
