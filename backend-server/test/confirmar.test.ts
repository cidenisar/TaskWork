import { test } from "node:test";
import assert from "node:assert/strict";
import { validarConfirmacion } from "../src/logic/confirmar.js";

function bodyValido(overrides: Record<string, unknown> = {}) {
  return {
    personaId: "p1",
    eventoId: "evt1",
    estado: "ok",
    ...overrides,
  };
}

test("validarConfirmacion acepta un body mínimo válido con estado ok", () => {
  const resultado = validarConfirmacion(bodyValido());
  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.deepEqual(resultado.payload, {
      personaId: "p1",
      eventoId: "evt1",
      estado: "ok",
      puntoId: null,
      notaAyuda: null,
      ubicacionLat: null,
      ubicacionLng: null,
    });
  }
});

test("validarConfirmacion acepta estado ayuda con punto, nota y ubicación", () => {
  const resultado = validarConfirmacion(
    bodyValido({
      estado: "ayuda",
      puntoId: "pt1",
      notaAyuda: "Atrapado en pasillo B",
      ubicacionLat: -38.95,
      ubicacionLng: -68.06,
    })
  );
  assert.equal(resultado.ok, true);
  if (resultado.ok) {
    assert.equal(resultado.payload.estado, "ayuda");
    assert.equal(resultado.payload.puntoId, "pt1");
    assert.equal(resultado.payload.notaAyuda, "Atrapado en pasillo B");
    assert.equal(resultado.payload.ubicacionLat, -38.95);
    assert.equal(resultado.payload.ubicacionLng, -68.06);
  }
});

test("validarConfirmacion rechaza body que no es un objeto", () => {
  assert.equal(validarConfirmacion(null).ok, false);
  assert.equal(validarConfirmacion("texto").ok, false);
  assert.equal(validarConfirmacion(42).ok, false);
});

test("validarConfirmacion rechaza personaId faltante o vacío", () => {
  assert.equal(validarConfirmacion(bodyValido({ personaId: undefined })).ok, false);
  assert.equal(validarConfirmacion(bodyValido({ personaId: "" })).ok, false);
});

test("validarConfirmacion rechaza eventoId faltante o vacío", () => {
  assert.equal(validarConfirmacion(bodyValido({ eventoId: undefined })).ok, false);
  assert.equal(validarConfirmacion(bodyValido({ eventoId: "" })).ok, false);
});

test('validarConfirmacion rechaza estado que no sea "ok" ni "ayuda"', () => {
  assert.equal(validarConfirmacion(bodyValido({ estado: "pendiente" })).ok, false);
  assert.equal(validarConfirmacion(bodyValido({ estado: "OK" })).ok, false);
  assert.equal(validarConfirmacion(bodyValido({ estado: undefined })).ok, false);
});

test("validarConfirmacion rechaza tipos incorrectos en los campos opcionales", () => {
  assert.equal(validarConfirmacion(bodyValido({ puntoId: 123 })).ok, false);
  assert.equal(validarConfirmacion(bodyValido({ notaAyuda: 123 })).ok, false);
  assert.equal(validarConfirmacion(bodyValido({ ubicacionLat: "no-es-numero" })).ok, false);
  assert.equal(validarConfirmacion(bodyValido({ ubicacionLng: "no-es-numero" })).ok, false);
});
