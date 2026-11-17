/**
 * Excel "plan de visita": las tareas pendientes ABIERTAS ordenadas por ubicación
 * (región → provincia → localidad → sitio) para armar la ruta de un viaje, con
 * una segunda hoja que resume cuántas hay por localidad. Es el mismo contenido
 * que se adjunta al mail semanal de los lunes.
 */
import ExcelJS from "exceljs";
import { diasDesde, DIAS_TAREA_VIEJA, resumenPorLocalidad, SIN_LOCALIDAD } from "./puro";
import type { TareaPanel } from "./cargar";

const COLOR_ENCABEZADO = "FF1F3864";
const COLOR_VIEJA = "FFFDE9D9";

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric" });

function encabezado(sheet: ExcelJS.Worksheet, titulos: string[], anchos: number[]) {
  const fila = sheet.addRow(titulos);
  fila.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ENCABEZADO } };
  });
  anchos.forEach((ancho, i) => {
    sheet.getColumn(i + 1).width = ancho;
  });
  sheet.views = [{ state: "frozen", ySplit: fila.number }];
}

/** Orden del plan de visita: por lugar y, dentro de cada lugar, lo más viejo primero. */
export function ordenarParaVisita(tareas: TareaPanel[]): TareaPanel[] {
  const cmp = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "", "es");
  return [...tareas].sort(
    (a, b) =>
      cmp(a.region, b.region) ||
      cmp(a.provincia, b.provincia) ||
      cmp(a.localidad, b.localidad) ||
      cmp(a.sitio, b.sitio) ||
      cmp(a.planta, b.planta) ||
      cmp(a.oficina, b.oficina) ||
      a.created_at.localeCompare(b.created_at),
  );
}

export async function construirWorkbookPlanDeVisita(titulo: string, tareas: TareaPanel[], ahora: Date): Promise<ExcelJS.Workbook> {
  const abiertas = ordenarParaVisita(tareas.filter((t) => t.estado === "abierta"));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "TaskWork";

  const plan = workbook.addWorksheet("Plan de visita");
  plan.addRow([titulo]).font = { bold: true, size: 14 };
  plan.addRow([`${abiertas.length} tarea${abiertas.length === 1 ? "" : "s"} abierta${abiertas.length === 1 ? "" : "s"} — generado el ${fmtFecha(ahora.toISOString())}`]);
  plan.addRow([]);
  encabezado(
    plan,
    ["Región", "Provincia", "Localidad", "Sitio", "Planta", "Oficina", "Tarea", "Equipo vinculado", "Anotada el", "Días abierta", "Informe de origen"],
    [14, 16, 18, 24, 14, 14, 52, 26, 12, 12, 18],
  );
  for (const t of abiertas) {
    const dias = diasDesde(t.created_at, ahora);
    const fila = plan.addRow([
      t.region,
      t.provincia,
      t.localidad ?? SIN_LOCALIDAD,
      t.sitio,
      t.planta ?? "",
      t.oficina ?? "",
      t.texto,
      t.equipo?.texto ?? "",
      fmtFecha(t.created_at),
      dias,
      t.informe?.numero ?? "",
    ]);
    fila.getCell(7).alignment = { wrapText: true, vertical: "top" };
    if (dias > DIAS_TAREA_VIEJA) {
      fila.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_VIEJA } };
      });
    }
  }
  plan.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 11 } };

  const resumen = workbook.addWorksheet("Resumen por localidad");
  resumen.addRow(["Tareas abiertas por localidad"]).font = { bold: true, size: 14 };
  resumen.addRow([]);
  encabezado(resumen, ["Región", "Provincia", "Localidad", "Sitios con pendientes", "Tareas abiertas", `Con más de ${DIAS_TAREA_VIEJA} días`, "La más vieja (días)"], [14, 16, 22, 20, 16, 20, 18]);
  const filas = resumenPorLocalidad(abiertas, ahora);
  for (const f of filas) resumen.addRow([f.region, f.provincia, f.localidad, f.sitios, f.abiertas, f.viejas, f.masAntiguaDias]);
  const total = resumen.addRow(["Total", "", "", "", filas.reduce((n, f) => n + f.abiertas, 0), filas.reduce((n, f) => n + f.viejas, 0), ""]);
  total.font = { bold: true };

  return workbook;
}
