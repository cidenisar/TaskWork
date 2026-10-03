import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EditarInformeTecnicoWizard } from "@/components/informe-tecnico/wizard-editar";
import type { Ubicacion } from "@/components/ubicaciones/types";

export default async function EditarInformePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();

  // RLS (informes_tecnicos_select_own) ya limita esto a informes propios.
  const { data: informe, error } = await supabase
    .from("informes_tecnicos")
    .select(
      "numero_generacion, titulo, fecha, cliente, proyecto, ticket_numero, tipo_informe, permiso_trabajo, provincia, ubicacion, ubicacion_id, descripcion_trabajo, tareas_pendientes",
    )
    .eq("id", id)
    .single();
  if (error || !informe) notFound();

  const [
    asignadosRes,
    vehiculosRes,
    imagenesCountRes,
    tiposRes,
    clientesRes,
    provinciasRes,
    ubicacionesRes,
    tecnicosRes,
    torresRes,
    vehiculosCatRes,
    configRes,
  ] = await Promise.all([
    supabase.from("informe_tecnicos_asignados").select("tecnico_nombre, torre, es_tecnico_seguridad").eq("informe_id", id),
    supabase.from("informe_vehiculos").select("patente, marca_modelo").eq("informe_id", id),
    supabase.from("informe_imagenes").select("id", { count: "exact", head: true }).eq("informe_id", id),
    supabase.from("catalogo_tipos_informe").select("nombre").order("nombre"),
    supabase.from("catalogo_clientes").select("nombre").order("nombre"),
    supabase.from("catalogo_provincias").select("nombre").order("nombre"),
    supabase.from("ubicaciones").select("id, pais, region, provincia, localidad, sitio, planta, oficina, lat, lng").order("sitio"),
    supabase.from("profiles").select("nombre_completo, torre").eq("activo", true).order("nombre_completo"),
    supabase.from("catalogo_torres").select("nombre").order("nombre"),
    supabase.from("catalogo_vehiculos").select("patente, marca_modelo").order("patente"),
    supabase.from("config_general").select("logo_empresa_url").eq("id", 1).single(),
  ]);

  const ubicaciones: Ubicacion[] = ubicacionesRes.data ?? [];
  // Si el informe ya tiene una Ubicación estructurada (ubicacion_id), se
  // preselecciona en el picker; si es un informe viejo (solo provincia/
  // ubicacion de texto libre), el picker arranca vacío y ese texto se deja
  // tal cual — no se fuerza a adivinar a qué Ubicación del catálogo nuevo
  // correspondería.
  const ubicacionActual = informe.ubicacion_id ? ubicaciones.find((u) => u.id === informe.ubicacion_id) : undefined;

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
          provinciaFiltro: ubicacionActual?.provincia ?? "",
          ubicacionId: ubicacionActual?.id ?? "",
          localidadNueva: "",
          sitioNueva: "",
          plantaNueva: "",
          oficinaNueva: "",
          gps: null,
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
          clientes: (clientesRes.data ?? []).map((c) => c.nombre),
          provincias: (provinciasRes.data ?? []).map((p) => p.nombre),
          ubicaciones,
          tecnicos: (tecnicosRes.data ?? []).map((t) => ({ nombre: t.nombre_completo, torre: t.torre })),
          torres: (torresRes.data ?? []).map((t) => t.nombre),
          vehiculos: (vehiculosCatRes.data ?? []).map((v) => ({ patente: v.patente, marcaModelo: v.marca_modelo })),
        }}
        logoUrl={configRes.data?.logo_empresa_url ?? null}
      />
    </div>
  );
}
