import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { EditarRelevamientoForm, type EquipamientoEditable } from "@/components/torres-comunicacion/editar-relevamiento-form";
import { labelUbicacion } from "@/components/ubicaciones/types";
import type { HallazgoInspeccionIa } from "@/lib/inspeccion-ia/types";

/**
 * Editar un relevamiento de torre ya cargado — SOLO Administrador (a
 * diferencia de Informe Técnico, acá no hay auto-edición del dueño: ver
 * directiva del fork "Admin edit flow para Torres de Comunicación"). Por
 * eso se usa `requireAdmin()` + service role desde el vamos, no el cliente
 * normal con RLS.
 *
 * Alcance deliberadamente acotado (mismo criterio que
 * actualizarInformeTecnicoAction: "solo datos, las fotos quedan como
 * están"): se edita la fecha del relevamiento y el estado/comentario de
 * cada lectura ya tomada, más los hallazgos de Inspección IA. NO se
 * tocan acá los datos propios de la Torre (tipo/tramos/altura — el form
 * de "nuevo" ya dice que esos "todavía no se pueden editar después del
 * alta") ni los datos maestros del equipamiento (marca/modelo/etc, que
 * son compartidos entre relevamientos), ni se agregan/sacan equipos ni
 * fotos generales — eso es alcance de un relevamiento NUEVO, no de editar
 * uno ya cerrado.
 */
export default async function EditarRelevamientoTorreComunicacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const service = createServiceRoleClient();

  const { data: relevamiento, error } = await service
    .from("torre_comunicacion_relevamientos")
    .select("id, torre_id, numero_generacion, fecha")
    .eq("id", id)
    .single();
  if (error || !relevamiento) notFound();

  const { data: torre } = await service
    .from("torres_comunicacion")
    .select("denominacion, ubicacion_id")
    .eq("id", relevamiento.torre_id)
    .single();
  if (!torre) notFound();

  const [{ data: ubicacion }, { data: equipamientoData }, { data: lecturasData }, { data: catalogoHallazgosData }, { data: hallazgosData }] =
    await Promise.all([
      service
        .from("ubicaciones")
        .select("id, pais, region, provincia, localidad, sitio, planta, oficina, lat, lng")
        .eq("id", torre.ubicacion_id)
        .single(),
      service
        .from("torre_comunicacion_equipamientos")
        .select("id, numero, categoria_equipo, texto, marca_modelo, altura_m, etiqueta_ypf, cantidad")
        .eq("torre_id", relevamiento.torre_id)
        .eq("estado", "activo")
        .order("numero"),
      service.from("torre_comunicacion_relevamiento_lecturas").select("equipamiento_id, estado, comentario").eq("relevamiento_id", id),
      service.from("catalogo_inspeccion_ia").select("id, texto").eq("modulo", "torres").order("orden"),
      service.from("inspeccion_ia_hallazgos").select("item_id, estado, comentario").eq("modulo", "torres").eq("registro_id", id),
    ]);

  const lecturaPorEquipoId = new Map((lecturasData ?? []).map((l) => [l.equipamiento_id, l]));
  const equipamiento: EquipamientoEditable[] = (equipamientoData ?? []).map((e) => {
    const lectura = lecturaPorEquipoId.get(e.id);
    return {
      id: e.id,
      numero: e.numero,
      categoriaEquipo: e.categoria_equipo,
      texto: e.texto,
      marcaModelo: e.marca_modelo,
      alturaM: e.altura_m,
      etiquetaYpf: e.etiqueta_ypf,
      cantidad: e.cantidad,
      estado: lectura?.estado ?? "",
      comentario: lectura?.comentario ?? "",
    };
  });

  const hallazgoPorItemId = new Map((hallazgosData ?? []).map((h) => [h.item_id, h]));
  const hallazgos: HallazgoInspeccionIa[] = (catalogoHallazgosData ?? []).map((h) => {
    const existente = hallazgoPorItemId.get(h.id);
    return { itemId: h.id, texto: h.texto, estado: existente?.estado ?? null, comentario: existente?.comentario ?? "" };
  });

  return (
    <div>
      <EditarRelevamientoForm
        relevamientoId={id}
        numeroGeneracion={relevamiento.numero_generacion}
        denominacion={torre.denominacion}
        ubicacionLabel={ubicacion ? labelUbicacion(ubicacion) : ""}
        initialFecha={relevamiento.fecha}
        equipamiento={equipamiento}
        initialHallazgos={hallazgos}
      />
    </div>
  );
}
