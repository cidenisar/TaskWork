import { NextResponse } from "next/server";
import { requireAdminOrSupervisor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cargarTareasPanel } from "@/lib/tareas/cargar";
import { construirWorkbookPlanDeVisita } from "@/lib/tareas/excel";
import { coincideConRuta, type RutaTareas } from "@/lib/tareas/puro";

const NIVELES = ["region", "provincia", "localidad", "sitio"] as const;

/**
 * Excel "plan de visita" con las tareas abiertas. Respeta el mismo filtro de
 * ubicación que la pantalla (region / provincia / localidad / sitio en la URL).
 */
export async function GET(request: Request) {
  await requireAdminOrSupervisor();
  const { searchParams } = new URL(request.url);
  const ruta: RutaTareas = {};
  for (const k of NIVELES) {
    const v = searchParams.get(k);
    if (v) ruta[k] = v;
  }

  const supabase = await createClient();
  const todas = await cargarTareasPanel(supabase);
  const filtradas = todas.filter((t) => t.estado === "abierta" && coincideConRuta(t, ruta));

  const alcance = NIVELES.flatMap((k) => (ruta[k] ? [ruta[k]!] : [])).join(" › ");
  const ahora = new Date();
  const workbook = await construirWorkbookPlanDeVisita(`Plan de visita — tareas pendientes${alcance ? ` (${alcance})` : ""}`, filtradas, ahora);
  const buffer = await workbook.xlsx.writeBuffer();

  const fecha = ahora.toISOString().slice(0, 10);
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="plan_de_visita_${fecha}.xlsx"`,
    },
  });
}
