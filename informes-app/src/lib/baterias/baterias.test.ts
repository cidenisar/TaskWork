import { test } from "node:test";
import assert from "node:assert/strict";
import { DATOS_BATERIA_VACIOS, datosBateriaAColumnas, resumenBateria, rolBateria, totalBaterias } from "./types";
import { parseDatosBateriaIa } from "./ia";

test("rolBateria reconoce banco, UPS y rectificador (fuente en equipos sueltos)", () => {
  assert.equal(rolBateria("banco_baterias"), "banco");
  assert.equal(rolBateria("ups"), "ups");
  assert.equal(rolBateria("rectificador"), "rectificador");
  assert.equal(rolBateria("fuente"), "rectificador");
  assert.equal(rolBateria("switch"), null);
});

test("datosBateriaAColumnas descarta lo que no corresponde a la categoría", () => {
  const datos = { ...DATOS_BATERIA_VACIOS, bateriaCantidad: 24, bateriaDestino: "rectificador" as const, potenciaNominal: "10 kVA", upsBaterias: "internas" as const };
  // Un switch no lleva nada de esto.
  assert.deepEqual(Object.values(datosBateriaAColumnas("switch", datos)).filter((v) => v !== null), []);
  // Un banco conserva cantidad y destino, pero no potencia ni modo de UPS.
  const banco = datosBateriaAColumnas("banco_baterias", datos);
  assert.equal(banco.bateria_cantidad, 24);
  assert.equal(banco.bateria_destino, "rectificador");
  assert.equal(banco.potencia_nominal, null);
  assert.equal(banco.ups_baterias, null);
  // Una UPS conserva potencia y modo, pero no el destino.
  const ups = datosBateriaAColumnas("ups", datos);
  assert.equal(ups.potencia_nominal, "10 kVA");
  assert.equal(ups.ups_baterias, "internas");
  assert.equal(ups.bateria_destino, null);
});

test("el vínculo se guarda completo o no se guarda", () => {
  const sinId = datosBateriaAColumnas("banco_baterias", { ...DATOS_BATERIA_VACIOS, alimentadoPorTipo: "equipo_individual", alimentadoPorId: null });
  assert.equal(sinId.alimentado_por_tipo, null);
  assert.equal(sinId.alimentado_por_id, null);
  const completo = datosBateriaAColumnas("banco_baterias", { ...DATOS_BATERIA_VACIOS, alimentadoPorTipo: "rack_equipamiento", alimentadoPorId: "abc" });
  assert.equal(completo.alimentado_por_tipo, "rack_equipamiento");
  assert.equal(completo.alimentado_por_id, "abc");
});

test("una cantidad sin origen se toma como cargada a mano; sin cantidad no hay origen", () => {
  assert.equal(datosBateriaAColumnas("banco_baterias", { ...DATOS_BATERIA_VACIOS, bateriaCantidad: 4 }).bateria_origen, "manual");
  assert.equal(datosBateriaAColumnas("banco_baterias", { ...DATOS_BATERIA_VACIOS, bateriaOrigen: "contadas" }).bateria_origen, null);
  assert.equal(datosBateriaAColumnas("banco_baterias", { ...DATOS_BATERIA_VACIOS, bateriaCantidad: 0 }).bateria_cantidad, null);
  assert.equal(datosBateriaAColumnas("banco_baterias", { ...DATOS_BATERIA_VACIOS, bateriaCantidad: 3.6 }).bateria_cantidad, 4);
});

test("totalBaterias multiplica por las unidades y es null si no se sabe", () => {
  assert.equal(totalBaterias(2, 4), 8);
  assert.equal(totalBaterias(0, 4), 4);
  assert.equal(totalBaterias(3, null), null);
});

test("parseDatosBateriaIa: una cantidad sin origen se toma como estimación por modelo", () => {
  const d = parseDatosBateriaIa({ bateriaCantidad: 2, upsBaterias: "internas", potenciaNominal: " 1500 VA " }, "ups");
  assert.equal(d.bateriaCantidad, 2);
  assert.equal(d.bateriaOrigen, "por_modelo");
  assert.equal(d.upsBaterias, "internas");
  assert.equal(d.potenciaNominal, "1500 VA");
});

test("parseDatosBateriaIa: banco contado, y valores inválidos se ignoran", () => {
  const d = parseDatosBateriaIa({ bateriaDestino: "rectificador", bateriaCantidad: 24, bateriaOrigen: "contadas", bateriaTipo: "12 V 150 Ah" }, "banco_baterias");
  assert.equal(d.bateriaDestino, "rectificador");
  assert.equal(d.bateriaCantidad, 24);
  assert.equal(d.bateriaOrigen, "contadas");
  const malo = parseDatosBateriaIa({ bateriaDestino: "generador", bateriaCantidad: "muchas", upsBaterias: "x" }, "banco_baterias");
  assert.equal(malo.bateriaDestino, null);
  assert.equal(malo.bateriaCantidad, null);
});

test("parseDatosBateriaIa: otras categorías y respuestas raras quedan vacías", () => {
  assert.deepEqual(parseDatosBateriaIa({ bateriaCantidad: 5 }, "camara_cctv"), DATOS_BATERIA_VACIOS);
  assert.deepEqual(parseDatosBateriaIa(null, "ups"), DATOS_BATERIA_VACIOS);
});

test("resumenBateria arma un texto corto", () => {
  const texto = resumenBateria("banco_baterias", 1, { ...DATOS_BATERIA_VACIOS, bateriaDestino: "ups", bateriaCantidad: 16, bateriaTipo: "12 V 9 Ah" });
  assert.equal(texto, "banco de UPS · 16 baterías de 12 V 9 Ah");
  assert.equal(resumenBateria("switch", 1, DATOS_BATERIA_VACIOS), "");
});
