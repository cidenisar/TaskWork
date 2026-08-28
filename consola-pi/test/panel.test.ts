import { test } from "node:test";
import assert from "node:assert/strict";
import { reducirPanel, type EstadoPanel, type OperadorIdentificado } from "../src/logic/panel.js";

const OPERADOR: OperadorIdentificado = { operadorId: "op1", legajo: "1001", rol: "operador" };

test("invariante 5: un botón presionado sin llave habilitada no hace nada", () => {
  const bloqueado: EstadoPanel = { fase: "bloqueado" };
  const r = reducirPanel(bloqueado, { tipo: "boton_presionado", boton: "INCENDIO" });
  assert.deepEqual(r.estado, bloqueado);
  assert.deepEqual(r.efectos, []);
});

test("invariante 5: un PIN válido sin llave habilitada tampoco hace nada", () => {
  const bloqueado: EstadoPanel = { fase: "bloqueado" };
  const r = reducirPanel(bloqueado, { tipo: "pin_valido", operador: OPERADOR });
  assert.deepEqual(r.estado, bloqueado);
});

test("girar la llave pasa de bloqueado a pidiendo_pin, sin efectos", () => {
  const r = reducirPanel({ fase: "bloqueado" }, { tipo: "llave_habilitada" });
  assert.deepEqual(r.estado, { fase: "pidiendo_pin" });
  assert.deepEqual(r.efectos, []);
});

test("PIN válido habilita el panel y publica la auditoría", () => {
  const r = reducirPanel({ fase: "pidiendo_pin" }, { tipo: "pin_valido", operador: OPERADOR });
  assert.deepEqual(r.estado, { fase: "habilitado", operador: OPERADOR });
  assert.deepEqual(r.efectos, [{ tipo: "publicar_auth", resultado: "valido", operador: OPERADOR }]);
});

test("PIN inválido se queda pidiendo PIN pero igual audita (con operador null)", () => {
  const r = reducirPanel({ fase: "pidiendo_pin" }, { tipo: "pin_invalido" });
  assert.deepEqual(r.estado, { fase: "pidiendo_pin" });
  assert.deepEqual(r.efectos, [{ tipo: "publicar_auth", resultado: "invalido", operador: null }]);
});

test("un botón de alarma habilitado inicia la cuenta regresiva, no publica todavía", () => {
  const habilitado: EstadoPanel = { fase: "habilitado", operador: OPERADOR };
  const r = reducirPanel(habilitado, { tipo: "boton_presionado", boton: "TOXICO" });
  assert.deepEqual(r.estado, { fase: "confirmando", operador: OPERADOR, boton: "TOXICO" });
  assert.deepEqual(r.efectos, [{ tipo: "iniciar_cuenta_regresiva" }]);
});

test("OK también pasa por la cuenta regresiva — es un botón de alarma más (evento real)", () => {
  const habilitado: EstadoPanel = { fase: "habilitado", operador: OPERADOR };
  const r = reducirPanel(habilitado, { tipo: "boton_presionado", boton: "OK" });
  assert.equal(r.estado.fase, "confirmando");
});

test("CANCELAR presionado en habilitado (nada pendiente) no hace nada", () => {
  const habilitado: EstadoPanel = { fase: "habilitado", operador: OPERADOR };
  const r = reducirPanel(habilitado, { tipo: "boton_presionado", boton: "CANCELAR" });
  assert.deepEqual(r.estado, habilitado);
  assert.deepEqual(r.efectos, []);
});

test("invariante 3: CANCELAR durante la cuenta regresiva es 100% local — ningún efecto publica nada", () => {
  const confirmando: EstadoPanel = { fase: "confirmando", operador: OPERADOR, boton: "INCENDIO" };
  const r = reducirPanel(confirmando, { tipo: "boton_presionado", boton: "CANCELAR" });
  assert.deepEqual(r.estado, { fase: "habilitado", operador: OPERADOR });
  assert.deepEqual(r.efectos, [{ tipo: "cancelar_cuenta_regresiva" }]);
  // ningún efecto de la lista es publicar_evento ni publicar_auth
  assert.ok(!r.efectos.some((e) => e.tipo === "publicar_evento" || e.tipo === "publicar_auth"));
});

test("invariante 1: recién cuando la cuenta regresiva termina se publica el evento", () => {
  const confirmando: EstadoPanel = { fase: "confirmando", operador: OPERADOR, boton: "SISMO" };
  const r = reducirPanel(confirmando, { tipo: "cuenta_regresiva_terminada" });
  assert.deepEqual(r.estado, { fase: "enviado", operador: OPERADOR, boton: "SISMO" });
  assert.deepEqual(r.efectos, [{ tipo: "publicar_evento", boton: "SISMO", operador: OPERADOR }]);
});

test("volver_a_reposo después de enviado vuelve a habilitado con el mismo operador", () => {
  const enviado: EstadoPanel = { fase: "enviado", operador: OPERADOR, boton: "MEDICO" };
  const r = reducirPanel(enviado, { tipo: "volver_a_reposo" });
  assert.deepEqual(r.estado, { fase: "habilitado", operador: OPERADOR });
});

test("girar la llave a bloqueado corta cualquier fase, incluida una cuenta regresiva en curso", () => {
  const confirmando: EstadoPanel = { fase: "confirmando", operador: OPERADOR, boton: "PROG1" };
  const r = reducirPanel(confirmando, { tipo: "llave_bloqueada" });
  assert.deepEqual(r.estado, { fase: "bloqueado" });
  assert.deepEqual(r.efectos, [{ tipo: "cancelar_cuenta_regresiva" }]);
});

test("girar la llave a bloqueado desde habilitado (sin nada pendiente) no genera efectos", () => {
  const habilitado: EstadoPanel = { fase: "habilitado", operador: OPERADOR };
  const r = reducirPanel(habilitado, { tipo: "llave_bloqueada" });
  assert.deepEqual(r.estado, { fase: "bloqueado" });
  assert.deepEqual(r.efectos, []);
});
