import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NuevoRelevamientoEquiposForm } from "@/components/equipos/nuevo-relevamiento-form";
import type { EquipoItem } from "@/components/equipos/types";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";
import { puedeGestionarDeposito } from "@/lib/types";
import type { ConfigRecursoAltura } from "@/lib/equipos/recurso-altura";

export default async function NuevoRelevamientoEquiposPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [equiposRes, ubicaciones, provinciasRes, recursoAlturaRes] = await Promise.all([
    supabase
      .from("equipos")
      .select(
        "id, ubicacion_id, categoria_equipo, texto, marca_modelo, numero_serie, etiqueta_ypf, cantidad, consumo_promedio_w, consumo_max_w, tipo_montaje, altura_montaje_m",
      )
      .eq("estado", "activo")
      .order("texto"),
    fetchTodasLasUbicaciones(supabase),
    supabase.from("catalogo_provincias").select("nombre").order("nombre"),
    supabase.from("catalogo_recurso_altura").select("tipo_montaje, recurso_fijo, umbral_escalera_m"),
  ]);

  const provincias = (provinciasRes.data ?? []).map((p) => p.nombre);
  const recursoAlturaConfig: ConfigRecursoAltura[] = (recursoAlturaRes.data ?? []).map((r) => ({
    tipoMontaje: r.tipo_montaje,
    recursoFijo: r.recurso_fijo,
    umbralEscaleraM: r.umbral_escalera_m,
  }));

  const equiposPorUbicacion = new Map<string, EquipoItem[]>();
  for (const e of equiposRes.data ?? []) {
    const lista = equiposPorUbicacion.get(e.ubicacion_id) ?? [];
    lista.push({
      id: e.id,
      categoriaEquipo: e.categoria_equipo,
      texto: e.texto,
      marcaModelo: e.marca_modelo ?? "",
      numeroSerie: e.numero_serie ?? "",
      etiquetaYpf: e.etiqueta_ypf ?? "",
      cantidad: e.cantidad,
      consumoPromedioW: e.consumo_promedio_w,
      consumoMaxW: e.consumo_max_w,
      tipoMontaje: e.tipo_montaje,
      alturaMontajeM: e.altura_montaje_m,
    });
    equiposPorUbicacion.set(e.ubicacion_id, lista);
  }
  const equiposExistentesPorUbicacion = Object.fromEntries(equiposPorUbicacion);

  return (
    <div>
      <NuevoRelevamientoEquiposForm
        ubicaciones={ubicaciones}
        provincias={provincias}
        equiposExistentesPorUbicacion={equiposExistentesPorUbicacion}
        puedeDeposito={puedeGestionarDeposito(profile.rol)}
        recursoAlturaConfig={recursoAlturaConfig}
      />
    </div>
  );
}
