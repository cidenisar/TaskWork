import test from "node:test";
import assert from "node:assert/strict";
import { liquidar, type Participacion } from "./motor";
import { liquidarConDetalle, tipoDiaDe, formatMinutosHoras, csvLiquidacion, type ParticipacionDetalle } from "./liquidacion";

const ev = (persona: string, inicio: string, fin: string, enCurso = false): ParticipacionDetalle => ({ persona, inicio, fin, enCurso });

test("tipoDiaDe: feriado marcado le gana al día de semana", () => {
  assert.equal(tipoDiaDe("2026-09-15", new Set(["2026-09-15"])), "Feriado"); // martes, pero feriado
});

test("tipoDiaDe: sábado y domingo son fin de semana", () => {
  assert.equal(tipoDiaDe("2026-09-12", new Set()), "Fin de semana"); // sábado
  assert.equal(tipoDiaDe("2026-09-13", new Set()), "Fin de semana"); // domingo
});

test("tipoDiaDe: martes sin feriado es día hábil", () => {
  assert.equal(tipoDiaDe("2026-09-15", new Set()), "Día hábil");
});

test("formatMinutosHoras: 450 minutos son 7:30", () => {
  assert.equal(formatMinutosHoras(450), "7:30");
});

test("liquidarConDetalle: mismos totales en centésimas que liquidar() del motor, para el mismo set de participaciones", () => {
  const participaciones: Participacion[] = [
    ev("ana", "2026-09-16T17:00", "2026-09-16T20:00"), // activación, martes tarde
    ev("ana", "2026-09-17T03:00", "2026-09-17T07:00"), // madrugada, mismo día calendario distinto
    ev("beto", "2026-09-12T10:00", "2026-09-12T14:00"), // sábado
  ];
  const base = liquidar(participaciones);
  const detalle = liquidarConDetalle(participaciones.map((p) => ({ ...p, enCurso: false })));
  assert.equal(detalle.ana.totalCentesimas, base.ana.totalCentesimas);
  assert.equal(detalle.beto.totalCentesimas, base.beto.totalCentesimas);
});

test("liquidarConDetalle: cuenta un evento por día que aporta minutos — dos llamados el mismo día suman 2 eventos", () => {
  const r = liquidarConDetalle([
    ev("ana", "2026-09-16T17:00", "2026-09-16T18:00"),
    ev("ana", "2026-09-16T20:00", "2026-09-16T21:00"),
  ]);
  assert.equal(r.ana.porDia["2026-09-16"].eventos, 2);
});

test("liquidarConDetalle: marca enCurso en el día si la participación todavía no terminó", () => {
  const r = liquidarConDetalle([ev("ana", "2026-09-16T17:00", "2026-09-16T18:00", true)]);
  assert.equal(r.ana.porDia["2026-09-16"].enCurso, true);
});

test("liquidarConDetalle: tipoDia correcto por día (sábado = fin de semana)", () => {
  const r = liquidarConDetalle([ev("beto", "2026-09-12T10:00", "2026-09-12T14:00")]);
  assert.equal(r.beto.porDia["2026-09-12"].tipoDia, "Fin de semana");
});

test("csvLiquidacion: encabezado fijo + una fila por incidente del día + fila TOTAL por persona", () => {
  const detalle = liquidarConDetalle([ev("ana", "2026-09-16T17:00", "2026-09-16T20:00")]).ana;
  const csv = csvLiquidacion([{ nombre: "Ana", area: "Infraestructura", detalle }]);
  const lineas = csv.split("\n");
  assert.equal(lineas[0], "Persona;Guardia;Fecha;Tipo de día;Incidente;Modalidad;Horas del evento;Resultado del día;Franco");
  assert.equal(lineas[1], "Ana;Infraestructura;16/09/2026;Día hábil;—;—;3:00;0,5;—");
  assert.equal(lineas[2], "Ana;Infraestructura;TOTAL;;;;3:00;0,5;—");
});

test("csvLiquidacion: una fila por incidente cuando hay más de uno en el mismo día, con modalidad", () => {
  const detalle = liquidarConDetalle([
    { ...ev("ana", "2026-09-16T17:00", "2026-09-16T18:00"), eventoId: "e1", incidente: "#0001 · UPS — Mendoza", modalidad: "CAMPO" },
    { ...ev("ana", "2026-09-16T20:00", "2026-09-16T21:00"), eventoId: "e2", incidente: "#0002 · Router — San Rafael", modalidad: "REMOTO" },
  ]).ana;
  const csv = csvLiquidacion([{ nombre: "Ana", area: "Infraestructura", detalle }]);
  const lineas = csv.split("\n");
  assert.equal(lineas[1], "Ana;Infraestructura;16/09/2026;Día hábil;#0001 · UPS — Mendoza;Asistió al sitio;1:00;0,5;—");
  assert.equal(lineas[2], "Ana;Infraestructura;16/09/2026;Día hábil;#0002 · Router — San Rafael;Remoto;1:00;0,5;—");
  assert.equal(lineas[3], "Ana;Infraestructura;TOTAL;;;;2:00;0,5;—");
});

test("francos: fin de semana u feriado trabajado da franco con el mismo corte de 4:30 que la activación", () => {
  const corto = liquidarConDetalle([ev("beto", "2026-09-12T10:00", "2026-09-12T13:00")]).beto.porDia["2026-09-12"]; // sábado, 3hs
  assert.equal(corto.francos, 50);
  const largo = liquidarConDetalle([ev("beto", "2026-09-12T08:00", "2026-09-12T14:00")]).beto.porDia["2026-09-12"]; // sábado, 6hs
  assert.equal(largo.francos, 100);
});

test("francos: no corresponde en día hábil aunque haya activación", () => {
  const r = liquidarConDetalle([ev("ana", "2026-09-16T17:00", "2026-09-16T20:00")]).ana.porDia["2026-09-16"]; // martes
  assert.equal(r.francos, 0);
});
