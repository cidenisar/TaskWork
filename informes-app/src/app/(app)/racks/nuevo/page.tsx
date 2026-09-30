import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NuevoRelevamientoForm } from "@/components/racks/nuevo-relevamiento-form";
import type { RackConEquipamiento } from "@/components/racks/types";

export default async function NuevoRelevamientoPage() {
  await requireProfile();
  const supabase = await createClient();

  const [racksRes, equipamientosRes] = await Promise.all([
    supabase.from("racks").select("id, denominacion, sitio").order("denominacion"),
    supabase
      .from("rack_equipamientos")
      .select("id, rack_id, numero, categoria_equipo, texto, marca_modelo, posicion_u, cantidad")
      .order("numero"),
  ]);

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
    });
    equipamientoPorRack.set(e.rack_id, lista);
  }

  const racks: RackConEquipamiento[] = (racksRes.data ?? []).map((r) => ({
    id: r.id,
    denominacion: r.denominacion,
    sitio: r.sitio,
    equipamiento: equipamientoPorRack.get(r.id) ?? [],
  }));

  return (
    <div>
      <NuevoRelevamientoForm racks={racks} />
    </div>
  );
}
