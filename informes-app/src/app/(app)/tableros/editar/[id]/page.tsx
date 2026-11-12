import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { EditarMedicionForm, type LecturaEditable } from "@/components/tableros/editar-medicion-form";

export default async function EditarMedicionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  // Solo Administrador puede editar — bypass total de RLS con la service
  // role key (mismo criterio que el borrado, ver eliminarMedicionAction).
  const service = createServiceRoleClient();

  const { data: medicion, error } = await service
    .from("tablero_mediciones")
    .select("tablero_id, numero_generacion, tipo_evento, fecha")
    .eq("id", id)
    .single();
  if (error || !medicion) notFound();

  const [tableroRes, circuitosRes, lecturasRes, catalogoHallazgosRes, hallazgosRes] = await Promise.all([
    service.from("tableros").select("denominacion, subsistemas, ubicacion_id").eq("id", medicion.tablero_id).single(),
    service
      .from("tablero_circuitos")
      .select("id, numero, texto, amp_nominal, categoria_equipo, tipo_circuito")
      .eq("tablero_id", medicion.tablero_id)
      .eq("estado", "activo")
      .order("numero"),
    service.from("tablero_medicion_lecturas").select("circuito_id, estado, corriente_f, corriente_r, corriente_s, corriente_t, comentario").eq("medicion_id", id),
    service.from("catalogo_inspeccion_ia").select("id, texto").eq("modulo", "tableros").order("orden"),
    service.from("inspeccion_ia_hallazgos").select("item_id, estado, comentario").eq("modulo", "tableros").eq("registro_id", id),
  ]);
  if (tableroRes.error || !tableroRes.data) notFound();

  const { data: ubicacion } = await service.from("ubicaciones").select("region, provincia, localidad, sitio, planta, oficina").eq("id", tableroRes.data.ubicacion_id).single();

  const lecturasPorCircuito = new Map((lecturasRes.data ?? []).map((l) => [l.circuito_id, l]));
  const lecturas: LecturaEditable[] = (circuitosRes.data ?? []).map((c) => {
    const l = lecturasPorCircuito.get(c.id);
    return {
      circuitoId: c.id,
      numero: c.numero,
      texto: c.texto,
      ampNominal: c.amp_nominal ?? "",
      categoriaEquipo: c.categoria_equipo,
      tipoCircuito: c.tipo_circuito,
      estado: l?.estado ?? "",
      corrienteF: l?.corriente_f != null ? String(l.corriente_f) : "",
      corrienteR: l?.corriente_r != null ? String(l.corriente_r) : "",
      corrienteS: l?.corriente_s != null ? String(l.corriente_s) : "",
      corrienteT: l?.corriente_t != null ? String(l.corriente_t) : "",
      comentario: l?.comentario ?? "",
    };
  });

  const hallazgosPorItem = new Map((hallazgosRes.data ?? []).map((h) => [h.item_id, h]));
  const hallazgos = (catalogoHallazgosRes.data ?? []).map((h) => {
    const existente = hallazgosPorItem.get(h.id);
    return { itemId: h.id, texto: h.texto, estado: existente?.estado ?? null, comentario: existente?.comentario ?? "" };
  });

  return (
    <div>
      <EditarMedicionForm
        medicionId={id}
        numeroGeneracion={medicion.numero_generacion}
        tableroDenominacion={tableroRes.data.denominacion}
        ubicacionLabel={ubicacion ? [ubicacion.oficina, ubicacion.planta, ubicacion.sitio, ubicacion.localidad, ubicacion.provincia].filter(Boolean).join(" · ") : ""}
        tieneEnergia={tableroRes.data.subsistemas.includes("energia")}
        initialFecha={medicion.fecha}
        initialTipoEvento={medicion.tipo_evento}
        lecturas={lecturas}
        hallazgos={hallazgos}
      />
    </div>
  );
}
