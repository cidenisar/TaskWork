/**
 * Planilla de liquidación con formato real (ExcelJS) — reemplaza el CSV
 * plano de antes, que en Excel se veía amontonado (sin ancho de columna,
 * sin ninguna jerarquía visual). Mismo contenido que tenía el CSV —
 * Persona/Guardia/Fecha/Tipo de día/Incidente/Modalidad/Horas del
 * evento/Resultado del día/Franco, una fila por incidente — pero con
 * encabezado y totales destacados, columnas con ancho fijo y los números
 * como números (no texto), para poder sumarlos en la propia planilla.
 *
 * La usan por igual la liquidación en vivo (período o semana sin cerrar
 * todavía) y la foto congelada de un cierre — a ambas les llega el mismo
 * `FilaLiquidacionExport[]`, así que acá no importa si el dato viene de
 * `calcularLiquidacion()` o de `guardia_periodo_cierre.resultado_json`.
 */
import ExcelJS from "exceljs";
import { formatMinutosHoras, fechaLegible, type FilaLiquidacionExport, type ModalidadDetalle } from "./liquidacion";

const COLOR_ENCABEZADO = "FF1F3864";
const COLOR_TOTAL_PERSONA = "FFE7EDF6";
const COLOR_TOTAL_GENERAL = "FFD9E2F3";

const ENCABEZADOS = ["Persona", "Guardia", "Fecha", "Tipo de día", "Incidente", "Modalidad", "Horas del evento", "Resultado del día", "Franco"];
const ANCHOS = [22, 16, 12, 13, 34, 16, 16, 16, 10];

function modalidadLabel(modalidad: ModalidadDetalle | null): string {
  return modalidad === "CAMPO" ? "Asistió al sitio" : modalidad === "REMOTO" ? "Remoto" : "—";
}

export async function construirWorkbookLiquidacion(titulo: string, filas: FilaLiquidacionExport[]): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TaskWork";
  const sheet = workbook.addWorksheet("Liquidación");

  const tituloRow = sheet.addRow([titulo]);
  tituloRow.font = { bold: true, size: 14 };
  sheet.addRow([]);

  const headerRow = sheet.addRow(ENCABEZADOS);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ENCABEZADO } };
  });
  sheet.views = [{ state: "frozen", ySplit: headerRow.number }];

  ANCHOS.forEach((ancho, i) => {
    sheet.getColumn(i + 1).width = ancho;
  });

  let totalGeneralCentesimas = 0;
  let totalGeneralFrancos = 0;

  for (const { nombre, area, detalle } of filas) {
    for (const fecha of Object.keys(detalle.porDia).sort()) {
      const dia = detalle.porDia[fecha];
      // Un cierre congelado antes de que existieran incidente/modalidad/franco no trae esos campos — se completan en blanco, nunca se recalculan.
      const francos = dia.francos ?? 0;
      const detalleEventos = dia.detalleEventos ?? [];
      const eventos = detalleEventos.length > 0 ? detalleEventos : [{ incidente: "—", modalidad: null as ModalidadDetalle | null, minutos: dia.minutos }];
      for (const ev of eventos) {
        const row = sheet.addRow([
          nombre,
          area,
          fechaLegible(fecha),
          dia.tipoDia,
          ev.incidente,
          modalidadLabel(ev.modalidad),
          formatMinutosHoras(ev.minutos),
          dia.centesimas / 100,
          francos > 0 ? francos / 100 : null,
        ]);
        row.getCell(8).numFmt = "0.0";
        row.getCell(9).numFmt = "0.0";
      }
    }

    const totalFrancos = detalle.totalFrancos ?? 0;
    const totalRow = sheet.addRow([
      nombre,
      area,
      "TOTAL",
      "",
      "",
      "",
      formatMinutosHoras(detalle.totalMinutos),
      detalle.totalCentesimas / 100,
      totalFrancos > 0 ? totalFrancos / 100 : null,
    ]);
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_TOTAL_PERSONA } };
    });
    totalRow.getCell(8).numFmt = "0.0";
    totalRow.getCell(9).numFmt = "0.0";
    sheet.addRow([]);

    totalGeneralCentesimas += detalle.totalCentesimas;
    totalGeneralFrancos += totalFrancos;
  }

  const totalGeneralRow = sheet.addRow([
    "TOTAL GENERAL",
    "",
    "",
    "",
    "",
    "",
    "",
    totalGeneralCentesimas / 100,
    totalGeneralFrancos > 0 ? totalGeneralFrancos / 100 : null,
  ]);
  totalGeneralRow.font = { bold: true, size: 12 };
  totalGeneralRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_TOTAL_GENERAL } };
  });
  totalGeneralRow.getCell(8).numFmt = "0.0";
  totalGeneralRow.getCell(9).numFmt = "0.0";

  return workbook;
}
