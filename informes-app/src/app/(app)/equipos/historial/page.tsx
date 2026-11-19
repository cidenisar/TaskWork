import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { puedeBorrarDefinitivo } from "@/lib/types";
import { HistorialEquipos, type HistorialRelevamientoRow } from "@/components/equipos/historial";
import { labelUbicacion } from "@/components/ubicaciones/types";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";

export default async function HistorialEquiposPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // RLS (equipo_relevamientos_select_own) ya limita esto a lo propio, o a todo si sos Admin/Supervisor.
  const { data: relevamientosData } = await supabase
    .from("equipo_relevamientos")
    .select("id, numero_generacion, fecha, pdf_url, foto_general_url, ubicacion_id")
    .order("fecha", { ascending: false });

  const ubicaciones = await fetchTodasLasUbicaciones(supabase);
  const ubicacionesPorId = new Map(ubicaciones.map((u) => [u.id, u]));

  // Qué equipos tiene cada relevamiento: un relevamiento es la visita a un sitio (con varios equipos), así que sin esto
  // la fila solo decía el lugar y no se sabía de qué equipo se trataba. Se piden por tandas (límite de PostgREST y de la URL).
  const relevamientoIds = (relevamientosData ?? []).map((r) => r.id);
  const TANDA = 100;
  const lecturas: { relevamiento_id: string; equipo_id: string }[] = [];
  for (let i = 0; i < relevamientoIds.length; i += TANDA) {
    const { data } = await supabase
      .from("equipo_relevamiento_lecturas")
      .select("relevamiento_id, equipo_id")
      .in("relevamiento_id", relevamientoIds.slice(i, i + TANDA));
    lecturas.push(...(data ?? []));
  }
  const equipoIds = [...new Set(lecturas.map((l) => l.equipo_id))];
  const textoPorEquipo = new Map<string, string>();
  for (let i = 0; i < equipoIds.length; i += TANDA) {
    const { data } = await supabase.from("equipos").select("id, texto").in("id", equipoIds.slice(i, i + TANDA));
    for (const e of data ?? []) textoPorEquipo.set(e.id, e.texto);
  }
  const equiposPorRelevamiento = new Map<string, string[]>();
  for (const l of lecturas) {
    const texto = textoPorEquipo.get(l.equipo_id);
    if (!texto) continue;
    equiposPorRelevamiento.set(l.relevamiento_id, [...(equiposPorRelevamiento.get(l.relevamiento_id) ?? []), texto]);
  }

  const relevamientos: HistorialRelevamientoRow[] = (relevamientosData ?? [])
    .map((r) => {
      const ubicacion = ubicacionesPorId.get(r.ubicacion_id);
      if (!ubicacion) return null;
      return {
        id: r.id,
        numeroGeneracion: r.numero_generacion,
        fecha: r.fecha,
        ubicacionLabel: labelUbicacion(ubicacion),
        equipos: equiposPorRelevamiento.get(r.id) ?? [],
        pdfDisponible: !!r.pdf_url,
        fotoDisponible: !!r.foto_general_url,
      };
    })
    .filter((r): r is HistorialRelevamientoRow => r !== null);

  return (
    <HistorialEquipos
      relevamientos={relevamientos}
      esAdmin={profile.rol === "admin" || puedeBorrarDefinitivo(profile.rol)}
      esSuperusuario={puedeBorrarDefinitivo(profile.rol)}
    />
  );
}
