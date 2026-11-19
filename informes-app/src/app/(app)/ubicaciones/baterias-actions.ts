"use server";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { BateriaDestino, TipoFuenteBateria } from "@/lib/database.types";

/** Un rectificador o UPS ya cargado en el sitio, al que se puede vincular un banco de baterías. */
export interface FuenteBateriaOpcion {
  tipo: TipoFuenteBateria;
  id: string;
  /** Qué es: decide qué bancos se ofrecen automáticamente (banco de rectificador → rectificadores). */
  clase: BateriaDestino;
  label: string;
}

/**
 * Rectificadores y UPS activos de un sitio — los sueltos (`equipos`) y los
 * montados en un rack (`rack_equipamientos`) — para vincularles un banco al
 * darlo de alta. Lectura abierta a cualquier usuario autenticado (igual que
 * las tablas de origen), no hace falta service-role.
 */
export async function buscarFuentesDeBateriaAction(ubicacionId: string): Promise<FuenteBateriaOpcion[]> {
  await requireProfile();
  if (!ubicacionId || ubicacionId === "__new") return [];
  const supabase = await createClient();

  const [equiposRes, racksRes] = await Promise.all([
    supabase
      .from("equipos")
      .select("id, categoria_equipo, texto, marca_modelo, potencia_nominal")
      .eq("ubicacion_id", ubicacionId)
      .eq("estado", "activo")
      .in("categoria_equipo", ["ups", "fuente"])
      .order("texto"),
    supabase.from("racks").select("id, denominacion").eq("ubicacion_id", ubicacionId),
  ]);

  const opciones: FuenteBateriaOpcion[] = (equiposRes.data ?? []).map((e) => ({
    tipo: "equipo_individual",
    id: e.id,
    clase: e.categoria_equipo === "ups" ? "ups" : "rectificador",
    label: [e.categoria_equipo === "ups" ? "UPS" : "Rectificador", e.texto, e.marca_modelo, e.potencia_nominal].filter(Boolean).join(" · "),
  }));

  const racks = racksRes.data ?? [];
  if (racks.length > 0) {
    const denominacionPorRack = new Map(racks.map((r) => [r.id, r.denominacion]));
    const { data: enRacks } = await supabase
      .from("rack_equipamientos")
      .select("id, rack_id, categoria_equipo, texto, marca_modelo, potencia_nominal")
      .in("rack_id", racks.map((r) => r.id))
      .eq("estado", "activo")
      .in("categoria_equipo", ["ups", "rectificador"])
      .order("texto");
    for (const e of enRacks ?? []) {
      opciones.push({
        tipo: "rack_equipamiento",
        id: e.id,
        clase: e.categoria_equipo === "ups" ? "ups" : "rectificador",
        label:
          [e.categoria_equipo === "ups" ? "UPS" : "Rectificador", e.texto, e.marca_modelo, e.potencia_nominal].filter(Boolean).join(" · ") +
          ` (rack ${denominacionPorRack.get(e.rack_id) ?? "—"})`,
      });
    }
  }
  return opciones;
}
