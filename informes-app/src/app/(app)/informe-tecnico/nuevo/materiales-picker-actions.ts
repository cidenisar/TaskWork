"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { CATEGORIA_EQUIPO_LABEL as EQUIPO_CATEGORIA_LABEL } from "@/components/equipos/types";
import { CATEGORIA_EQUIPO_LABEL as RACK_CATEGORIA_LABEL } from "@/components/racks/types";
import type { EquipoCategoria, TipoEquipoBaja, TipoMontajeCamara } from "@/lib/database.types";

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

export interface MaterialPendienteDelSitio {
  id: string;
  categoriaEquipo: EquipoCategoria;
  descripcion: string;
  marcaModelo: string;
  numeroSerie: string;
  etiquetaYpf: string;
  cantidad: number;
  consumoPromedioW: number | null;
  consumoMaxW: number | null;
  tipoMontaje: TipoMontajeCamara | null;
  alturaMontajeM: number | null;
}

/**
 * Materiales que el propio técnico dio de alta (ver darDeAltaMaterialesAction
 * en panel/materiales/alta-actions.ts) para ESTE sitio y todavía no adjuntó a
 * ningún informe (`informe_instalacion_id is null`) — para no tener que
 * volver a tipear marca/modelo/serie de algo que ya se cargó al sacarlo de
 * depósito. Acotado al mismo sitio del informe (es ahí donde se va a
 * instalar) y a lo propio (mismo criterio que la pestaña Alta).
 */
export async function buscarMaterialesPendientesDelSitioAction(ubicacionId: string): Promise<MaterialPendienteDelSitio[]> {
  const profile = await requireProfile();
  if (!ubicacionId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("equipos")
    .select("id, categoria_equipo, texto, marca_modelo, numero_serie, etiqueta_ypf, cantidad, consumo_promedio_w, consumo_max_w, tipo_montaje, altura_montaje_m")
    .eq("ubicacion_id", ubicacionId)
    .eq("created_by", profile.id)
    .is("informe_instalacion_id", null)
    .eq("estado", "activo")
    .order("fecha_alta", { ascending: false });
  return (data ?? []).map((e) => ({
    id: e.id,
    categoriaEquipo: e.categoria_equipo,
    descripcion: e.texto,
    marcaModelo: e.marca_modelo ?? "",
    numeroSerie: e.numero_serie ?? "",
    etiquetaYpf: e.etiqueta_ypf ?? "",
    cantidad: e.cantidad,
    consumoPromedioW: e.consumo_promedio_w,
    consumoMaxW: e.consumo_max_w,
    tipoMontaje: e.tipo_montaje,
    alturaMontajeM: e.altura_montaje_m,
  }));
}
