/**
 * Lectura compartida de las tablas de Guardia General — usada tanto por el
 * circuito del evento (`src/app/(app)/guardia/actions.ts`) como por las
 * pantallas de oficina (`src/app/panel/guardia/**\/actions.ts`). No es
 * "use server" porque no son Server Actions en sí, son helpers que las
 * Server Actions llaman.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Cronograma, CambioGuardia, PersonaGuardia, AreaGuardia } from "./cronograma";
import { AREAS_GUARDIA } from "./cronograma";
import type { ParametrosGuardia } from "./motor";

type Client = SupabaseClient<Database>;

export async function cargarCronograma(supabase: Client): Promise<Cronograma> {
  const { data: rows } = await supabase.from("guardia_cronograma_semana").select("semana_inicio, area, usuario_id");
  const cronograma: Cronograma = {};
  for (const r of rows ?? []) {
    (cronograma[r.semana_inicio] ??= {})[r.area as AreaGuardia] = r.usuario_id;
  }
  return cronograma;
}

export async function cargarCambiosAceptados(supabase: Client): Promise<CambioGuardia[]> {
  const { data: rows } = await supabase
    .from("guardia_cambio")
    .select("id, area, persona_id, original_id, desde, hasta, estado")
    .eq("estado", "aceptado");
  return (rows ?? []).map((c) => ({
    id: c.id,
    area: c.area as AreaGuardia,
    persona: c.persona_id,
    original: c.original_id,
    desde: c.desde,
    hasta: c.hasta,
    estado: "aceptado",
  }));
}

export async function cargarPersonas(supabase: Client): Promise<PersonaGuardia[]> {
  const { data: rows } = await supabase.from("guardia_persona").select("usuario_id, area, orden");
  return (rows ?? []).map((p) => ({ id: p.usuario_id, area: p.area as AreaGuardia, orden: p.orden }));
}

/** Parámetros completos del motor de activaciones, tal como están guardados ahora mismo (fila única `id = 1`). */
export async function cargarParametros(supabase: Client): Promise<ParametrosGuardia & { cambioMin: number }> {
  const { data: config } = await supabase
    .from("guardia_config")
    .select("entrada_min, salida_activacion_min, madrugada_hasta_min, tope_media_min, valor_media, valor_entera, cambio_min")
    .eq("id", 1)
    .single();
  return {
    entradaMin: config?.entrada_min ?? 450,
    salidaActivacionMin: config?.salida_activacion_min ?? 1020,
    madrugadaHastaMin: config?.madrugada_hasta_min ?? 450,
    topeMediaMin: config?.tope_media_min ?? 270,
    valorMedia: config?.valor_media ?? 50,
    valorEntera: config?.valor_entera ?? 100,
    cambioMin: config?.cambio_min ?? 600,
  };
}

/** El área de guardia de ESTE usuario (null = no hace ninguna) — para armar su `ContextoGuardia` en cada Server Action, nunca confiando en lo que mande el cliente. */
export async function cargarAreaDe(supabase: Client, usuarioId: string): Promise<AreaGuardia | null> {
  const { data } = await supabase.from("guardia_persona").select("area").eq("usuario_id", usuarioId).maybeSingle();
  return (data?.area as AreaGuardia | undefined) ?? null;
}

/** Nombre del grupo de WhatsApp al que se avisan las novedades — solo para mostrarlo en pantalla (un link wa.me no puede apuntar a un grupo), ver Parámetros. */
export async function cargarGrupoWhatsappNombre(supabase: Client): Promise<string> {
  const { data } = await supabase.from("guardia_config").select("grupo_whatsapp_nombre").eq("id", 1).single();
  return data?.grupo_whatsapp_nombre ?? "Novedades Guardia TI Cuyo";
}

export { AREAS_GUARDIA };
