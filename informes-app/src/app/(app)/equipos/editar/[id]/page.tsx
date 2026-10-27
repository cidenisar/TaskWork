import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { EditarRelevamientoEquiposForm, type LecturaEditable } from "@/components/equipos/editar-relevamiento-form";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";

/** Solo Administrador (ver requireAdmin) — el resto de los usuarios ni siquiera puede abrir esta ruta. */
export default async function EditarRelevamientoEquiposPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const service = createServiceRoleClient();

  const { data: relevamiento, error } = await service
    .from("equipo_relevamientos")
    .select("numero_generacion, fecha, ubicacion_id")
    .eq("id", id)
    .single();
  if (error || !relevamiento) notFound();

  const [lecturasRes, ubicaciones, provinciasRes] = await Promise.all([
    service.from("equipo_relevamiento_lecturas").select("id, equipo_id, estado, comentario").eq("relevamiento_id", id),
    fetchTodasLasUbicaciones(service),
    service.from("catalogo_provincias").select("nombre").order("nombre"),
  ]);

  const equipoIds = (lecturasRes.data ?? []).map((l) => l.equipo_id);
  const { data: equiposData } = equipoIds.length
    ? await service
        .from("equipos")
        .select("id, categoria_equipo, texto, marca_modelo, numero_serie, etiqueta_ypf, cantidad, consumo_promedio_w, consumo_max_w, tipo_montaje, altura_montaje_m")
        .in("id", equipoIds)
    : { data: [] };
  const equiposPorId = new Map((equiposData ?? []).map((e) => [e.id, e]));

  const lecturas: LecturaEditable[] = (lecturasRes.data ?? [])
    .map((l): LecturaEditable | null => {
      const eq = equiposPorId.get(l.equipo_id);
      if (!eq) return null;
      return {
        lecturaId: l.id,
        equipoId: eq.id,
        categoriaEquipo: eq.categoria_equipo,
        texto: eq.texto,
        marcaModelo: eq.marca_modelo ?? "",
        numeroSerie: eq.numero_serie ?? "",
        etiquetaYpf: eq.etiqueta_ypf ?? "",
        cantidad: eq.cantidad,
        consumoPromedioW: eq.consumo_promedio_w,
        consumoMaxW: eq.consumo_max_w,
        tipoMontaje: eq.tipo_montaje,
        alturaMontajeM: eq.altura_montaje_m,
        estado: l.estado ?? "",
        comentario: l.comentario ?? "",
        eliminada: false,
      };
    })
    .filter((l): l is LecturaEditable => l !== null);

  const ubicacionActual = ubicaciones.find((u) => u.id === relevamiento.ubicacion_id);

  return (
    <div>
      <EditarRelevamientoEquiposForm
        relevamientoId={id}
        numeroGeneracion={relevamiento.numero_generacion}
        initialFecha={relevamiento.fecha}
        initialUbicacionId={ubicacionActual?.id ?? ""}
        initialProvinciaFiltro={ubicacionActual?.provincia ?? ""}
        initialLecturas={lecturas}
        ubicaciones={ubicaciones}
        provincias={(provinciasRes.data ?? []).map((p) => p.nombre)}
      />
    </div>
  );
}
