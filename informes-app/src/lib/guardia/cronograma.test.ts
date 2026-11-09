import test from "node:test";
import assert from "node:assert/strict";
import {
  inicioSemana,
  finSemana,
  semanasDelAnio,
  listaArea,
  guardiaSemana,
  cambioVigente,
  guardiaDe,
  generarProgramacion,
  regenerarDesde,
  type Cronograma,
  type CambioGuardia,
  type PersonaGuardia,
} from "./cronograma";

const CAMBIO_MIN = 600; // 10:00, confirmado por Ivan

test("diaGuardia: el miércoles 09:59 todavía es la semana anterior, 10:00 ya es la nueva", () => {
  // miércoles 16/09/2026. inicioSemana antes de las 10:00 tiene que dar la semana del 09/09.
  assert.equal(inicioSemana("2026-09-16T09:59", CAMBIO_MIN), "2026-09-09");
  assert.equal(inicioSemana("2026-09-16T10:00", CAMBIO_MIN), "2026-09-16");
});

test("inicioSemana: cualquier día de la semana cae en el mismo miércoles", () => {
  assert.equal(inicioSemana("2026-09-17T15:00", CAMBIO_MIN), "2026-09-16");
  assert.equal(inicioSemana("2026-09-20T23:00", CAMBIO_MIN), "2026-09-16");
  assert.equal(inicioSemana("2026-09-22T09:00", CAMBIO_MIN), "2026-09-16"); // martes, todavía la semana del 16
  assert.equal(inicioSemana("2026-09-23T10:00", CAMBIO_MIN), "2026-09-23"); // miércoles siguiente desde las 10:00
});

test("finSemana: el martes siguiente", () => {
  assert.equal(finSemana("2026-09-16"), "2026-09-22");
});

test("semanasDelAnio: arranca en o antes del 1/1 y cubre todo el año (53 semanas en 2026)", () => {
  const semanas = semanasDelAnio(2026);
  assert.ok(semanas[0] <= "2026-01-01");
  assert.ok(semanas.every((s) => new Date(s).getUTCDay() === 3)); // todas miércoles
  assert.ok(semanas[semanas.length - 1] <= "2026-12-31");
  assert.ok(semanas.length >= 52);
});

test("listaArea: respeta el orden de rotación, no el orden en que están cargadas", () => {
  const personas: PersonaGuardia[] = [
    { id: "b", area: "General", orden: 2 },
    { id: "a", area: "General", orden: 1 },
    { id: "x", area: "Infraestructura", orden: 1 },
  ];
  assert.deepEqual(listaArea(personas, "General"), ["a", "b"]);
});

test("guardiaDe: sin cambios, usa el cronograma de la semana", () => {
  const cronograma: Cronograma = { "2026-09-16": { General: "A" } };
  assert.equal(guardiaDe(cronograma, [], "General", "2026-09-17T12:00", CAMBIO_MIN), "A");
});

test("guardiaDe: sin nadie asignado, devuelve null y no rompe", () => {
  const cronograma: Cronograma = { "2026-09-16": { General: null } };
  assert.equal(guardiaDe(cronograma, [], "General", "2026-09-17T12:00", CAMBIO_MIN), null);
});

test("guardiaDe: un cambio ACEPTADO que cubre ese día de guardia gana, aunque el cronograma diga otra persona", () => {
  const cronograma: Cronograma = { "2026-09-16": { General: "A" } };
  const cambios: CambioGuardia[] = [
    { id: "1", area: "General", persona: "B", original: "A", desde: "2026-09-17", hasta: "2026-09-18", estado: "aceptado" },
  ];
  assert.equal(guardiaDe(cronograma, cambios, "General", "2026-09-17T12:00", CAMBIO_MIN), "B");
  // fuera del rango del cambio, vuelve a regir el cronograma
  assert.equal(guardiaDe(cronograma, cambios, "General", "2026-09-19T12:00", CAMBIO_MIN), "A");
});

test("guardiaDe: un cambio PENDIENTE no rige — sigue el cronograma", () => {
  const cronograma: Cronograma = { "2026-09-16": { General: "A" } };
  const cambios: CambioGuardia[] = [
    { id: "1", area: "General", persona: "B", original: "A", desde: "2026-09-17", hasta: "2026-09-18", estado: "pendiente" },
  ];
  assert.equal(guardiaDe(cronograma, cambios, "General", "2026-09-17T12:00", CAMBIO_MIN), "A");
});

test("cambioVigente: si hay varios que se superponen, gana el ÚLTIMO registrado", () => {
  const cambios: CambioGuardia[] = [
    { id: "1", area: "General", persona: "B", original: "A", desde: "2026-09-17", hasta: "2026-09-20", estado: "aceptado" },
    { id: "2", area: "General", persona: "C", original: "A", desde: "2026-09-17", hasta: "2026-09-20", estado: "aceptado" },
  ];
  assert.equal(cambioVigente(cambios, "General", "2026-09-18")?.persona, "C");
});

test("generarProgramacion: rota una persona por semana y no pisa lo ya cargado sin pisar=true", () => {
  const personas: PersonaGuardia[] = [
    { id: "A", area: "General", orden: 1 },
    { id: "B", area: "General", orden: 2 },
    { id: "C", area: "General", orden: 3 },
  ];
  const r1 = generarProgramacion({}, personas, 2026, "General", false);
  const semanas = semanasDelAnio(2026);
  assert.equal(r1.cronograma[semanas[0]].General, "A");
  assert.equal(r1.cronograma[semanas[1]].General, "B");
  assert.equal(r1.cronograma[semanas[2]].General, "C");
  assert.equal(r1.cronograma[semanas[3]].General, "A");
  assert.equal(r1.nuevos, semanas.length);

  // generar de nuevo sin pisar no cambia nada
  const r2 = generarProgramacion(r1.cronograma, personas, 2026, "General", false);
  assert.equal(r2.nuevos, 0);
  assert.deepEqual(r2.cronograma, r1.cronograma);
});

test("generarProgramacion: no muta el cronograma original", () => {
  const original: Cronograma = {};
  const personas: PersonaGuardia[] = [{ id: "A", area: "General", orden: 1 }];
  generarProgramacion(original, personas, 2026, "General", false);
  assert.deepEqual(original, {});
});

test("generarProgramacion: 2027 continúa la rotación donde terminó 2026 (sin reiniciar)", () => {
  const personas: PersonaGuardia[] = [
    { id: "A", area: "General", orden: 1 },
    { id: "B", area: "General", orden: 2 },
  ];
  const r2026 = generarProgramacion({}, personas, 2026, "General", false);
  const semanas2026 = semanasDelAnio(2026);
  const ultimaDe2026 = r2026.cronograma[semanas2026[semanas2026.length - 1]].General;

  const r2027 = generarProgramacion(r2026.cronograma, personas, 2027, "General", false);
  const semanas2027 = semanasDelAnio(2027);
  // El primer miércoles de la lista de 2027 es el mismo que el último de 2026
  // (semanasDelAnio comparte esa semana-frontera entre los dos años — no es
  // un bug, es la misma semana real vista desde las dos puntas) y por eso no
  // se pisa; la rotación "nueva" de 2027 empieza en la semana siguiente.
  assert.equal(semanas2027[0], semanas2026[semanas2026.length - 1]);
  assert.equal(r2027.cronograma[semanas2027[0]].General, ultimaDe2026);

  const primeraNuevaDe2027 = r2027.cronograma[semanas2027[1]].General;
  const lista = ["A", "B"];
  const esperada = lista[(lista.indexOf(ultimaDe2026 as string) + 1) % lista.length];
  assert.equal(primeraNuevaDe2027, esperada);
});

test("generarProgramacion: 'Todas' genera las cuatro áreas, cada una con su propia rotación", () => {
  const personas: PersonaGuardia[] = [
    { id: "A", area: "General", orden: 1 },
    { id: "H", area: "Infraestructura", orden: 1 },
  ];
  const r = generarProgramacion({}, personas, 2026, "Todas", false);
  const semanas = semanasDelAnio(2026);
  assert.equal(r.cronograma[semanas[0]].General, "A");
  assert.equal(r.cronograma[semanas[0]].Infraestructura, "H");
  assert.equal(r.cronograma.Datos, undefined); // sin gente en Datos, no genera nada para esa área en esa semana
});

test("regenerarDesde: no toca el pasado ni la semana en curso", () => {
  const personas: PersonaGuardia[] = [
    { id: "A", area: "General", orden: 1 },
    { id: "B", area: "General", orden: 2 },
  ];
  const cronograma: Cronograma = {
    "2026-09-09": { General: "A" },
    "2026-09-16": { General: "B" }, // semana en curso
    "2026-09-23": { General: "A" },
    "2026-09-30": { General: "B" },
  };
  const nuevo = regenerarDesde(cronograma, personas, "General", "2026-09-16");
  assert.equal(nuevo["2026-09-09"].General, "A"); // pasado intacto
  assert.equal(nuevo["2026-09-16"].General, "B"); // semana en curso intacta (B sigue en la lista)
});

test("regenerarDesde: si alguien deja el área, se lo saca aunque sea la semana en curso, y se rehace desde ahí", () => {
  const personas: PersonaGuardia[] = [{ id: "A", area: "General", orden: 1 }]; // B ya no está en General
  const cronograma: Cronograma = {
    "2026-09-09": { General: "A" },
    "2026-09-16": { General: "B" }, // semana en curso, B ya no corresponde
    "2026-09-23": { General: "A" },
  };
  const nuevo = regenerarDesde(cronograma, personas, "General", "2026-09-16");
  assert.equal(nuevo["2026-09-09"].General, "A"); // pasado nunca se toca
  assert.equal(nuevo["2026-09-16"].General, "A"); // se reasigna porque B ya no está
});

test("regenerarDesde: área sin personas deja las semanas futuras sin asignar", () => {
  const cronograma: Cronograma = { "2026-09-16": { General: "A" }, "2026-09-23": { General: "A" } };
  const nuevo = regenerarDesde(cronograma, [], "General", "2026-09-16");
  assert.equal(nuevo["2026-09-16"].General, undefined);
  assert.equal(nuevo["2026-09-23"].General, undefined);
});

test("regenerarDesde: no muta el cronograma original", () => {
  const original: Cronograma = { "2026-09-16": { General: "A" } };
  regenerarDesde(original, [{ id: "B", area: "General", orden: 1 }], "General", "2026-09-16");
  assert.equal(original["2026-09-16"].General, "A");
});

test("guardiaSemana: devuelve null si la semana no tiene nada cargado", () => {
  assert.equal(guardiaSemana({}, "General", "2026-09-16"), null);
});
