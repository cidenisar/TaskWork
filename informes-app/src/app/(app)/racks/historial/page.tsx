import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HistorialRacks, type HistorialRelevamientoRow } from "@/components/racks/historial";

export default async function HistorialRacksPage() {
  await requireProfile();
  const supabase = await createClient();

  // RLS (rack_relevamientos_select_own) ya limita esto a lo propio, o a todo si sos Admin/Supervisor.
  const { data: relevamientosData } = await supabase
    .from("rack_relevamientos")
    .select("id, numero_generacion, fecha, pdf_url, foto_general_url, rack_id")
    .order("fecha", { ascending: false });

  const rackIds = [...new Set((relevamientosData ?? []).map((r) => r.rack_id))];
  const { data: racksData } =
    rackIds.length > 0 ? await supabase.from("racks").select("id, denominacion, sitio").in("id", rackIds) : { data: [] };
  const racksPorId = new Map((racksData ?? []).map((r) => [r.id, r]));

  const relevamientos: HistorialRelevamientoRow[] = (relevamientosData ?? [])
    .map((r) => {
      const rack = racksPorId.get(r.rack_id);
      if (!rack) return null;
      return {
        id: r.id,
        numeroGeneracion: r.numero_generacion,
        fecha: r.fecha,
        denominacion: rack.denominacion,
        sitio: rack.sitio,
        pdfDisponible: !!r.pdf_url,
        fotoDisponible: !!r.foto_general_url,
      };
    })
    .filter((r): r is HistorialRelevamientoRow => r !== null);

  return <HistorialRacks relevamientos={relevamientos} />;
}
