import test from "node:test";
import assert from "node:assert/strict";
import { aplanar, compararLectura, normalizarValor, porcentaje } from "./comparar";

test("normalizarValor: ignora mayúsculas, espacios de más y centavos de punto flotante", () => {
  assert.equal(normalizarValor("  YPF   Ruta 7 "), "ypf ruta 7");
  assert.equal(normalizarValor(1234.5000001), normalizarValor(1234.5));
  assert.notEqual(normalizarValor(292820), normalizarValor(238220));
});

test("aplanar: objetos anidados y listas, con la cantidad de cada lista", () => {
  const m = aplanar({ fecha: "2026-11-03", gastos: [{ monto: 5 }, { monto: 7 }] });
  assert.equal(m.get("fecha"), "2026-11-03");
  assert.equal(m.get("gastos[cantidad]"), 2);
  assert.equal(m.get("gastos[1].monto"), 7);
});

test("compararLectura: con Claude presente, mide a las gratis contra Claude", () => {
  const claude = { fecha: "2026-11-03", monto: 292820, comercio: "YPF" };
  const groq = { fecha: "2026-03-11", monto: 292820, comercio: "ypf" }; // fecha dada vuelta
  const cf = { fecha: "2026-11-03", monto: 238220, comercio: "YPF" }; // dígitos del monto mezclados
  const r = compararLectura({ claude, groq, cloudflare: cf }, claude);
  assert.equal(r.referencia, "claude");
  assert.deepEqual(r.porIa.groq, { comparados: 3, coinciden: 2 });
  assert.deepEqual(r.porIa.cloudflare, { comparados: 3, coinciden: 2 });
  assert.equal("claude" in r.porIa, false);
  const fecha = r.campos.find((c) => c.ruta === "fecha")!;
  assert.equal(fecha.coinciden.groq, false);
  assert.equal(fecha.coinciden.cloudflare, true);
});

test("compararLectura: sin Claude usa el resultado votado como referencia", () => {
  const votado = { monto: 100 };
  const r = compararLectura({ groq: { monto: 100 }, openrouter: { monto: 90 } }, votado);
  assert.equal(r.referencia, "resultado");
  assert.deepEqual(r.porIa.groq, { comparados: 1, coinciden: 1 });
  assert.deepEqual(r.porIa.openrouter, { comparados: 1, coinciden: 0 });
});

test("compararLectura: un gasto inventado de más o salteado cuenta como diferencia", () => {
  const ref = { gastos: [{ monto: 1 }, { monto: 2 }] };
  const demas = { gastos: [{ monto: 1 }, { monto: 2 }, { monto: 3 }] };
  const r = compararLectura({ claude: ref, groq: demas }, ref);
  // 4 campos: la cantidad (2 vs 3) y gastos[2].monto (no está en la referencia) fallan; los dos montos que sí están coinciden
  assert.deepEqual(r.porIa.groq, { comparados: 4, coinciden: 2 });
});

test("porcentaje: redondea y devuelve null si no hay nada para comparar", () => {
  assert.equal(porcentaje(2, 3), 67);
  assert.equal(porcentaje(0, 0), null);
});
