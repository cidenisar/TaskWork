import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HistorialRacks, type HistorialRelevamientoRow } from "@/components/racks/historial";
import { labelUbicacion } from "@/components/ubicaciones/types";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";

export default async function HistorialRacksPage() {
  await requireProfile();
  const supabase = await createClient();

  // RLS (rack_relevamientos_select_own) ya limita esto a lo propio, o a todo si sos Admin/Supervisor.
  const { data: relevamientosData } = await supabase
    .from("rack_relevamientos")
    .select("id, numero_generacion, fecha, pdf_url, foto_general_url, rack_id")
    .order("fecha", { ascending: false });

  const rackIds = [...new Set((relevamientosData ?? []).map((r) => r.rack_id))];
  const [{ data: racksData }, ubicaciones] = await Promise.all([
    rackIds.length > 0 ? supabase.from("racks").select("id, denominacion, ubicacion_id").in("id", rackIds) : { data: [] },
    fetchTodasLasUbicaciones(supabase),
  ]);
  const ubicacionesPorId = new Map(ubicaciones.map((u) => [u.id, u]));
  const racksPorId = new Map((racksData ?? []).map((r) => [r.id, r]));

  const relevamientos: HistorialRelevamientoRow[] = (relevamientosData ?? [])
    .map((r) => {
      const rack = racksPorId.get(r.rack_id);
      const ubicacion = rack ? ubicacionesPorId.get(rack.ubicacion_id) : undefined;
      if (!rack || !ubicacion) return null;
      return {
        id: r.id,
        numeroGeneracion: r.numero_generacion,
        fecha: r.fecha,
        denominacion: rack.denominacion,
        ubicacionLabel: labelUbicacion(ubicacion),
        pdfDisponible: !!r.pdf_url,
        fotoDisponible: !!r.foto_general_url,
      };
    })
    .filter((r): r is HistorialRelevamientoRow => r !== null);

  return <HistorialRacks relevamientos={relevamientos} />;
}
