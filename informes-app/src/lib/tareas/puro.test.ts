import test from "node:test";
import assert from "node:assert/strict";
import {
  armarArbol,
  coincideConRuta,
  diasDesde,
  lineasDeTareas,
  normalizarTarea,
  planSincronizacion,
  resumenPorLocalidad,
  SIN_LOCALIDAD,
  type TareaExistente,
  type TareaParaArbol,
} from "./puro";

test("lineasDeTareas: una tarea por línea, sin viñetas, vacías ni repetidas", () => {
  const texto = "- Cambiar batería\n\n  * Ajustar cámara  \n1. Etiquetar circuitos\n2) Revisar puesta a tierra\ncambiar BATERÍA\n";
  assert.deepEqual(lineasDeTareas(texto), ["Cambiar batería", "Ajustar cámara", "Etiquetar circuitos", "Revisar puesta a tierra"]);
});

test("lineasDeTareas: no se come números ni signos que son parte del texto", () => {
  assert.deepEqual(lineasDeTareas("10.5 kV a revisar\n-5 dB en el enlace\n3 cámaras sin conectar"), [
    "10.5 kV a revisar",
    "-5 dB en el enlace",
    "3 cámaras sin conectar",
  ]);
});

test("lineasDeTareas: vacío o null no da tareas", () => {
  assert.deepEqual(lineasDeTareas(null), []);
  assert.deepEqual(lineasDeTareas("  \n \n"), []);
});

test("normalizarTarea: ignora mayúsculas y espacios de más", () => {
  assert.equal(normalizarTarea("  Cambiar   BATERÍA "), normalizarTarea("cambiar batería"));
});

const e = (id: string, texto: string, estado: TareaExistente["estado"], ubicacionId = "u1"): TareaExistente => ({ id, texto, estado, ubicacionId });

test("planSincronizacion: informe nuevo → todas las líneas se crean", () => {
  assert.deepEqual(planSincronizacion(["a", "b"], [], "u1"), { insertar: ["a", "b"], borrarIds: [], moverIds: [] });
});

test("planSincronizacion: una línea que se sacó del informe borra la tarea si sigue abierta", () => {
  const plan = planSincronizacion(["a"], [e("1", "a", "abierta"), e("2", "b", "abierta")], "u1");
  assert.deepEqual(plan, { insertar: [], borrarIds: ["2"], moverIds: [] });
});

test("planSincronizacion: lo ya cerrado no se borra, no se mueve y no se vuelve a crear", () => {
  const existentes = [e("1", "a", "resuelta"), e("2", "b", "descartada", "otra")];
  // "a" sigue en el texto y "b" se sacó: ninguna de las dos cosas toca las tareas cerradas.
  assert.deepEqual(planSincronizacion(["a"], existentes, "u1"), { insertar: [], borrarIds: [], moverIds: [] });
});

test("planSincronizacion: si el informe cambia de ubicación, las abiertas que siguen se mudan", () => {
  const plan = planSincronizacion(["a", "b"], [e("1", "a", "abierta", "vieja"), e("2", "b", "resuelta", "vieja")], "nueva");
  assert.deepEqual(plan, { insertar: [], borrarIds: [], moverIds: ["1"] });
});

test("planSincronizacion: reescribir una línea = borrar la vieja (abierta) y crear la nueva", () => {
  const plan = planSincronizacion(["Cambiar batería del UPS"], [e("1", "Cambiar batería", "abierta")], "u1");
  assert.deepEqual(plan, { insertar: ["Cambiar batería del UPS"], borrarIds: ["1"], moverIds: [] });
});

const AHORA = new Date("2026-11-17T12:00:00Z");
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000).toISOString();
const t = (over: Partial<TareaParaArbol>): TareaParaArbol => ({
  estado: "abierta",
  created_at: hace(1),
  region: "NOA",
  provincia: "Mendoza",
  localidad: "Malargüe",
  sitio: "Planta A",
  ...over,
});

test("diasDesde: días enteros y nunca negativo", () => {
  assert.equal(diasDesde(hace(10), AHORA), 10);
  assert.equal(diasDesde(new Date(AHORA.getTime() + 86_400_000).toISOString(), AHORA), 0);
});

test("armarArbol: cuenta las abiertas en cada nivel y deja afuera las cerradas", () => {
  const arbol = armarArbol(
    [
      t({}),
      t({}),
      t({ sitio: "Planta B" }),
      t({ localidad: "San Rafael", sitio: "Planta C" }),
      t({ region: "SUR", provincia: "Neuquén", localidad: "Neuquén", sitio: "Base" }),
      t({ estado: "resuelta" }),
      t({ estado: "descartada" }),
    ],
    AHORA,
  );
  assert.equal(arbol.length, 2);
  const noa = arbol[0];
  assert.equal(noa.nombre, "NOA");
  assert.equal(noa.abiertas, 4);
  const mendoza = noa.hijos[0];
  assert.equal(mendoza.abiertas, 4);
  const malargue = mendoza.hijos.find((n) => n.nombre === "Malargüe")!;
  assert.equal(malargue.abiertas, 3);
  assert.equal(malargue.hijos.find((n) => n.nombre === "Planta A")!.abiertas, 2);
  assert.deepEqual(malargue.hijos[0].ruta, { region: "NOA", provincia: "Mendoza", localidad: "Malargüe", sitio: "Planta A" });
  assert.equal(arbol[1].nombre, "SUR");
});

test("armarArbol: marca las viejas y agrupa las ubicaciones sin localidad", () => {
  const arbol = armarArbol([t({ created_at: hace(45), localidad: null }), t({ created_at: hace(5), localidad: null })], AHORA);
  const loc = arbol[0].hijos[0].hijos[0];
  assert.equal(loc.nombre, SIN_LOCALIDAD);
  assert.equal(loc.abiertas, 2);
  assert.equal(loc.viejas, 1);
});

test("armarArbol: ordena por cantidad de abiertas, de mayor a menor", () => {
  const arbol = armarArbol([t({ region: "SUR" }), t({ region: "NEA" }), t({ region: "NEA" })], AHORA);
  assert.deepEqual(arbol.map((n) => n.nombre), ["NEA", "SUR"]);
});

test("coincideConRuta: ruta vacía incluye todo; cada nivel filtra; sin localidad se elige por su nombre", () => {
  const tarea = t({ localidad: null });
  assert.equal(coincideConRuta(tarea, {}), true);
  assert.equal(coincideConRuta(tarea, { region: "NOA", provincia: "Mendoza" }), true);
  assert.equal(coincideConRuta(tarea, { provincia: "Salta" }), false);
  assert.equal(coincideConRuta(tarea, { localidad: SIN_LOCALIDAD }), true);
  assert.equal(coincideConRuta(t({}), { localidad: SIN_LOCALIDAD }), false);
});

test("resumenPorLocalidad: cuenta solo abiertas, sitios distintos, viejas y la más antigua", () => {
  const r = (over: Partial<TareaParaArbol>, ubicacionId: string) => ({ ...t(over), ubicacionId });
  const filas = resumenPorLocalidad(
    [
      r({ created_at: hace(2) }, "u1"),
      r({ created_at: hace(45) }, "u1"),
      r({ created_at: hace(5), sitio: "Planta B" }, "u2"),
      r({ estado: "resuelta", created_at: hace(90) }, "u1"), // cerrada: no cuenta
      r({ localidad: null, provincia: "Salta", region: "NOA", created_at: hace(3) }, "u3"),
    ],
    AHORA,
  );
  assert.equal(filas.length, 2);
  assert.deepEqual(filas[0], { region: "NOA", provincia: "Mendoza", localidad: "Malargüe", sitios: 2, abiertas: 3, viejas: 1, masAntiguaDias: 45 });
  assert.equal(filas[1].localidad, SIN_LOCALIDAD);
  assert.equal(filas[1].abiertas, 1);
});
