import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NuevoRelevamientoEquiposForm } from "@/components/equipos/nuevo-relevamiento-form";
import type { EquipoItem } from "@/components/equipos/types";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";

export default async function NuevoRelevamientoEquiposPage() {
  await requireProfile();
  const supabase = await createClient();

  const [equiposRes, ubicaciones, provinciasRes] = await Promise.all([
    supabase
      .from("equipos")
      .select("id, ubicacion_id, categoria_equipo, texto, marca_modelo, numero_serie, etiqueta_ypf, cantidad, consumo_promedio_w, consumo_max_w")
      .neq("estado", "baja")
      .order("texto"),
    fetchTodasLasUbicaciones(supabase),
    supabase.from("catalogo_provincias").select("nombre").order("nombre"),
  ]);

  const provincias = (provinciasRes.data ?? []).map((p) => p.nombre);

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
      />
    </div>
  );
}
