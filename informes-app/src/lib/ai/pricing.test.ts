import test from "node:test";
import assert from "node:assert/strict";
import { calcularCostoUsd } from "./pricing";

test("calcularCostoUsd: id exacto", () => {
  assert.equal(calcularCostoUsd("claude-opus-5-5", 1_000_000, 1_000_000), 24);
});

test("calcularCostoUsd: el id con fecha que devuelve la API usa el precio de su familia (antes salía $0)", () => {
  assert.equal(calcularCostoUsd("claude-haiku-4-5-20251001", 1_000_000, 1_000_000), 6);
});

test("calcularCostoUsd: las IAs gratuitas y los modelos desconocidos cuestan $0", () => {
  assert.equal(calcularCostoUsd("groq:qwen/qwen3.8-27b", 5000, 500), 0);
  assert.equal(calcularCostoUsd("modelo-que-no-existe", 5000, 500), 0);
});
