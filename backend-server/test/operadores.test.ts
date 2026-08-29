import { test } from "node:test";
import assert from "node:assert/strict";
import { validarCrearOperador, generarPin } from "../src/logic/operadores.js";

function bodyValido(overrides: Record<string, unknown> = {}) {
  return {
    nombre: "R. Gimenez",
    legajo: "8842",
    rol: "operador",
    alcanceTipo: "sitio",
    sitiosIds: ["sitio1"],
    ...overrides,
  };
}

test("validarCrearOperador acepta un body mínimo válido (alcance sitio)", () => {
  const resultado = validarCrearOperador(bodyValido());
  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.deepEqual(resultado.payload, {
      nombre: "R. Gimenez",
      legajo: "8842",
      rol: "operador",
      alcanceTipo: "sitio",
      sitiosIds: ["sitio1"],
      email: null,
    });
  }
});

test("validarCrearOperador acepta alcance organizacion sin sitiosIds", () => {
  const resultado = validarCrearOperador(bodyValido({ alcanceTipo: "organizacion", sitiosIds: undefined }));
  assert.equal(resultado.ok, true);
  if (resultado.ok) assert.deepEqual(resultado.payload.sitiosIds, []);
});

test("validarCrearOperador rechaza nombre vacío o faltante", () => {
  assert.equal(validarCrearOperador(bodyValido({ nombre: "" })).ok, false);
  assert.equal(validarCrearOperador(bodyValido({ nombre: "   " })).ok, false);
  assert.equal(validarCrearOperador(bodyValido({ nombre: undefined })).ok, false);
});

test("validarCrearOperador recorta espacios del nombre", () => {
  const resultado = validarCrearOperador(bodyValido({ nombre: "  R. Gimenez  " }));
  assert.equal(resultado.ok, true);
  if (resultado.ok) assert.equal(resultado.payload.nombre, "R. Gimenez");
});

test("validarCrearOperador rechaza rol inválido", () => {
  const resultado = validarCrearOperador(bodyValido({ rol: "superadmin" }));
  assert.equal(resultado.ok, false);
});

test("validarCrearOperador rechaza alcanceTipo inválido", () => {
  const resultado = validarCrearOperador(bodyValido({ alcanceTipo: "planeta" }));
  assert.equal(resultado.ok, false);
});

test('validarCrearOperador rechaza alcance "sitio" sin sitiosIds', () => {
  assert.equal(validarCrearOperador(bodyValido({ sitiosIds: undefined })).ok, false);
  assert.equal(validarCrearOperador(bodyValido({ sitiosIds: [] })).ok, false);
});

test('validarCrearOperador rechaza sitiosIds no vacío con alcance "organizacion"', () => {
  const resultado = validarCrearOperador(bodyValido({ alcanceTipo: "organizacion", sitiosIds: ["sitio1"] }));
  assert.equal(resultado.ok, false);
});

test("validarCrearOperador acepta un email con forma válida", () => {
  const resultado = validarCrearOperador(bodyValido({ email: "admin@refineria.com" }));
  assert.equal(resultado.ok, true);
  if (resultado.ok) assert.equal(resultado.payload.email, "admin@refineria.com");
});

test("validarCrearOperador rechaza un email con forma inválida", () => {
  const resultado = validarCrearOperador(bodyValido({ email: "no-es-un-email" }));
  assert.equal(resultado.ok, false);
});

test("validarCrearOperador acepta email null u omitido (no se invita)", () => {
  assert.equal(validarCrearOperador(bodyValido({ email: null })).ok, true);
  assert.equal(validarCrearOperador(bodyValido({ email: undefined })).ok, true);
});

test("validarCrearOperador rechaza legajo que no sea string ni null", () => {
  const resultado = validarCrearOperador(bodyValido({ legajo: 8842 }));
  assert.equal(resultado.ok, false);
});

test("generarPin siempre da 4 dígitos, con ceros a la izquierda si hace falta", () => {
  assert.equal(generarPin(() => 7), "0007");
  assert.equal(generarPin(() => 42), "0042");
  assert.equal(generarPin(() => 9999), "9999");
  assert.equal(generarPin(() => 0), "0000");
});

test("generarPin nunca da más de 4 dígitos aunque el azar entregue algo más grande", () => {
  // no debería pasar con randomInt(10000) real, pero generarPin no
  // debe confiar ciegamente en el rango de lo que le pasan
  assert.equal(generarPin(() => 123456).length, 4);
});
