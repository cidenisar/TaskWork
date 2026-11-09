// Pruebas de aceptación — portadas 1 a 1 desde
// docs/guardia-general/codigo-motor/motor-guardia.test.mjs, con los totales
// adaptados de "medias" a centésimas (50 = 0,5 · 100 = 1,0). Calendario de
// septiembre 2026: 12 sáb, 13 dom, 14 lun, 15 mar, 16 mié, 17 jue, 18 vie,
// 19 sáb, 20 dom, 21 lun.
import test from "node:test";
import assert from "node:assert/strict";
import { calcularEvento, liquidar, centesimasDelDia, type Participacion } from "./motor";

const ev = (persona: string, inicio: string, fin: string): Participacion => ({ persona, inicio, fin });
const total = (r: ReturnType<typeof liquidar>, persona: string) => r[persona]?.totalCentesimas ?? 0;

test("día hábil: arranca en jornada = dedicación funcional, aunque se extienda hasta las 20:00", () => {
  const r = liquidar([ev("ana", "2026-09-15T15:00", "2026-09-15T20:00")]);
  assert.equal(r.ana.eventos[0].tipo, "dedicacion_funcional");
  assert.equal(total(r, "ana"), 0);
});

test("día hábil: martes 16:00 a 18:00 es dedicación funcional", () => {
  const r = liquidar([ev("ana", "2026-09-15T16:00", "2026-09-15T18:00")]);
  assert.equal(total(r, "ana"), 0);
});

test("límites: 16:59 es dedicación funcional, 17:00 es activación", () => {
  assert.equal(calcularEvento("2026-09-15T16:59", "2026-09-15T17:30").tipo, "dedicacion_funcional");
  assert.equal(calcularEvento("2026-09-15T17:00", "2026-09-15T17:30").tipo, "activacion");
});

test("día hábil: llamado a las 7:45 y a las 7:30 es dedicación funcional", () => {
  assert.equal(calcularEvento("2026-09-15T07:45", "2026-09-15T09:00").tipo, "dedicacion_funcional");
  assert.equal(calcularEvento("2026-09-15T07:30", "2026-09-15T09:00").tipo, "dedicacion_funcional");
});

test("día hábil: llamado a las 7:15 es activación y cuenta solo hasta las 7:30", () => {
  const r = calcularEvento("2026-09-15T07:15", "2026-09-15T10:00");
  assert.equal(r.tipo, "activacion");
  assert.deepEqual(r.minutosPorDia, { "2026-09-15": 15 });
});

test("límites de la mañana: 7:29 es activación, 7:30 es dedicación funcional", () => {
  assert.equal(calcularEvento("2026-09-15T07:29", "2026-09-15T08:00").tipo, "activacion");
  assert.equal(calcularEvento("2026-09-15T07:30", "2026-09-15T08:00").tipo, "dedicacion_funcional");
});

test("día hábil: martes 19:30 a 22:00 son 2:30 = media activación", () => {
  const r = liquidar([ev("ana", "2026-09-15T19:30", "2026-09-15T22:00")]);
  assert.deepEqual(r.ana.porDia["2026-09-15"], { minutos: 150, centesimas: 50 });
  assert.equal(total(r, "ana"), 50);
});

test("fin de semana: sábado 10:00 a 12:00 = media activación", () => {
  const r = liquidar([ev("ana", "2026-09-19T10:00", "2026-09-19T12:00")]);
  assert.equal(total(r, "ana"), 50);
});

test("madrugada en día hábil: 5:00 a 10:00 cuenta solo hasta las 7:30", () => {
  const r = liquidar([ev("ana", "2026-09-15T05:00", "2026-09-15T10:00")]);
  assert.deepEqual(r.ana.porDia["2026-09-15"], { minutos: 150, centesimas: 50 });
});

test("madrugada: 6:59 a 9:00 cuenta 31 minutos", () => {
  const r = calcularEvento("2026-09-15T06:59", "2026-09-15T09:00");
  assert.equal(r.tipo, "activacion");
  assert.deepEqual(r.minutosPorDia, { "2026-09-15": 31 });
});

test("cruza medianoche entre días hábiles: martes 22:00 a miércoles 10:00 = 1,5 activaciones", () => {
  const r = liquidar([ev("ana", "2026-09-15T22:00", "2026-09-16T10:00")]);
  assert.deepEqual(r.ana.porDia["2026-09-15"], { minutos: 120, centesimas: 50 });
  assert.deepEqual(r.ana.porDia["2026-09-16"], { minutos: 450, centesimas: 100 });
  assert.equal(total(r, "ana"), 150); // 1,5
});

test("cruza medianoche: se parte en dos, 23:00 a 03:00 entre días hábiles = dos medias", () => {
  const r = liquidar([ev("ana", "2026-09-15T23:00", "2026-09-16T03:00")]);
  assert.deepEqual(r.ana.porDia["2026-09-15"], { minutos: 60, centesimas: 50 });
  assert.deepEqual(r.ana.porDia["2026-09-16"], { minutos: 180, centesimas: 50 });
  assert.equal(total(r, "ana"), 100); // 1,0
});

test("cruza a sábado: viernes 23:00 a sábado 03:00 = dos medias", () => {
  const r = liquidar([ev("ana", "2026-09-18T23:00", "2026-09-19T03:00")]);
  assert.equal(total(r, "ana"), 100);
});

test("domingo 22:00 a lunes 10:00: domingo 2 hs, lunes solo 0 a 7:30", () => {
  const r = liquidar([ev("ana", "2026-09-20T22:00", "2026-09-21T10:00")]);
  assert.deepEqual(r.ana.porDia["2026-09-20"], { minutos: 120, centesimas: 50 });
  assert.deepEqual(r.ana.porDia["2026-09-21"], { minutos: 450, centesimas: 100 });
});

test("feriado marcado: un miércoles feriado 10:00 a 11:00 es activación", () => {
  const feriados = new Set(["2026-09-16"]);
  const r = liquidar([ev("ana", "2026-09-16T10:00", "2026-09-16T11:00")], feriados);
  assert.equal(r.ana.eventos[0].tipo, "activacion");
  assert.equal(total(r, "ana"), 50);
});

test("sin feriado marcado, el mismo evento es dedicación funcional", () => {
  const r = liquidar([ev("ana", "2026-09-16T10:00", "2026-09-16T11:00")]);
  assert.equal(total(r, "ana"), 0);
});

test("el corte de 4:30 es sobre la suma del día, no por evento", () => {
  const r = liquidar([
    ev("ana", "2026-09-19T08:00", "2026-09-19T10:00"), // 120
    ev("ana", "2026-09-19T12:00", "2026-09-19T13:30"), //  90
    ev("ana", "2026-09-19T20:00", "2026-09-19T21:30"), //  90 -> suma 300
  ]);
  assert.deepEqual(r.ana.porDia["2026-09-19"], { minutos: 300, centesimas: 100 });
});

test("4:30 exacto es media; 4:31 es entera", () => {
  assert.equal(centesimasDelDia(270), 50);
  assert.equal(centesimasDelDia(271), 100);
  assert.equal(centesimasDelDia(0), 0);
});

test("9 hs un día y 6 hs al otro = 2 activaciones enteras", () => {
  const r = liquidar([
    ev("ana", "2026-09-19T08:00", "2026-09-19T17:00"), // 9 hs
    ev("ana", "2026-09-20T08:00", "2026-09-20T14:00"), // 6 hs
  ]);
  assert.equal(total(r, "ana"), 200); // 2,0
});

test("cada persona se calcula por separado", () => {
  const r = liquidar([
    ev("ana", "2026-09-19T08:00", "2026-09-19T09:00"),
    ev("beto", "2026-09-19T08:00", "2026-09-19T14:00"),
  ]);
  assert.equal(total(r, "ana"), 50);
  assert.equal(total(r, "beto"), 100);
});

test("parámetros: si el corte cambia, cambia el resultado sin tocar el código", () => {
  const p = { entradaMin: 450, salidaActivacionMin: 1020, madrugadaHastaMin: 450, topeMediaMin: 180, valorMedia: 50, valorEntera: 100 };
  const r = liquidar([ev("ana", "2026-09-19T08:00", "2026-09-19T12:00")], new Set(), p); // 4 hs > 3 hs
  assert.equal(total(r, "ana"), 100);
});

test("errores: fin anterior al inicio y fecha mal escrita", () => {
  assert.throws(() => calcularEvento("2026-09-19T10:00", "2026-09-19T09:00"));
  assert.throws(() => calcularEvento("19/09/2026 10:00", "2026-09-19T11:00"));
});

// Caso de aceptación A (HANDOFF §13): 19 participaciones, 9 eventos,
// septiembre 2026. Total 7,5 activaciones — A 3,0 · B 2,0 · C 0,5 · D 1,5 · E 0,5.
test("caso de aceptación A: 7,5 activaciones en total, por persona A 3,0 · B 2,0 · C 0,5 · D 1,5 · E 0,5", () => {
  const participaciones: Participacion[] = [
    ev("A", "2026-09-12T08:00", "2026-09-12T10:00"),
    ev("E", "2026-09-12T08:10", "2026-09-12T09:50"),
    ev("A", "2026-09-12T12:00", "2026-09-12T13:30"),
    ev("D", "2026-09-12T12:10", "2026-09-12T13:30"),
    ev("A", "2026-09-12T20:00", "2026-09-12T21:30"),
    ev("B", "2026-09-12T20:12", "2026-09-12T21:30"),
    ev("A", "2026-09-13T10:00", "2026-09-13T12:00"),
    ev("D", "2026-09-13T10:15", "2026-09-13T12:00"),
    ev("A", "2026-09-14T07:45", "2026-09-14T08:05"),
    ev("E", "2026-09-14T07:50", "2026-09-14T09:00"),
    ev("A", "2026-09-15T19:30", "2026-09-15T22:00"),
    ev("B", "2026-09-15T19:42", "2026-09-15T22:00"),
    ev("C", "2026-09-15T20:10", "2026-09-15T22:00"),
    ev("A", "2026-09-16T05:00", "2026-09-16T05:30"),
    ev("D", "2026-09-16T05:10", "2026-09-16T10:00"),
    ev("A", "2026-09-17T15:00", "2026-09-17T15:10"),
    ev("D", "2026-09-17T15:00", "2026-09-17T20:00"),
    ev("A", "2026-09-18T23:00", "2026-09-18T23:30"),
    ev("B", "2026-09-18T23:10", "2026-09-19T03:00"),
  ];
  const r = liquidar(participaciones);
  assert.equal(total(r, "A"), 300);
  assert.equal(total(r, "B"), 200);
  assert.equal(total(r, "C"), 50);
  assert.equal(total(r, "D"), 150);
  assert.equal(total(r, "E"), 50);
  const totalGeneral = Object.values(r).reduce((acc, f) => acc + f.totalCentesimas, 0);
  assert.equal(totalGeneral, 750); // 7,5 activaciones
});
