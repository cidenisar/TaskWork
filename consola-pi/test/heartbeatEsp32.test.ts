import { test } from "node:test";
import assert from "node:assert/strict";
import { heartbeatEsp32Vencido } from "../src/logic/heartbeatEsp32.js";

test("heartbeatEsp32Vencido: null (nunca llegó ninguno) siempre está vencido", () => {
  assert.equal(heartbeatEsp32Vencido(null, Date.now(), 6_000), true);
});

test("heartbeatEsp32Vencido: dentro del umbral no está vencido", () => {
  const ahora = 100_000;
  assert.equal(heartbeatEsp32Vencido(ahora - 3_000, ahora, 6_000), false);
});

test("heartbeatEsp32Vencido: pasado el umbral sí está vencido", () => {
  const ahora = 100_000;
  assert.equal(heartbeatEsp32Vencido(ahora - 6_001, ahora, 6_000), true);
});

test("heartbeatEsp32Vencido: exactamente en el límite todavía no está vencido (estricto >)", () => {
  const ahora = 100_000;
  assert.equal(heartbeatEsp32Vencido(ahora - 6_000, ahora, 6_000), false);
});
