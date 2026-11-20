import { NextResponse } from "next/server";
import { requireAdminOrSupervisor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { calcularLiquidacion } from "@/lib/guardia/datos";
import { construirWorkbookLiquidacion } from "@/lib/guardia/liquidacion-excel";

/** Planilla de la liquidación EN VIVO (período o semana todavía sin cerrar) — se recalcula en cada descarga, "derivados, no guardados". */
export async function GET(request: Request) {
  await requireAdminOrSupervisor();
  const { searchParams } = new URL(request.url);
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  if (!desde || !hasta) {
    return NextResponse.json({ error: "Faltan desde/hasta." }, { status: 400 });
  }

  const supabase = await createClient();
  const filas = await calcularLiquidacion(supabase, desde, hasta);
  const workbook = await construirWorkbookLiquidacion(`Liquidación de guardia — ${desde} a ${hasta}`, filas);
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="liquidacion_${desde}_${hasta}.xlsx"`,
    },
  });
}
