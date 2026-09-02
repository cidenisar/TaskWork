import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HistorialInformes, type HistorialInformeRow } from "@/components/informe-tecnico/historial";

export default async function HistorialInformesPage() {
  await requireProfile();
  const supabase = await createClient();

  const [informesRes, asignadosRes] = await Promise.all([
    supabase
      .from("informes_tecnicos")
      .select("id, numero_generacion, titulo, fecha, cliente, ticket_numero, tipo_informe, estado, pdf_url")
      .order("fecha", { ascending: false }),
    supabase.from("informe_tecnicos_asignados").select("informe_id, tecnico_nombre"),
  ]);

  const tecnicosPorInforme = new Map<string, string[]>();
  for (const a of asignadosRes.data ?? []) {
    const list = tecnicosPorInforme.get(a.informe_id) ?? [];
    list.push(a.tecnico_nombre);
    tecnicosPorInforme.set(a.informe_id, list);
  }

  const rows: HistorialInformeRow[] = (informesRes.data ?? []).map((i) => ({
    id: i.id,
    numeroGeneracion: i.numero_generacion,
    titulo: i.titulo,
    fecha: i.fecha,
    cliente: i.cliente,
    ticketNumero: i.ticket_numero,
    tipoInforme: i.tipo_informe,
    tecnicos: tecnicosPorInforme.get(i.id) ?? [],
    pdfDisponible: i.estado === "generado" && !!i.pdf_url,
  }));

  return <HistorialInformes informes={rows} />;
}
