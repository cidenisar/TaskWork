import { test } from "node:test";
import assert from "node:assert/strict";
import { construirRegistroAuditoria, PayloadAuthInconsistente } from "../src/logic/auth.js";
import type { PayloadAuthMqtt } from "../src/types.js";

test("construirRegistroAuditoria mapea un PIN válido correctamente", () => {
  const payload: PayloadAuthMqtt = { operadorId: "op1", legajo: "7734", resultado: "valido", ts: 1000 };
  const registro = construirRegistroAuditoria(payload, "consola1");
  assert.deepEqual(registro, { operador_id: "op1", consola_id: "consola1", resultado: "valido" });
});

test("construirRegistroAuditoria mapea un PIN inválido con operadorId null", () => {
  const payload: PayloadAuthMqtt = { operadorId: null, legajo: null, resultado: "invalido", ts: 1000 };
  const registro = construirRegistroAuditoria(payload, "consola1");
  assert.deepEqual(registro, { operador_id: null, consola_id: "consola1", resultado: "invalido" });
});

test("construirRegistroAuditoria rechaza un payload inconsistente (válido sin operador)", () => {
  const payload: PayloadAuthMqtt = { operadorId: null, legajo: null, resultado: "valido", ts: 1000 };
  assert.throws(() => construirRegistroAuditoria(payload, "consola1"), PayloadAuthInconsistente);
});
