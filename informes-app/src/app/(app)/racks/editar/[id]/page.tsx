import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { EditarRelevamientoForm } from "@/components/racks/editar-relevamiento-form";
import { labelUbicacion } from "@/components/ubicaciones/types";

/** Solo Administrador (ver eliminarRelevamientoRackAction para el mismo criterio) — lee con la service role key para poder abrir el relevamiento de cualquiera, no solo el propio. */
export default async function EditarRelevamientoRackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const supabase = createServiceRoleClient();

  const { data: relevamiento, error } = await supabase
    .from("rack_relevamientos")
    .select("id, rack_id, numero_generacion, fecha, pdf_url")
    .eq("id", id)
    .single();
  if (error || !relevamiento) notFound();

  const [{ data: rack }, { data: lecturas }, { data: hallazgosRows }, { data: catalogoHallazgos }] = await Promise.all([
    supabase.from("racks").select("denominacion, etiqueta_ypf, ubicacion_id").eq("id", relevamiento.rack_id).single(),
    supabase.from("rack_relevamiento_lecturas").select("id, equipamiento_id, estado, comentario").eq("relevamiento_id", id),
    supabase.from("inspeccion_ia_hallazgos").select("item_id, estado, comentario").eq("modulo", "racks").eq("registro_id", id),
    supabase.from("catalogo_inspeccion_ia").select("id, texto").eq("modulo", "racks").order("orden"),
  ]);
  if (!rack) notFound();

  const equipamientoIds = (lecturas ?? []).map((l) => l.equipamiento_id);
  const { data: equipamientos } = equipamientoIds.length
    ? await supabase
        .from("rack_equipamientos")
        .select("id, numero, categoria_equipo, texto, marca_modelo, posicion_u, etiqueta_ypf, numero_serie, cantidad")
        .in("id", equipamientoIds)
    : { data: [] };
  const equipoPorId = new Map((equipamientos ?? []).map((e) => [e.id, e]));

  const { data: ubicacion } = await supabase.from("ubicaciones").select("*").eq("id", rack.ubicacion_id).single();

  const hallazgosPorId = new Map((hallazgosRows ?? []).map((h) => [h.item_id, h]));

  return (
    <div>
      <EditarRelevamientoForm
        relevamientoId={id}
        numeroGeneracion={relevamiento.numero_generacion}
        denominacion={rack.denominacion}
        ubicacionLabel={ubicacion ? labelUbicacion(ubicacion) : ""}
        initialFecha={relevamiento.fecha}
        pdfDisponible={!!relevamiento.pdf_url}
        initialLecturas={(lecturas ?? [])
          .map((l) => {
            const e = equipoPorId.get(l.equipamiento_id);
            if (!e) return null;
            return {
              lecturaId: l.id,
              equipamientoId: l.equipamiento_id,
              numero: e.numero,
              categoriaEquipo: e.categoria_equipo,
              texto: e.texto,
              marcaModelo: e.marca_modelo ?? "",
              posicionU: e.posicion_u ?? "",
              etiquetaYpf: e.etiqueta_ypf ?? "",
              numeroSerie: e.numero_serie ?? "",
              cantidad: e.cantidad,
              estado: l.estado ?? "",
              comentario: l.comentario ?? "",
            };
          })
          .filter((l): l is NonNullable<typeof l> => l !== null)
          .sort((a, b) => a.numero - b.numero)}
        initialHallazgos={(catalogoHallazgos ?? []).map((h) => ({
          itemId: h.id,
          texto: h.texto,
          estado: hallazgosPorId.get(h.id)?.estado ?? null,
          comentario: hallazgosPorId.get(h.id)?.comentario ?? "",
        }))}
      />
    </div>
  );
}
