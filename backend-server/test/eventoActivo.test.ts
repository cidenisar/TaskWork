import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverConsolasParaEventoActivo } from "../src/logic/eventoActivo.js";

test("resolverConsolasParaEventoActivo incluye las del propio sitio y las de sitios vecinos, con la relación correcta", () => {
  const consolasPorSitio = new Map<string, string[]>([
    ["planta-principal", ["bomberos", "comite-crisis"]],
    ["predio-despacho", ["porteria"]],
    ["planta-glp", ["sala-control"]],
  ]);

  const destinos = resolverConsolasParaEventoActivo("planta-principal", ["predio-despacho"], consolasPorSitio);

  assert.deepEqual(destinos, [
    { consolaId: "bomberos", sitioId: "planta-principal", relacion: "mismo-sitio" },
    { consolaId: "comite-crisis", sitioId: "planta-principal", relacion: "mismo-sitio" },
    { consolaId: "porteria", sitioId: "predio-despacho", relacion: "sitio-vecino" },
  ]);
  // planta-glp no es vecino en este caso — no debería aparecer.
  assert.ok(!destinos.some((d) => d.consolaId === "sala-control"));
});

test("resolverConsolasParaEventoActivo sin vecinos solo devuelve el propio sitio", () => {
  const consolasPorSitio = new Map<string, string[]>([["s1", ["c1", "c2"]]]);
  const destinos = resolverConsolasParaEventoActivo("s1", [], consolasPorSitio);
  assert.equal(destinos.length, 2);
  assert.ok(destinos.every((d) => d.relacion === "mismo-sitio"));
});

test("resolverConsolasParaEventoActivo con un sitio sin consolas configuradas no rompe", () => {
  const destinos = resolverConsolasParaEventoActivo("sitio-nuevo", [], new Map());
  assert.deepEqual(destinos, []);
});
