import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HistorialTorresComunicacion, type HistorialRelevamientoTorreRow } from "@/components/torres-comunicacion/historial";
import { labelUbicacion } from "@/components/ubicaciones/types";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";

export default async function HistorialTorresComunicacionPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // RLS (torre_comunicacion_relevamientos_select_own) ya limita esto a lo propio, o a todo si sos Admin/Supervisor.
  const { data: relevamientosData } = await supabase
    .from("torre_comunicacion_relevamientos")
    .select("id, numero_generacion, fecha, pdf_url, fotos_generales_urls, torre_id")
    .order("fecha", { ascending: false });

  const torreIds = [...new Set((relevamientosData ?? []).map((r) => r.torre_id))];
  const [{ data: torresData }, ubicaciones] = await Promise.all([
    torreIds.length > 0 ? supabase.from("torres_comunicacion").select("id, denominacion, ubicacion_id").in("id", torreIds) : { data: [] },
    fetchTodasLasUbicaciones(supabase),
  ]);
  const ubicacionesPorId = new Map(ubicaciones.map((u) => [u.id, u]));
  const torresPorId = new Map((torresData ?? []).map((t) => [t.id, t]));

  const relevamientos: HistorialRelevamientoTorreRow[] = (relevamientosData ?? [])
    .map((r) => {
      const torre = torresPorId.get(r.torre_id);
      const ubicacion = torre ? ubicacionesPorId.get(torre.ubicacion_id) : undefined;
      if (!torre || !ubicacion) return null;
      return {
        id: r.id,
        numeroGeneracion: r.numero_generacion,
        fecha: r.fecha,
        denominacion: torre.denominacion,
        ubicacionLabel: labelUbicacion(ubicacion),
        pdfDisponible: !!r.pdf_url,
        fotosDisponibles: (r.fotos_generales_urls?.length ?? 0) > 0,
      };
    })
    .filter((r): r is HistorialRelevamientoTorreRow => r !== null);

  return <HistorialTorresComunicacion relevamientos={relevamientos} esAdmin={profile.rol === "admin"} />;
}
