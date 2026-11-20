import test from "node:test";
import assert from "node:assert/strict";
import type { Row } from "exceljs";
import { liquidarConDetalle, type ParticipacionDetalle } from "./liquidacion";
import { construirWorkbookLiquidacion } from "./liquidacion-excel";

const ev = (persona: string, inicio: string, fin: string, extra: Partial<ParticipacionDetalle> = {}): ParticipacionDetalle => ({
  persona,
  inicio,
  fin,
  enCurso: false,
  ...extra,
});

/** Las primeras `n` celdas de una fila, como valores planos — más robusto que `row.values` (que exceljs tipa raro). */
function celdas(row: Row, n: number): unknown[] {
  return Array.from({ length: n }, (_, i) => row.getCell(i + 1).value ?? "");
}

test("construirWorkbookLiquidacion: encabezado + una fila por incidente del día + fila TOTAL por persona", async () => {
  const detalle = liquidarConDetalle([ev("ana", "2026-09-16T17:00", "2026-09-16T20:00")]).ana;
  const workbook = await construirWorkbookLiquidacion("Título", [{ nombre: "Ana", area: "Infraestructura", detalle }]);
  const sheet = workbook.getWorksheet("Liquidación")!;

  assert.deepEqual(
    celdas(sheet.getRow(3), 9),
    ["Persona", "Guardia", "Fecha", "Tipo de día", "Incidente", "Modalidad", "Horas del evento", "Resultado del día", "Franco"],
  );
  assert.deepEqual(celdas(sheet.getRow(4), 8), ["Ana", "Infraestructura", "16/09/2026", "Día hábil", "—", "—", "3:00", 0.5]);
  assert.deepEqual(celdas(sheet.getRow(5), 8), ["Ana", "Infraestructura", "TOTAL", "", "", "", "3:00", 0.5]);
});

test("construirWorkbookLiquidacion: una fila por incidente cuando hay más de uno en el mismo día, con modalidad", async () => {
  const detalle = liquidarConDetalle([
    { ...ev("ana", "2026-09-16T17:00", "2026-09-16T18:00"), eventoId: "e1", incidente: "#0001 · UPS — Mendoza", modalidad: "CAMPO" },
    { ...ev("ana", "2026-09-16T20:00", "2026-09-16T21:00"), eventoId: "e2", incidente: "#0002 · Router — San Rafael", modalidad: "REMOTO" },
  ]).ana;
  const workbook = await construirWorkbookLiquidacion("Título", [{ nombre: "Ana", area: "Infraestructura", detalle }]);
  const sheet = workbook.getWorksheet("Liquidación")!;

  assert.deepEqual(
    celdas(sheet.getRow(4), 8),
    ["Ana", "Infraestructura", "16/09/2026", "Día hábil", "#0001 · UPS — Mendoza", "Asistió al sitio", "1:00", 0.5],
  );
  assert.deepEqual(
    celdas(sheet.getRow(5), 8),
    ["Ana", "Infraestructura", "16/09/2026", "Día hábil", "#0002 · Router — San Rafael", "Remoto", "1:00", 0.5],
  );
  assert.deepEqual(celdas(sheet.getRow(6), 8), ["Ana", "Infraestructura", "TOTAL", "", "", "", "2:00", 0.5]);
});

test("construirWorkbookLiquidacion: franco de fin de semana aparece en la columna Franco", async () => {
  const detalle = liquidarConDetalle([ev("beto", "2026-09-12T10:00", "2026-09-12T14:00")]).beto; // sábado, 4hs
  const workbook = await construirWorkbookLiquidacion("Título", [{ nombre: "Beto", area: "General", detalle }]);
  const sheet = workbook.getWorksheet("Liquidación")!;

  assert.equal(sheet.getRow(4).getCell(9).value, 0.5);
  assert.equal(sheet.getRow(5).getCell(9).value, 0.5); // fila TOTAL
});
