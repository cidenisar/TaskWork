import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { puedeGestionarBajas } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";
import { HistorialBajas, type HistorialBajaRow } from "@/components/bajas/historial";
import { labelUbicacion } from "@/components/ubicaciones/types";

export default async function HistorialBajasPage() {
  const profile = await requireProfile();
  if (!puedeGestionarBajas(profile.rol)) {
    return (
      <LockedPanel
        title="Solo para Administradores y Supervisores"
        description="Las bajas de equipamiento (y su historial) solo las puede gestionar un Administrador o un Supervisor."
      />
    );
  }

  const supabase = await createClient();
  // RLS (bajas_equipamiento_select) ya limita esto a Admin/Supervisor.
  const { data: bajasData } = await supabase
    .from("bajas_equipamiento")
    .select("id, numero_generacion, tipo_equipo, equipo_texto, equipo_categoria, motivo, comentario, fecha, ubicacion_id, pdf_url")
    .order("fecha", { ascending: false });

  const ubicacionIds = [...new Set((bajasData ?? []).map((b) => b.ubicacion_id))];
  const { data: ubicacionesData } =
    ubicacionIds.length > 0
      ? await supabase
          .from("ubicaciones")
          .select("id, pais, region, provincia, localidad, sitio, planta, oficina, lat, lng")
          .in("id", ubicacionIds)
      : { data: [] };
  const ubicacionesPorId = new Map((ubicacionesData ?? []).map((u) => [u.id, u]));

  const bajas: HistorialBajaRow[] = (bajasData ?? []).map((b) => {
    const ubicacion = ubicacionesPorId.get(b.ubicacion_id);
    return {
      id: b.id,
      numeroGeneracion: b.numero_generacion,
      tipoEquipo: b.tipo_equipo,
      equipoTexto: b.equipo_texto,
      equipoCategoria: b.equipo_categoria,
      motivo: b.motivo,
      comentario: b.comentario,
      fecha: b.fecha,
      ubicacionLabel: ubicacion ? labelUbicacion(ubicacion) : "—",
      pdfDisponible: Boolean(b.pdf_url),
    };
  });

  return <HistorialBajas bajas={bajas} />;
}
