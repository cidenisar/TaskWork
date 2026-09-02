import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EditarInformeTecnicoWizard } from "@/components/informe-tecnico/wizard-editar";

export default async function EditarInformePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();

  // RLS (informes_tecnicos_select_own) ya limita esto a informes propios.
  const { data: informe, error } = await supabase
    .from("informes_tecnicos")
    .select(
      "numero_generacion, titulo, fecha, cliente, proyecto, ticket_numero, tipo_informe, permiso_trabajo, provincia, ubicacion, descripcion_trabajo, tareas_pendientes",
    )
    .eq("id", id)
    .single();
  if (error || !informe) notFound();

  const [asignadosRes, vehiculosRes, imagenesCountRes, tiposRes, provinciasRes, tecnicosRes, torresRes, vehiculosCatRes, configRes] =
    await Promise.all([
      supabase.from("informe_tecnicos_asignados").select("tecnico_nombre, torre, es_tecnico_seguridad").eq("informe_id", id),
      supabase.from("informe_vehiculos").select("patente, marca_modelo").eq("informe_id", id),
      supabase.from("informe_imagenes").select("id", { count: "exact", head: true }).eq("informe_id", id),
      supabase.from("catalogo_tipos_informe").select("nombre").order("nombre"),
      supabase.from("catalogo_provincias").select("nombre").order("nombre"),
      supabase.from("profiles").select("nombre_completo, torre").order("nombre_completo"),
      supabase.from("catalogo_torres").select("nombre").order("nombre"),
      supabase.from("catalogo_vehiculos").select("patente, marca_modelo").order("patente"),
      supabase.from("config_general").select("logo_empresa_url").eq("id", 1).single(),
    ]);

  return (
    <div>
      <EditarInformeTecnicoWizard
        informeId={id}
        numeroGeneracion={informe.numero_generacion}
        cantidadFotos={imagenesCountRes.count ?? 0}
        initialForm={{
          titulo: informe.titulo,
          fecha: informe.fecha,
          cliente: informe.cliente,
          proyecto: informe.proyecto,
          ticketNumero: informe.ticket_numero ?? "",
          tipoInforme: informe.tipo_informe ?? "",
          tipoInformeNuevo: "",
          permisoTrabajo: informe.permiso_trabajo ?? "",
          provincia: informe.provincia ?? "",
          ubicacion: informe.ubicacion ?? "",
          descripcionTrabajo: informe.descripcion_trabajo ?? "",
          tareasPendientes: informe.tareas_pendientes ?? "",
        }}
        initialTecnicos={(asignadosRes.data ?? []).map((t) => ({
          nombre: t.tecnico_nombre,
          torre: t.torre ?? "",
          esSeguridad: t.es_tecnico_seguridad,
        }))}
        initialVehiculos={(vehiculosRes.data ?? []).map((v) => ({
          patente: v.patente,
          marcaModelo: v.marca_modelo ?? "",
        }))}
        catalogos={{
          tiposInforme: (tiposRes.data ?? []).map((t) => t.nombre),
          provincias: (provinciasRes.data ?? []).map((p) => p.nombre),
          tecnicos: (tecnicosRes.data ?? []).map((t) => ({ nombre: t.nombre_completo, torre: t.torre })),
          torres: (torresRes.data ?? []).map((t) => t.nombre),
          vehiculos: (vehiculosCatRes.data ?? []).map((v) => ({ patente: v.patente, marcaModelo: v.marca_modelo })),
        }}
        logoUrl={configRes.data?.logo_empresa_url ?? null}
      />
    </div>
  );
}
