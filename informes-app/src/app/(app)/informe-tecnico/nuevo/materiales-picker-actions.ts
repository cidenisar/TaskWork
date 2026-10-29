"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { CATEGORIA_EQUIPO_LABEL as EQUIPO_CATEGORIA_LABEL } from "@/components/equipos/types";
import { CATEGORIA_EQUIPO_LABEL as RACK_CATEGORIA_LABEL } from "@/components/racks/types";
import type { TipoEquipoBaja } from "@/lib/database.types";

export interface RackDeUbicacion {
  id: string;
  denominacion: string;
}

/** Racks ya registrados en el sitio elegido — para el selector "¿va dentro de un rack?" de Materiales. */
export async function listarRacksDeUbicacionAction(ubicacionId: string): Promise<RackDeUbicacion[]> {
  await requireProfile();
  if (!ubicacionId) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("racks").select("id, denominacion").eq("ubicacion_id", ubicacionId).order("denominacion");
  return data ?? [];
}

export interface EquipoParaReemplazo {
  id: string;
  tipo: TipoEquipoBaja;
  texto: string;
  detalle: string;
}

/**
 * Busca, dentro del mismo sitio, un equipo activo (suelto en `equipos`, o
 * de un rack en `rack_equipamientos`) para que el técnico marque "este
 * material nuevo reemplaza a aquel" — al guardar, dispara la baja
 * automática del viejo (ver ejecutarBaja). No busca en `tablero_circuitos`
 * a propósito: ese reemplazo específico ya lo cubre el módulo de Tableros.
 */
export async function buscarEquipoReemplazoAction(ubicacionId: string, query: string): Promise<EquipoParaReemplazo[]> {
  await requireProfile();
  const q = query.trim();
  if (!ubicacionId || q.length < 2) return [];
  const supabase = await createClient();
  const likeQ = `%${q.replace(/[%_]/g, "\\$&")}%`;

  const [equiposRes, racksRes] = await Promise.all([
    supabase
      .from("equipos")
      .select("id, texto, categoria_equipo, marca_modelo, numero_serie")
      .eq("ubicacion_id", ubicacionId)
      .eq("estado", "activo")
      .or(`texto.ilike.${likeQ},numero_serie.ilike.${likeQ},marca_modelo.ilike.${likeQ}`)
      .limit(10),
    supabase.from("racks").select("id, denominacion").eq("ubicacion_id", ubicacionId),
  ]);

  const racksIds = (racksRes.data ?? []).map((r) => r.id);
  const rackEquipamientosRes = racksIds.length
    ? await supabase
        .from("rack_equipamientos")
        .select("id, texto, categoria_equipo, marca_modelo, numero_serie, rack_id")
        .in("rack_id", racksIds)
        .eq("estado", "activo")
        .or(`texto.ilike.${likeQ},numero_serie.ilike.${likeQ},marca_modelo.ilike.${likeQ}`)
        .limit(10)
    : { data: [] };

  const rackNombrePorId = new Map((racksRes.data ?? []).map((r) => [r.id, r.denominacion]));

  const deEquipos: EquipoParaReemplazo[] = (equiposRes.data ?? []).map((e) => ({
    id: e.id,
    tipo: "equipo_individual",
    texto: e.texto,
    detalle:
      `${EQUIPO_CATEGORIA_LABEL[e.categoria_equipo]}` +
      (e.marca_modelo ? ` · ${e.marca_modelo}` : "") +
      (e.numero_serie ? ` · N° ${e.numero_serie}` : ""),
  }));
  const deRacks: EquipoParaReemplazo[] = (rackEquipamientosRes.data ?? []).map((e) => ({
    id: e.id,
    tipo: "rack_equipamiento",
    texto: e.texto,
    detalle:
      `${RACK_CATEGORIA_LABEL[e.categoria_equipo]} · rack ${rackNombrePorId.get(e.rack_id) ?? "—"}` +
      (e.marca_modelo ? ` · ${e.marca_modelo}` : ""),
  }));

  return [...deEquipos, ...deRacks].slice(0, 15);
}
