import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HistorialRendiciones, type HistorialRendicionRow } from "@/components/rendicion-gastos/historial";

export default async function HistorialRendicionesPage() {
  await requireProfile();
  const supabase = await createClient();

  const [rendicionesRes, gastosRes] = await Promise.all([
    supabase
      .from("rendiciones_gastos")
      .select("id, numero_generacion, motivo, fecha, proyecto_cliente, viatico_recibido, moneda, estado, pdf_url")
      .order("fecha", { ascending: false }),
    supabase.from("gastos").select("id, rendicion_id, monto"),
  ]);

  const gastoIds = (gastosRes.data ?? []).map((g) => g.id);
  const { data: gastoTecnicos } =
    gastoIds.length > 0
      ? await supabase.from("gasto_tecnicos").select("gasto_id, tecnico_nombre").in("gasto_id", gastoIds)
      : { data: [] as { gasto_id: string; tecnico_nombre: string }[] };

  const tecnicosPorGasto = new Map<string, string[]>();
  for (const gt of gastoTecnicos ?? []) {
    const list = tecnicosPorGasto.get(gt.gasto_id) ?? [];
    list.push(gt.tecnico_nombre);
    tecnicosPorGasto.set(gt.gasto_id, list);
  }

  const totalPorRendicion = new Map<string, number>();
  const tecnicosPorRendicion = new Map<string, Set<string>>();
  for (const g of gastosRes.data ?? []) {
    totalPorRendicion.set(g.rendicion_id, (totalPorRendicion.get(g.rendicion_id) ?? 0) + Number(g.monto));
    const set = tecnicosPorRendicion.get(g.rendicion_id) ?? new Set<string>();
    for (const nombre of tecnicosPorGasto.get(g.id) ?? []) set.add(nombre);
    tecnicosPorRendicion.set(g.rendicion_id, set);
  }

  const rows: HistorialRendicionRow[] = (rendicionesRes.data ?? []).map((r) => ({
    id: r.id,
    numeroGeneracion: r.numero_generacion,
    motivo: r.motivo,
    fecha: r.fecha,
    proyectoCliente: r.proyecto_cliente,
    moneda: r.moneda,
    viaticoRecibido: Number(r.viatico_recibido),
    totalGastado: totalPorRendicion.get(r.id) ?? 0,
    tecnicos: Array.from(tecnicosPorRendicion.get(r.id) ?? []),
    estado: r.estado,
    pdfDisponible: r.estado === "cerrada" && !!r.pdf_url,
  }));

  return <HistorialRendiciones rendiciones={rows} />;
}
