import { test } from "node:test";
import assert from "node:assert/strict";
import { validarReclamarPersona, validarAutoregistro, validarCanjearCodigo } from "../src/logic/personas.js";

// --- validarReclamarPersona ---

test("validarReclamarPersona acepta legajo+dni válidos", () => {
  const r = validarReclamarPersona({ legajo: "4521", dni: "30123456" });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.payload, { legajo: "4521", dni: "30123456" });
});

test("validarReclamarPersona recorta espacios", () => {
  const r = validarReclamarPersona({ legajo: "  4521  ", dni: " 30123456 " });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.payload, { legajo: "4521", dni: "30123456" });
});

test("validarReclamarPersona rechaza legajo o dni faltante/vacío", () => {
  assert.equal(validarReclamarPersona({ dni: "30123456" }).ok, false);
  assert.equal(validarReclamarPersona({ legajo: "4521" }).ok, false);
  assert.equal(validarReclamarPersona({ legajo: "", dni: "30123456" }).ok, false);
  assert.equal(validarReclamarPersona({ legajo: "4521", dni: "   " }).ok, false);
});

// --- validarAutoregistro ---

function autoregistroValido(overrides: Record<string, unknown> = {}) {
  return {
    nombre: "Juan Pérez",
    dni: "30123456",
    legajo: null,
    telefono: "11 5555 5555",
    sitioId: "sitio1",
    ...overrides,
  };
}

test("validarAutoregistro acepta un body mínimo válido sin legajo", () => {
  const r = validarAutoregistro(autoregistroValido());
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.payload, autoregistroValido());
});

test("validarAutoregistro acepta legajo cuando se manda", () => {
  const r = validarAutoregistro(autoregistroValido({ legajo: "9977" }));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.payload.legajo, "9977");
});

test("validarAutoregistro rechaza campos obligatorios faltantes", () => {
  assert.equal(validarAutoregistro(autoregistroValido({ nombre: "" })).ok, false);
  assert.equal(validarAutoregistro(autoregistroValido({ dni: undefined })).ok, false);
  assert.equal(validarAutoregistro(autoregistroValido({ telefono: "" })).ok, false);
  assert.equal(validarAutoregistro(autoregistroValido({ sitioId: "" })).ok, false);
});

test("validarAutoregistro rechaza legajo que no sea string ni null", () => {
  assert.equal(validarAutoregistro(autoregistroValido({ legajo: 4521 })).ok, false);
});

// --- validarCanjearCodigo ---

function codigoValido(overrides: Record<string, unknown> = {}) {
  return {
    codigo: "RF-7K2M-9X",
    nombre: "Contratista Eventual",
    telefono: "11 4444 4444",
    ...overrides,
  };
}

test("validarCanjearCodigo acepta un body mínimo válido sin dni", () => {
  const r = validarCanjearCodigo(codigoValido());
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.payload, { codigo: "RF-7K2M-9X", nombre: "Contratista Eventual", telefono: "11 4444 4444", dni: null });
});

test("validarCanjearCodigo normaliza el código a mayúsculas sin espacios", () => {
  const r = validarCanjearCodigo(codigoValido({ codigo: "  rf-7k2m-9x  " }));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.payload.codigo, "RF-7K2M-9X");
});

test("validarCanjearCodigo acepta dni cuando se manda", () => {
  const r = validarCanjearCodigo(codigoValido({ dni: "30123456" }));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.payload.dni, "30123456");
});

test("validarCanjearCodigo rechaza campos obligatorios faltantes", () => {
  assert.equal(validarCanjearCodigo(codigoValido({ codigo: "" })).ok, false);
  assert.equal(validarCanjearCodigo(codigoValido({ nombre: undefined })).ok, false);
  assert.equal(validarCanjearCodigo(codigoValido({ telefono: "" })).ok, false);
});

test("validarCanjearCodigo rechaza dni que no sea string ni null", () => {
  assert.equal(validarCanjearCodigo(codigoValido({ dni: 30123456 })).ok, false);
});
