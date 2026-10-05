import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { HistorialInstalacion, type HistorialInstalacionRow } from "@/components/instalacion/historial";
import { labelUbicacion } from "@/components/ubicaciones/types";

export default async function HistorialInstalacionPage() {
  await requireProfile();
  const supabase = await createClient();

  // RLS (instalaciones_select) es abierta a cualquier autenticado.
  const { data: instalacionesData } = await supabase
    .from("instalaciones")
    .select(
      "id, numero_generacion, descripcion, categoria, cantidad, comentario, fecha, ubicacion_id, remito_numero, remito_foto_url, entrega_deposito_numero_generacion, pdf_url",
    )
    .order("fecha", { ascending: false });

  const ubicacionIds = [...new Set((instalacionesData ?? []).map((i) => i.ubicacion_id))];
  const { data: ubicacionesData } =
    ubicacionIds.length > 0
      ? await supabase
          .from("ubicaciones")
          .select("id, pais, region, provincia, localidad, sitio, planta, oficina, lat, lng")
          .in("id", ubicacionIds)
      : { data: [] };
  const ubicacionesPorId = new Map((ubicacionesData ?? []).map((u) => [u.id, u]));

  const instalaciones: HistorialInstalacionRow[] = (instalacionesData ?? []).map((i) => {
    const ubicacion = ubicacionesPorId.get(i.ubicacion_id);
    return {
      id: i.id,
      numeroGeneracion: i.numero_generacion,
      descripcion: i.descripcion,
      categoria: i.categoria,
      cantidad: i.cantidad,
      comentario: i.comentario,
      fecha: i.fecha,
      ubicacionLabel: ubicacion ? labelUbicacion(ubicacion) : "—",
      remitoNumero: i.remito_numero,
      remitoFotoDisponible: Boolean(i.remito_foto_url),
      entregaDepositoNumeroGeneracion: i.entrega_deposito_numero_generacion,
      pdfDisponible: Boolean(i.pdf_url),
    };
  });

  return <HistorialInstalacion instalaciones={instalaciones} />;
}
