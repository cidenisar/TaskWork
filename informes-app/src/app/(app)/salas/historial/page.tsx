import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HistorialSalas, type HistorialSalaRow } from "@/components/salas/historial";
import { labelUbicacion } from "@/components/ubicaciones/types";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";

export default async function HistorialSalasPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [salasRes, ubicaciones] = await Promise.all([
    supabase
      .from("salas")
      .select("id, numero_generacion, denominacion, tipo_construccion, ubicacion_id, created_at, pdf_url")
      .order("created_at", { ascending: false }),
    fetchTodasLasUbicaciones(supabase),
  ]);
  const ubicacionesPorId = new Map(ubicaciones.map((u) => [u.id, u]));

  const salas: HistorialSalaRow[] = (salasRes.data ?? [])
    .map((s) => {
      const ubicacion = ubicacionesPorId.get(s.ubicacion_id);
      if (!ubicacion) return null;
      return {
        id: s.id,
        numeroGeneracion: s.numero_generacion,
        denominacion: s.denominacion,
        tipoConstruccion: s.tipo_construccion,
        ubicacionLabel: labelUbicacion(ubicacion),
        fecha: s.created_at.slice(0, 10),
        pdfDisponible: !!s.pdf_url,
      };
    })
    .filter((r): r is HistorialSalaRow => r !== null);

  return <HistorialSalas salas={salas} esAdmin={profile.rol === "admin"} />;
}
