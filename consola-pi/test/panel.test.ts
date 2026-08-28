import { test } from "node:test";
import assert from "node:assert/strict";
import { reducirPanel, type EstadoPanel, type OperadorIdentificado, LIMITE_INTENTOS_PIN } from "../src/logic/panel.js";

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
  assert.deepEqual(r.estado, { fase: "pidiendo_pin", intentosFallidos: 0 });
  assert.deepEqual(r.efectos, []);
});

test("PIN válido habilita el panel y publica la auditoría", () => {
  const r = reducirPanel({ fase: "pidiendo_pin", intentosFallidos: 0 }, { tipo: "pin_valido", operador: OPERADOR });
  assert.deepEqual(r.estado, { fase: "habilitado", operador: OPERADOR });
  assert.deepEqual(r.efectos, [{ tipo: "publicar_auth", resultado: "valido", operador: OPERADOR }]);
});

test("PIN inválido se queda pidiendo PIN, cuenta el intento y audita (con operador null)", () => {
  const r = reducirPanel({ fase: "pidiendo_pin", intentosFallidos: 0 }, { tipo: "pin_invalido" });
  assert.deepEqual(r.estado, { fase: "pidiendo_pin", intentosFallidos: 1 });
  assert.deepEqual(r.efectos, [{ tipo: "publicar_auth", resultado: "invalido", operador: null }]);
});

test("PIN válido después de algún intento fallido igual habilita (no acumula contra vos)", () => {
  const r = reducirPanel({ fase: "pidiendo_pin", intentosFallidos: 2 }, { tipo: "pin_valido", operador: OPERADOR });
  assert.deepEqual(r.estado, { fase: "habilitado", operador: OPERADOR });
});

test(`bloqueo temporal tras ${LIMITE_INTENTOS_PIN} PIN inválidos seguidos`, () => {
  let estado: EstadoPanel = { fase: "pidiendo_pin", intentosFallidos: 0 };
  for (let i = 0; i < LIMITE_INTENTOS_PIN - 1; i++) {
    const r = reducirPanel(estado, { tipo: "pin_invalido" });
    assert.equal(r.estado.fase, "pidiendo_pin");
    estado = r.estado;
  }
  const ultimo = reducirPanel(estado, { tipo: "pin_invalido" });
  assert.deepEqual(ultimo.estado, { fase: "pin_bloqueado" });
  // sigue auditando el intento que causó el bloqueo, además de bloquear
  assert.deepEqual(ultimo.efectos, [
    { tipo: "publicar_auth", resultado: "invalido", operador: null },
    { tipo: "iniciar_bloqueo_pin" },
  ]);
});

test("pin_bloqueado ignora PIN y botones — invariante 5 extendida al bloqueo temporal", () => {
  const bloqueado: EstadoPanel = { fase: "pin_bloqueado" };
  const r1 = reducirPanel(bloqueado, { tipo: "pin_valido", operador: OPERADOR });
  assert.deepEqual(r1.estado, bloqueado);
  assert.deepEqual(r1.efectos, []);
  const r2 = reducirPanel(bloqueado, { tipo: "boton_presionado", boton: "INCENDIO" });
  assert.deepEqual(r2.estado, bloqueado);
});

test("bloqueo_pin_terminado vuelve a pidiendo_pin con el contador en cero", () => {
  const r = reducirPanel({ fase: "pin_bloqueado" }, { tipo: "bloqueo_pin_terminado" });
  assert.deepEqual(r.estado, { fase: "pidiendo_pin", intentosFallidos: 0 });
  assert.deepEqual(r.efectos, []);
});

test("girar la llave a bloqueado durante pin_bloqueado cancela el bloqueo pendiente", () => {
  const r = reducirPanel({ fase: "pin_bloqueado" }, { tipo: "llave_bloqueada" });
  assert.deepEqual(r.estado, { fase: "bloqueado" });
  assert.deepEqual(r.efectos, [{ tipo: "cancelar_bloqueo_pin" }]);
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
