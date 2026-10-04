import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NuevoRelevamientoForm } from "@/components/racks/nuevo-relevamiento-form";
import { labelUbicacion } from "@/components/ubicaciones/types";
import type { RackConEquipamiento } from "@/components/racks/types";
import { fetchTodasLasUbicaciones } from "@/lib/ubicaciones/fetch-todas";

export default async function NuevoRelevamientoPage() {
  await requireProfile();
  const supabase = await createClient();

  const [racksRes, equipamientosRes, ubicaciones, provinciasRes] = await Promise.all([
    supabase.from("racks").select("id, denominacion, ubicacion_id").order("denominacion"),
    supabase
      .from("rack_equipamientos")
      .select("id, rack_id, numero, categoria_equipo, texto, marca_modelo, posicion_u, cantidad, consumo_estimado_w")
      .order("numero"),
    fetchTodasLasUbicaciones(supabase),
    supabase.from("catalogo_provincias").select("nombre").order("nombre"),
  ]);

  const ubicacionesPorId = new Map(ubicaciones.map((u) => [u.id, u]));
  const provincias = (provinciasRes.data ?? []).map((p) => p.nombre);

  const equipamientoPorRack = new Map<string, RackConEquipamiento["equipamiento"]>();
  for (const e of equipamientosRes.data ?? []) {
    const lista = equipamientoPorRack.get(e.rack_id) ?? [];
    lista.push({
      id: e.id,
      numero: e.numero,
      categoriaEquipo: e.categoria_equipo,
      texto: e.texto,
      marcaModelo: e.marca_modelo ?? "",
      posicionU: e.posicion_u ?? "",
      cantidad: e.cantidad,
      consumoEstimadoW: e.consumo_estimado_w,
    });
    equipamientoPorRack.set(e.rack_id, lista);
  }

  const racks: RackConEquipamiento[] = (racksRes.data ?? [])
    .map((r) => {
      const ubicacion = ubicacionesPorId.get(r.ubicacion_id);
      if (!ubicacion) return null;
      return {
        id: r.id,
        denominacion: r.denominacion,
        ubicacionId: r.ubicacion_id,
        ubicacionLabel: labelUbicacion(ubicacion),
        equipamiento: equipamientoPorRack.get(r.id) ?? [],
      };
    })
    .filter((r): r is RackConEquipamiento => r !== null);

  return (
    <div>
      <NuevoRelevamientoForm racks={racks} ubicaciones={ubicaciones} provincias={provincias} />
    </div>
  );
}
