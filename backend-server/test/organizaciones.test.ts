import { test } from "node:test";
import assert from "node:assert/strict";
import { validarResolverCodigoOrg } from "../src/logic/organizaciones.js";

test("validarResolverCodigoOrg acepta un código válido", () => {
  const r = validarResolverCodigoOrg({ codigo: "refimodelo" });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.payload, { codigo: "REFIMODELO" });
});

test("validarResolverCodigoOrg recorta espacios y pasa a mayúsculas", () => {
  const r = validarResolverCodigoOrg({ codigo: "  RefiModelo  " });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.payload, { codigo: "REFIMODELO" });
});

test("validarResolverCodigoOrg rechaza código faltante/vacío", () => {
  assert.equal(validarResolverCodigoOrg({}).ok, false);
  assert.equal(validarResolverCodigoOrg({ codigo: "" }).ok, false);
  assert.equal(validarResolverCodigoOrg({ codigo: "   " }).ok, false);
});

test("validarResolverCodigoOrg rechaza un body que no es objeto", () => {
  assert.equal(validarResolverCodigoOrg(null).ok, false);
  assert.equal(validarResolverCodigoOrg("REFIMODELO").ok, false);
});
