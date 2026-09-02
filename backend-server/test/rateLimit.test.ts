import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { permitirIntento } from "../src/lib/rateLimit.js";

// Cada test usa una clave única (randomUUID) para no compartir estado
// con los demás — el limitador vive en un Map a nivel de módulo, igual
// que en producción (un solo proceso).

test("permitirIntento permite hasta maxIntentos dentro de la ventana", () => {
  const clave = randomUUID();
  const ahora = 1_000_000;
  assert.equal(permitirIntento(clave, 3, 60_000, ahora), true);
  assert.equal(permitirIntento(clave, 3, 60_000, ahora + 10), true);
  assert.equal(permitirIntento(clave, 3, 60_000, ahora + 20), true);
});

test("permitirIntento rechaza el intento que se pasa del máximo", () => {
  const clave = randomUUID();
  const ahora = 1_000_000;
  assert.equal(permitirIntento(clave, 2, 60_000, ahora), true);
  assert.equal(permitirIntento(clave, 2, 60_000, ahora + 10), true);
  assert.equal(permitirIntento(clave, 2, 60_000, ahora + 20), false);
  assert.equal(permitirIntento(clave, 2, 60_000, ahora + 30), false);
});

test("permitirIntento resetea la cuenta una vez pasada la ventana", () => {
  const clave = randomUUID();
  const ahora = 1_000_000;
  assert.equal(permitirIntento(clave, 1, 1_000, ahora), true);
  assert.equal(permitirIntento(clave, 1, 1_000, ahora + 500), false); // todavía dentro de la ventana
  assert.equal(permitirIntento(clave, 1, 1_000, ahora + 1_000), true); // la ventana ya pasó, arranca de nuevo
});

test("permitirIntento no confunde claves distintas", () => {
  const claveA = randomUUID();
  const claveB = randomUUID();
  const ahora = 1_000_000;
  assert.equal(permitirIntento(claveA, 1, 60_000, ahora), true);
  assert.equal(permitirIntento(claveA, 1, 60_000, ahora + 10), false); // A ya se gastó su cupo
  assert.equal(permitirIntento(claveB, 1, 60_000, ahora + 10), true); // B es independiente
});
