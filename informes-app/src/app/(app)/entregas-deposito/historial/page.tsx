import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { puedeGestionarDeposito } from "@/lib/types";
import { LockedPanel } from "@/components/locked-panel";
import { HistorialEntregas, type HistorialEntregaRow } from "@/components/deposito/historial";
import { labelUbicacion } from "@/components/ubicaciones/types";

export default async function HistorialEntregasDepositoPage() {
  const profile = await requireProfile();
  if (!puedeGestionarDeposito(profile.rol)) {
    return (
      <LockedPanel
        title="Solo para Administradores y Supervisores"
        description="Las entregas a depósito (y su historial) solo las puede gestionar un Administrador o un Supervisor."
      />
    );
  }

  const supabase = await createClient();
  // RLS (entregas_deposito_select) ya limita esto a Admin/Supervisor.
  const { data: entregasData } = await supabase
    .from("entregas_deposito")
    .select(
      "id, numero_generacion, origen, tipo_equipo, descripcion, categoria, cantidad, condicion, motivo, comentario, fecha, ubicacion_id, pdf_url, fotos_evidencia_urls",
    )
    .order("fecha", { ascending: false });

  const ubicacionIds = [...new Set((entregasData ?? []).map((e) => e.ubicacion_id))];
  const { data: ubicacionesData } =
    ubicacionIds.length > 0
      ? await supabase
          .from("ubicaciones")
          .select("id, pais, region, provincia, localidad, sitio, planta, oficina, lat, lng")
          .in("id", ubicacionIds)
      : { data: [] };
  const ubicacionesPorId = new Map((ubicacionesData ?? []).map((u) => [u.id, u]));

  const entregas: HistorialEntregaRow[] = (entregasData ?? []).map((e) => {
    const ubicacion = ubicacionesPorId.get(e.ubicacion_id);
    return {
      id: e.id,
      numeroGeneracion: e.numero_generacion,
      origen: e.origen,
      tipoEquipo: e.tipo_equipo,
      descripcion: e.descripcion,
      categoria: e.categoria,
      cantidad: e.cantidad,
      condicion: e.condicion,
      motivo: e.motivo,
      comentario: e.comentario,
      fecha: e.fecha,
      ubicacionLabel: ubicacion ? labelUbicacion(ubicacion) : "—",
      pdfDisponible: Boolean(e.pdf_url),
      fotosDisponibles: Boolean(e.fotos_evidencia_urls && e.fotos_evidencia_urls.length > 0),
    };
  });

  return <HistorialEntregas entregas={entregas} />;
}
