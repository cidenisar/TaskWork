import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearLatitud, parsearLongitud, formatearCoordenada, enlaceMapa } from "./coordenadas";

test("acepta coma o punto decimal y espacios", () => {
  assert.equal(parsearLatitud("-33,0123"), -33.0123);
  assert.equal(parsearLatitud(" -33.0123 "), -33.0123);
  assert.equal(parsearLongitud("-68.85"), -68.85);
});

test("vacío, texto o fuera de rango dan null", () => {
  assert.equal(parsearLatitud(""), null);
  assert.equal(parsearLatitud("   "), null);
  assert.equal(parsearLatitud("abc"), null);
  assert.equal(parsearLatitud("91"), null);
  assert.equal(parsearLatitud("-90.5"), null);
  assert.equal(parsearLongitud("181"), null);
  assert.equal(parsearLongitud("-180"), -180);
});

test("0 es una coordenada válida (no se confunde con vacío)", () => {
  assert.equal(parsearLatitud("0"), 0);
});

test("formatea con 6 decimales y arma el enlace", () => {
  assert.equal(formatearCoordenada(-33.01234567), "-33.012346");
  assert.equal(enlaceMapa(-33.1, -68.2), "https://www.google.com/maps?q=-33.1,-68.2");
});
