import { NextResponse } from "next/server";
import { requireAdminOrSupervisor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { construirWorkbookLiquidacion } from "@/lib/guardia/liquidacion-excel";
import type { FilaLiquidacionExport } from "@/lib/guardia/liquidacion";

/** Planilla de un cierre YA CONGELADO (semanal o global) — sale tal cual del `resultado_json` guardado al cerrar, nunca se recalcula. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdminOrSupervisor();
  const { id } = await params;
  const supabase = await createClient();

  const { data: cierre, error } = await supabase.from("guardia_periodo_cierre").select("desde, hasta, tipo, resultado_json").eq("id", id).single();
  if (error || !cierre) {
    return NextResponse.json({ error: "Cierre no encontrado." }, { status: 404 });
  }

  const filas = (cierre.resultado_json as FilaLiquidacionExport[] | null) ?? [];
  const titulo = `Liquidación de guardia — ${cierre.tipo === "semanal" ? "semana" : "período"} ${cierre.desde} a ${cierre.hasta}`;
  const workbook = await construirWorkbookLiquidacion(titulo, filas);
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="liquidacion_${cierre.desde}_${cierre.hasta}.xlsx"`,
    },
  });
}
