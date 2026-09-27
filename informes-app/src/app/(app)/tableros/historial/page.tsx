import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HistorialTableros, type HistorialMedicionRow } from "@/components/tableros/historial";

export default async function HistorialTablerosPage() {
  await requireProfile();
  const supabase = await createClient();

  // RLS (tablero_mediciones_select_own) ya limita esto a mediciones propias,
  // o todas si sos Admin/Supervisor.
  const { data: medicionesRes } = await supabase
    .from("tablero_mediciones")
    .select("id, numero_generacion, fecha, pdf_url, tablero_id")
    .order("fecha", { ascending: false });

  const tableroIds = [...new Set((medicionesRes ?? []).map((m) => m.tablero_id))];
  const { data: tablerosRes } =
    tableroIds.length > 0
      ? await supabase.from("tableros").select("id, tipo, denominacion, sitio").in("id", tableroIds)
      : { data: [] };
  const tablerosPorId = new Map((tablerosRes ?? []).map((t) => [t.id, t]));

  const rows: HistorialMedicionRow[] = (medicionesRes ?? [])
    .map((m) => {
      const t = tablerosPorId.get(m.tablero_id);
      if (!t) return null;
      return {
        id: m.id,
        numeroGeneracion: m.numero_generacion,
        fecha: m.fecha,
        tipo: t.tipo,
        denominacion: t.denominacion,
        sitio: t.sitio,
        pdfDisponible: !!m.pdf_url,
      };
    })
    .filter((r): r is HistorialMedicionRow => r !== null);

  return <HistorialTableros mediciones={rows} />;
}
