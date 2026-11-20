// Pruebas de aceptación. Calendario de septiembre 2026:
// 12 sáb, 13 dom, 14 lun, 15 mar, 16 mié, 17 jue, 18 vie, 19 sáb, 20 dom, 21 lun.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularEvento, liquidar, mediasDelDia } from './motor-guardia.mjs';

const ev = (persona, inicio, fin) => ({ persona, inicio, fin });
const total = (r, persona) => r[persona]?.totalMedias ?? 0;

test('día hábil: arranca en jornada = dedicación funcional, aunque se extienda hasta las 20:00', () => {
  const r = liquidar([ev('ana', '2026-09-15T15:00', '2026-09-15T20:00')]);
  assert.equal(r.ana.eventos[0].tipo, 'dedicacion_funcional');
  assert.equal(total(r, 'ana'), 0);
});

test('día hábil: martes 16:00 a 18:00 es dedicación funcional', () => {
  const r = liquidar([ev('ana', '2026-09-15T16:00', '2026-09-15T18:00')]);
  assert.equal(total(r, 'ana'), 0);
});

test('límites: 16:59 es dedicación funcional, 17:00 es activación', () => {
  assert.equal(calcularEvento('2026-09-15T16:59', '2026-09-15T17:30').tipo, 'dedicacion_funcional');
  assert.equal(calcularEvento('2026-09-15T17:00', '2026-09-15T17:30').tipo, 'activacion');
});

test('día hábil: llamado a las 7:45 y a las 7:30 es dedicación funcional', () => {
  assert.equal(calcularEvento('2026-09-15T07:45', '2026-09-15T09:00').tipo, 'dedicacion_funcional');
  assert.equal(calcularEvento('2026-09-15T07:30', '2026-09-15T09:00').tipo, 'dedicacion_funcional');
});

test('día hábil: llamado a las 7:15 es activación y cuenta solo hasta las 7:30', () => {
  const r = calcularEvento('2026-09-15T07:15', '2026-09-15T10:00');
  assert.equal(r.tipo, 'activacion');
  assert.deepEqual(r.minutosPorDia, { '2026-09-15': 15 });
});

test('límites de la mañana: 7:29 es activación, 7:30 es dedicación funcional', () => {
  assert.equal(calcularEvento('2026-09-15T07:29', '2026-09-15T08:00').tipo, 'activacion');
  assert.equal(calcularEvento('2026-09-15T07:30', '2026-09-15T08:00').tipo, 'dedicacion_funcional');
});

test('día hábil: martes 19:30 a 22:00 son 2:30 = media activación', () => {
  const r = liquidar([ev('ana', '2026-09-15T19:30', '2026-09-15T22:00')]);
  assert.deepEqual(r.ana.porDia['2026-09-15'], { minutos: 150, medias: 1 });
  assert.equal(total(r, 'ana'), 1);
});

test('fin de semana: sábado 10:00 a 12:00 = media activación', () => {
  const r = liquidar([ev('ana', '2026-09-19T10:00', '2026-09-19T12:00')]);
  assert.equal(total(r, 'ana'), 1);
});

test('madrugada en día hábil: 5:00 a 10:00 cuenta solo hasta las 7:30', () => {
  const r = liquidar([ev('ana', '2026-09-15T05:00', '2026-09-15T10:00')]);
  assert.deepEqual(r.ana.porDia['2026-09-15'], { minutos: 150, medias: 1 });
});

test('madrugada: 6:59 a 9:00 cuenta 31 minutos', () => {
  const r = calcularEvento('2026-09-15T06:59', '2026-09-15T09:00');
  assert.equal(r.tipo, 'activacion');
  assert.deepEqual(r.minutosPorDia, { '2026-09-15': 31 });
});

test('cruza medianoche entre días hábiles: martes 22:00 a miércoles 10:00 = 1,5 activaciones', () => {
  const r = liquidar([ev('ana', '2026-09-15T22:00', '2026-09-16T10:00')]);
  assert.deepEqual(r.ana.porDia['2026-09-15'], { minutos: 120, medias: 1 });
  assert.deepEqual(r.ana.porDia['2026-09-16'], { minutos: 450, medias: 2 });
  assert.equal(total(r, 'ana'), 3); // 3 medias = 1,5
});

test('cruza medianoche: se parte en dos, 23:00 a 03:00 entre días hábiles = dos medias', () => {
  const r = liquidar([ev('ana', '2026-09-15T23:00', '2026-09-16T03:00')]);
  assert.deepEqual(r.ana.porDia['2026-09-15'], { minutos: 60, medias: 1 });
  assert.deepEqual(r.ana.porDia['2026-09-16'], { minutos: 180, medias: 1 });
  assert.equal(total(r, 'ana'), 2);
});

test('cruza a sábado: viernes 23:00 a sábado 03:00 = dos medias', () => {
  const r = liquidar([ev('ana', '2026-09-18T23:00', '2026-09-19T03:00')]);
  assert.equal(total(r, 'ana'), 2);
});

test('domingo 22:00 a lunes 10:00: domingo 2 hs, lunes solo 0 a 7:30', () => {
  const r = liquidar([ev('ana', '2026-09-20T22:00', '2026-09-21T10:00')]);
  assert.deepEqual(r.ana.porDia['2026-09-20'], { minutos: 120, medias: 1 });
  assert.deepEqual(r.ana.porDia['2026-09-21'], { minutos: 450, medias: 2 });
});

test('feriado marcado: un miércoles feriado 10:00 a 11:00 es activación', () => {
  const feriados = new Set(['2026-09-16']);
  const r = liquidar([ev('ana', '2026-09-16T10:00', '2026-09-16T11:00')], feriados);
  assert.equal(r.ana.eventos[0].tipo, 'activacion');
  assert.equal(total(r, 'ana'), 1);
});

test('sin feriado marcado, el mismo evento es dedicación funcional', () => {
  const r = liquidar([ev('ana', '2026-09-16T10:00', '2026-09-16T11:00')]);
  assert.equal(total(r, 'ana'), 0);
});

test('el corte de 4:30 es sobre la suma del día, no por evento', () => {
  const r = liquidar([
    ev('ana', '2026-09-19T08:00', '2026-09-19T10:00'), // 120
    ev('ana', '2026-09-19T12:00', '2026-09-19T13:30'), //  90
    ev('ana', '2026-09-19T20:00', '2026-09-19T21:30'), //  90 -> suma 300
  ]);
  assert.deepEqual(r.ana.porDia['2026-09-19'], { minutos: 300, medias: 2 });
});

test('4:30 exacto es media; 4:31 es entera', () => {
  assert.equal(mediasDelDia(270), 1);
  assert.equal(mediasDelDia(271), 2);
  assert.equal(mediasDelDia(0), 0);
});

test('9 hs un día y 6 hs al otro = 2 activaciones enteras', () => {
  const r = liquidar([
    ev('ana', '2026-09-19T08:00', '2026-09-19T17:00'), // 9 hs
    ev('ana', '2026-09-20T08:00', '2026-09-20T14:00'), // 6 hs
  ]);
  assert.equal(total(r, 'ana'), 4); // 4 medias = 2 activaciones
});

test('cada persona se calcula por separado', () => {
  const r = liquidar([
    ev('ana', '2026-09-19T08:00', '2026-09-19T09:00'),
    ev('beto', '2026-09-19T08:00', '2026-09-19T14:00'),
  ]);
  assert.equal(total(r, 'ana'), 1);
  assert.equal(total(r, 'beto'), 2);
});

test('parámetros: si el corte cambia, cambia el resultado sin tocar el código', () => {
  const p = { entradaMin: 450, salidaActivacionMin: 1020, madrugadaHastaMin: 450, topeMediaMin: 180, valorMedia: 1, valorEntera: 2 };
  const r = liquidar([ev('ana', '2026-09-19T08:00', '2026-09-19T12:00')], new Set(), p); // 4 hs > 3 hs
  assert.equal(total(r, 'ana'), 2);
});

test('errores: fin anterior al inicio y fecha mal escrita', () => {
  assert.throws(() => calcularEvento('2026-09-19T10:00', '2026-09-19T09:00'));
  assert.throws(() => calcularEvento('19/09/2026 10:00', '2026-09-19T11:00'));
});
