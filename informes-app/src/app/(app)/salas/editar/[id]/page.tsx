import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EditarRelevamientoSalaForm } from "@/components/salas/editar-relevamiento-form";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";

/** Editar una sala ya relevada — solo Administrador (ver actions.ts). */
export default async function EditarSalaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const supabase = await createClient();

  // salas_select es abierta a cualquier autenticado — no hace falta service role para leer.
  const [salaRes, ubicaciones, provinciasRes] = await Promise.all([
    supabase
      .from("salas")
      .select("ubicacion_id, denominacion, tipo_construccion, numero_generacion, fotos_generales_urls, created_at")
      .eq("id", id)
      .single(),
    fetchTodasLasUbicaciones(supabase),
    supabase.from("catalogo_provincias").select("nombre").order("nombre"),
  ]);
  if (salaRes.error || !salaRes.data) notFound();
  const sala = salaRes.data;

  const ubicacionActual = ubicaciones.find((u) => u.id === sala.ubicacion_id);

  return (
    <div>
      <EditarRelevamientoSalaForm
        salaId={id}
        numeroGeneracion={sala.numero_generacion}
        cantidadFotos={sala.fotos_generales_urls?.length ?? 0}
        initialForm={{
          provinciaFiltro: ubicacionActual?.provincia ?? "",
          ubicacionId: ubicacionActual?.id ?? "",
          localidadNueva: "",
          sitioNueva: "",
          plantaNueva: "",
          oficinaNueva: "",
          gps: null,
          denominacion: sala.denominacion,
          tipoConstruccion: sala.tipo_construccion,
          // No hay columna "fecha" propia (ver crearSalaAction — nunca se
          // persistió separada de created_at), así que se precarga la de
          // alta; si se guarda, va solo al PDF nuevo, igual que al crear.
          fecha: sala.created_at.slice(0, 10),
        }}
        ubicaciones={ubicaciones}
        provincias={(provinciasRes.data ?? []).map((p) => p.nombre)}
      />
    </div>
  );
}
