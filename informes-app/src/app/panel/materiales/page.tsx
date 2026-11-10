import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MaterialesTabs } from "@/components/materiales/materiales-tabs";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";
import { construirConfigRecursoAltura } from "@/lib/equipos/recurso-altura";

export default async function PanelMaterialesPage() {
  await requireProfile();
  const supabase = await createClient();

  const [ubicaciones, provinciasRes, recursoAlturaRes, recursoAlturaBandasRes] = await Promise.all([
    fetchTodasLasUbicaciones(supabase),
    supabase.from("catalogo_provincias").select("nombre").order("nombre"),
    supabase.from("catalogo_recurso_altura").select("tipo_montaje, recurso_fijo"),
    supabase.from("catalogo_recurso_altura_bandas").select("tipo_montaje, altura_hasta_m, recurso"),
  ]);
  const recursoAlturaConfig = construirConfigRecursoAltura(recursoAlturaRes.data ?? [], recursoAlturaBandasRes.data ?? []);

  return (
    <div>
      <div className="panel-topbar">
        <div>
          <h1>Materiales</h1>
          <p>
            Buscá dónde quedó un equipo o un material del remito, o dalo de alta apenas lo sacás de depósito — antes de instalarlo,
            no después.
          </p>
        </div>
      </div>
      <MaterialesTabs ubicaciones={ubicaciones} provincias={(provinciasRes.data ?? []).map((p) => p.nombre)} recursoAlturaConfig={recursoAlturaConfig} />
    </div>
  );
}
