import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NuevoRelevamientoEquiposForm } from "@/components/equipos/nuevo-relevamiento-form";
import type { Ubicacion } from "@/components/ubicaciones/types";
import type { EquipoItem } from "@/components/equipos/types";

export default async function NuevoRelevamientoEquiposPage() {
  await requireProfile();
  const supabase = await createClient();

  const [equiposRes, ubicacionesRes, provinciasRes] = await Promise.all([
    supabase.from("equipos").select("id, ubicacion_id, categoria_equipo, texto, marca_modelo, numero_serie, cantidad").order("texto"),
    supabase.from("ubicaciones").select("id, pais, region, provincia, localidad, sitio, planta, oficina, lat, lng").order("sitio"),
    supabase.from("catalogo_provincias").select("nombre").order("nombre"),
  ]);

  const ubicaciones: Ubicacion[] = ubicacionesRes.data ?? [];
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
      cantidad: e.cantidad,
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
