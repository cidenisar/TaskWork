import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HistorialEquipos, type HistorialRelevamientoRow } from "@/components/equipos/historial";
import { labelUbicacion, type Ubicacion } from "@/components/ubicaciones/types";

export default async function HistorialEquiposPage() {
  await requireProfile();
  const supabase = await createClient();

  // RLS (equipo_relevamientos_select_own) ya limita esto a lo propio, o a todo si sos Admin/Supervisor.
  const { data: relevamientosData } = await supabase
    .from("equipo_relevamientos")
    .select("id, numero_generacion, fecha, pdf_url, foto_general_url, ubicacion_id")
    .order("fecha", { ascending: false });

  const ubicaciones: Ubicacion[] = (await supabase.from("ubicaciones").select("id, pais, region, provincia, localidad, sitio, planta, oficina, lat, lng")).data ?? [];
  const ubicacionesPorId = new Map(ubicaciones.map((u) => [u.id, u]));

  const relevamientos: HistorialRelevamientoRow[] = (relevamientosData ?? [])
    .map((r) => {
      const ubicacion = ubicacionesPorId.get(r.ubicacion_id);
      if (!ubicacion) return null;
      return {
        id: r.id,
        numeroGeneracion: r.numero_generacion,
        fecha: r.fecha,
        ubicacionLabel: labelUbicacion(ubicacion),
        pdfDisponible: !!r.pdf_url,
        fotoDisponible: !!r.foto_general_url,
      };
    })
    .filter((r): r is HistorialRelevamientoRow => r !== null);

  return <HistorialEquipos relevamientos={relevamientos} />;
}
