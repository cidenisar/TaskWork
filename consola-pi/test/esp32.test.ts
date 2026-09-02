import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { crearClienteEsp32, parsearLineaEsp32 } from "../src/lib/esp32.js";

test("parsearLineaEsp32: botón válido", () => {
  assert.deepEqual(parsearLineaEsp32('{"evt":"boton","tecla":"INCENDIO"}'), { tipo: "boton", tecla: "INCENDIO" });
});

test("parsearLineaEsp32: botón no reconocido se ignora (null)", () => {
  assert.equal(parsearLineaEsp32('{"evt":"boton","tecla":"NOEXISTE"}'), null);
});

test("parsearLineaEsp32: llave", () => {
  assert.deepEqual(parsearLineaEsp32('{"evt":"llave","estado":"habilitado"}'), { tipo: "llave", estado: "habilitado" });
});

test("parsearLineaEsp32: heartbeat", () => {
  assert.deepEqual(parsearLineaEsp32('{"evt":"heartbeat","ok":true}'), { tipo: "heartbeat", ok: true });
});

test("parsearLineaEsp32: línea corrupta (JSON inválido) no rompe, devuelve null", () => {
  assert.equal(parsearLineaEsp32('{"evt":"boton"'), null); // línea partida a mitad de un reset del ESP32
});

test("parsearLineaEsp32: JSON válido pero sin forma reconocida devuelve null", () => {
  assert.equal(parsearLineaEsp32('{"algo":"random"}'), null);
  assert.equal(parsearLineaEsp32("42"), null);
  assert.equal(parsearLineaEsp32("null"), null);
});

test("crearClienteEsp32: recibe eventos línea por línea desde el transporte (framing real, sin puerto serie)", async () => {
  const transporte = new PassThrough();
  const cliente = crearClienteEsp32(transporte);
  const recibidos: unknown[] = [];
  cliente.onEvento((e) => recibidos.push(e));

  transporte.write('{"evt":"boton","tecla":"OK"}\n{"evt":"llave","estado":"bloqueado"}\n');
  // readline consume el stream de forma asíncrona (flowing mode) — darle
  // una vuelta al loop de eventos antes de verificar.
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(recibidos, [
    { tipo: "boton", tecla: "OK" },
    { tipo: "llave", estado: "bloqueado" },
  ]);
});

test("crearClienteEsp32: fijarLampara/fijarRele escriben el comando esperado al transporte", async () => {
  const transporte = new PassThrough();
  const cliente = crearClienteEsp32(transporte);
  let escrito = "";
  transporte.on("data", (chunk: Buffer) => (escrito += chunk.toString()));

  cliente.fijarLampara("TOXICO", true);
  cliente.fijarRele(false);
  await new Promise((resolve) => setImmediate(resolve));

  const lineas = escrito.trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lineas, [
    { cmd: "lampara", boton: "TOXICO", estado: "fijo" },
    { cmd: "rele", estado: "off" },
  ]);
});
