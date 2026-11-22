import test from "node:test";
import assert from "node:assert/strict";
import { armarResumenSemanal } from "./resumen-semanal";
import type { TareaPanel } from "./cargar";

const AHORA = new Date("2026-11-16T12:00:00Z");
const hace = (d: number) => new Date(AHORA.getTime() - d * 86_400_000).toISOString();
const t = (o: Partial<TareaPanel>): TareaPanel => ({
  id: Math.random().toString(),
  texto: "Cambiar batería",
  estado: "abierta",
  motivo_cierre: null,
  comentario_cierre: null,
  cerrada_at: null,
  cerradaPor: null,
  created_at: hace(1),
  informe: null,
  informeCierre: null,
  equipo: null,
  ubicacionId: "u1",
  region: "Cuyo",
  provincia: "Mendoza",
  localidad: "Malargüe",
  sitio: "Planta A",
  planta: null,
  oficina: null,
  ...o,
});

test("armarResumenSemanal: sin tareas abiertas no hay mail", () => {
  assert.equal(armarResumenSemanal([], AHORA), null);
  assert.equal(armarResumenSemanal([t({ estado: "resuelta", cerrada_at: hace(1) })], AHORA), null);
});

test("armarResumenSemanal: cuenta, agrupa por región/localidad y lista las más viejas primero", () => {
  const r = armarResumenSemanal(
    [t({ created_at: hace(40), texto: "Vieja" }), t({ texto: "Nueva" }), t({ region: "Patagonia", provincia: "Neuquén", localidad: "Plottier", ubicacionId: "u2", sitio: "Base" })],
    AHORA,
  )!;
  assert.match(r.asunto, /3 abiertas, 1 con más de 30 días/);
  assert.match(r.texto, /3 en 2 sitios/);
  assert.match(r.texto, /Cuyo: 2\n  - Malargüe \(Mendoza\): 2 — 1 con más de 30 días/);
  assert.match(r.texto, /Patagonia: 1/);
  assert.ok(r.texto.indexOf("Vieja") < r.texto.indexOf("Nueva"));
});
