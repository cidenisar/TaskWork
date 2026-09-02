import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireProfile();
  const { id } = await params;
  const supabase = await createClient();

  const { data: rendicion, error } = await supabase
    .from("rendiciones_gastos")
    .select("numero_generacion, motivo, fecha, proyecto_cliente, provincia, viatico_recibido, moneda")
    .eq("id", id)
    .single();
  if (error || !rendicion) {
    return NextResponse.json({ error: "Rendición no encontrada." }, { status: 404 });
  }

  const { data: gastos } = await supabase
    .from("gastos")
    .select("id, fecha, categoria, monto, descripcion")
    .eq("rendicion_id", id)
    .order("fecha");

  const { data: gastoTecnicos } = await supabase
    .from("gasto_tecnicos")
    .select("gasto_id, tecnico_nombre")
    .in("gasto_id", (gastos ?? []).map((g) => g.id));

  const tecnicosPorGasto = new Map<string, string[]>();
  for (const gt of gastoTecnicos ?? []) {
    const list = tecnicosPorGasto.get(gt.gasto_id) ?? [];
    list.push(gt.tecnico_nombre);
    tecnicosPorGasto.set(gt.gasto_id, list);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Informes";
  const sheet = workbook.addWorksheet(rendicion.numero_generacion);

  sheet.addRow([`Rendición de Gastos — ${rendicion.motivo}`]);
  sheet.addRow([`N° de Rendición: ${rendicion.numero_generacion}`]);
  sheet.addRow([`Fecha: ${rendicion.fecha}`]);
  sheet.addRow([`Proyecto / Cliente: ${rendicion.proyecto_cliente || "—"}`]);
  sheet.addRow([`Provincia: ${rendicion.provincia || "—"}`]);
  sheet.addRow([`Viático Recibido: ${rendicion.moneda} ${Number(rendicion.viatico_recibido).toFixed(2)}`]);
  sheet.addRow([]);

  const headerRow = sheet.addRow(["Fecha", "Categoría", "Técnico(s)", "Descripción", "Monto"]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });

  let total = 0;
  for (const g of gastos ?? []) {
    total += Number(g.monto);
    sheet.addRow([g.fecha, g.categoria, (tecnicosPorGasto.get(g.id) ?? []).join(", "), g.descripcion || "", Number(g.monto)]);
  }

  const totalRow = sheet.addRow(["", "", "", "TOTAL GASTADO", total]);
  totalRow.font = { bold: true };

  const saldo = Number(rendicion.viatico_recibido) - total;
  sheet.addRow([]);
  sheet.addRow([saldo >= 0 ? "Saldo a favor de la empresa" : "Saldo a reintegrar al empleado", "", "", "", Math.abs(saldo)]);

  sheet.getColumn(1).width = 14;
  sheet.getColumn(2).width = 18;
  sheet.getColumn(3).width = 28;
  sheet.getColumn(4).width = 34;
  sheet.getColumn(5).width = 16;
  sheet.getColumn(5).numFmt = `"${rendicion.moneda}" #,##0.00`;

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${rendicion.numero_generacion}.xlsx"`,
    },
  });
}
