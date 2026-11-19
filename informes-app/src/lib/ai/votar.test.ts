import test from "node:test";
import assert from "node:assert/strict";
import { votar } from "./votar";

const vota = (valores: unknown[]) => {
  const dudosos: string[] = [];
  return { valor: votar(valores, "campo", dudosos), dudosos };
};

test("votar: dos IAs que no vieron nada NO le ganan a la que sí leyó el N° de serie", () => {
  const r = vota(["9S1930A66853", "CN18430000", "", ""]); // Claude lee bien, otra lee distinto, dos en blanco
  assert.equal(r.valor, "9S1930A66853"); // antes: "" (los dos vacíos 'coincidían')
  assert.deepEqual(r.dudosos, ["campo"]); // sin dos que coincidan: queda para revisar
});

test("votar: una sola IA leyó algo y las demás vacío → se toma, marcada para revisar", () => {
  const r = vota(["", "ABC123", ""]);
  assert.equal(r.valor, "ABC123");
  assert.deepEqual(r.dudosos, ["campo"]);
});

test("votar: dos que coinciden con contenido ganan, aunque haya vacíos y una distinta", () => {
  const r = vota(["569277", "559277", "569277", ""]);
  assert.equal(r.valor, "569277");
  assert.deepEqual(r.dudosos, []);
});

test("votar: coinciden aunque cambien mayúsculas y espacios", () => {
  assert.equal(vota(["ab 12", "AB  12"]).valor, "ab 12");
});

test("votar: si todas lo dejaron vacío, el campo queda vacío y no es dudoso", () => {
  const r = vota(["", "", null]);
  assert.equal(r.valor, "");
  assert.deepEqual(r.dudosos, []);
});

test("votar: un solo proveedor (Claude solo) devuelve lo suyo sin marcar nada", () => {
  const r = vota(["XYZ"]);
  assert.equal(r.valor, "XYZ");
  assert.deepEqual(r.dudosos, []);
});

test("votar: false y 0 son valores reales, no vacíos", () => {
  assert.equal(vota([false, false, true]).valor, false);
  assert.equal(vota([0, 0, 5]).valor, 0);
});

test("votar: dentro de una lista de equipos, el serie vacío de dos IAs no pisa al que lo leyó", () => {
  const dudosos: string[] = [];
  const r = votar(
    [
      { equipos: [{ texto: "UPS", numeroSerie: "9S1925A50344" }] },
      { equipos: [{ texto: "UPS", numeroSerie: "SRV240RLBP-9A" }] },
      { equipos: [{ texto: "UPS", numeroSerie: "" }] },
      { equipos: [{ texto: "UPS", numeroSerie: "" }] },
    ],
    "",
    dudosos,
  ) as { equipos: { texto: string; numeroSerie: string }[] };
  assert.equal(r.equipos[0].numeroSerie, "9S1925A50344");
  assert.deepEqual(dudosos, ["equipos[0].numeroSerie"]);
});
