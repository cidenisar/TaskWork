import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { InformeTecnicoWizard } from "@/components/informe-tecnico/wizard";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";
import { construirConfigRecursoAltura } from "@/lib/equipos/recurso-altura";

export default async function NuevoInformePage() {
  await requireProfile();
  const supabase = await createClient();

  const [
    tiposRes,
    clientesRes,
    provinciasRes,
    ubicaciones,
    tecnicosRes,
    torresRes,
    vehiculosRes,
    emailsRes,
    hallazgosRes,
    recursoAlturaRes,
    recursoAlturaBandasRes,
  ] = await Promise.all([
    supabase.from("catalogo_tipos_informe").select("nombre").order("nombre"),
    supabase.from("catalogo_clientes").select("nombre").order("nombre"),
    supabase.from("catalogo_provincias").select("nombre").order("nombre"),
    fetchTodasLasUbicaciones(supabase),
    // El catálogo de técnicos ya no es una carga manual aparte: se arma con
    // los usuarios registrados (Configuración → Usuarios y roles).
    supabase.from("profiles").select("nombre_completo, torre").eq("activo", true).order("nombre_completo"),
    supabase.from("catalogo_torres").select("nombre").order("nombre"),
    supabase.from("catalogo_vehiculos").select("patente, marca_modelo").order("patente"),
    supabase.from("config_emails_envio").select("email, activo").eq("activo", true).order("email"),
    supabase.from("catalogo_inspeccion_ia").select("id, texto").eq("modulo", "informe_tecnico").order("orden"),
    supabase.from("catalogo_recurso_altura").select("tipo_montaje, recurso_fijo"),
    supabase.from("catalogo_recurso_altura_bandas").select("tipo_montaje, altura_hasta_m, recurso"),
  ]);
  const recursoAlturaConfig = construirConfigRecursoAltura(recursoAlturaRes.data ?? [], recursoAlturaBandasRes.data ?? []);

  return (
    <div>
      <InformeTecnicoWizard
        catalogos={{
          tiposInforme: (tiposRes.data ?? []).map((t) => t.nombre),
          clientes: (clientesRes.data ?? []).map((c) => c.nombre),
          provincias: (provinciasRes.data ?? []).map((p) => p.nombre),
          ubicaciones,
          tecnicos: (tecnicosRes.data ?? []).map((t) => ({ nombre: t.nombre_completo, torre: t.torre })),
          torres: (torresRes.data ?? []).map((t) => t.nombre),
          vehiculos: (vehiculosRes.data ?? []).map((v) => ({ patente: v.patente, marcaModelo: v.marca_modelo })),
          recursoAlturaConfig,
        }}
        catalogoHallazgos={hallazgosRes.data ?? []}
        emails={emailsRes.data ?? []}
      />
    </div>
  );
}
