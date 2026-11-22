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
 *
 * Se busca en TODAS las plantas/oficinas del mismo sitio (cada sala o shelter
 * relevado vive en su propia fila de ubicación, con su nombre como oficina):
 * el banco suele estar en una sala y el rectificador en otra, así que mirar
 * solo la fila elegida no los encontraría.
 */
export async function buscarFuentesDeBateriaAction(ubicacionId: string): Promise<FuenteBateriaOpcion[]> {
  await requireProfile();
  if (!ubicacionId || ubicacionId === "__new") return [];
  const supabase = await createClient();

  const { data: elegida } = await supabase.from("ubicaciones").select("provincia, localidad, sitio").eq("id", ubicacionId).maybeSingle();
  if (!elegida) return [];
  const { data: hermanas } = await supabase
    .from("ubicaciones")
    .select("id, planta, oficina")
    .eq("provincia", elegida.provincia)
    .eq("sitio", elegida.sitio);
  const filas = hermanas ?? [{ id: ubicacionId, planta: null, oficina: null }];
  const ubicacionIds = filas.map((h) => h.id);
  const lugarPorId = new Map(filas.map((h) => [h.id, [h.oficina, h.planta].filter(Boolean).join(" · ")]));
  const hayVarias = filas.length > 1;

  const [equiposRes, racksRes] = await Promise.all([
    supabase
      .from("equipos")
      .select("id, categoria_equipo, texto, marca_modelo, potencia_nominal, ubicacion_id")
      .in("ubicacion_id", ubicacionIds)
      .eq("estado", "activo")
      .in("categoria_equipo", ["ups", "fuente"])
      .order("texto"),
    supabase.from("racks").select("id, denominacion, ubicacion_id").in("ubicacion_id", ubicacionIds),
  ]);

  const opciones: FuenteBateriaOpcion[] = (equiposRes.data ?? []).map((e) => ({
    tipo: "equipo_individual",
    id: e.id,
    clase: e.categoria_equipo === "ups" ? "ups" : "rectificador",
    label:
      [e.categoria_equipo === "ups" ? "UPS" : "Rectificador", e.texto, e.marca_modelo, e.potencia_nominal].filter(Boolean).join(" · ") +
      (hayVarias && lugarPorId.get(e.ubicacion_id) ? ` (${lugarPorId.get(e.ubicacion_id)})` : ""),
  }));

  const racks = racksRes.data ?? [];
  if (racks.length > 0) {
    const denominacionPorRack = new Map(racks.map((r) => [r.id, r.denominacion]));
    const ubicacionPorRack = new Map(racks.map((r) => [r.id, r.ubicacion_id]));
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
          ` (rack ${denominacionPorRack.get(e.rack_id) ?? "—"}${hayVarias && lugarPorId.get(ubicacionPorRack.get(e.rack_id) ?? "") ? ` · ${lugarPorId.get(ubicacionPorRack.get(e.rack_id) ?? "")}` : ""})`,
      });
    }
  }
  return opciones;
}
