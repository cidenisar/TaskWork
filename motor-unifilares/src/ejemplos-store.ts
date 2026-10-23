/**
 * Los ejemplos enseñados (ver src/ensenar.ts) viven en una tabla propia
 * (motor_unifilares_ejemplos) del mismo proyecto de Supabase que usa
 * informes-app — tabla aparte, sin acoplar código entre las dos apps.
 * Se accede SIEMPRE con la service role key (nunca con una key pública):
 * la tabla tiene RLS habilitado sin políticas, así que el anon/authenticated
 * key de informes-app no puede leerla ni escribirla — solo este servicio.
 */
import { createClient } from "@supabase/supabase-js";
import type { DrawCommand, Ejemplo } from "./types.js";

function clienteSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno (ver README.md).");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

interface FilaEjemplo {
  tag: string;
  cuando_aplica: string;
  commands: DrawCommand[];
}

export async function listarEjemplos(): Promise<Ejemplo[]> {
  const { data, error } = await clienteSupabase().from("motor_unifilares_ejemplos").select("tag, cuando_aplica, commands").order("tag");
  if (error) throw new Error(`No se pudieron leer los ejemplos enseñados: ${error.message}`);
  return (data as FilaEjemplo[] | null ?? []).map((fila) => ({ tag: fila.tag, cuandoAplica: fila.cuando_aplica, commands: fila.commands }));
}

/** Crea o reemplaza (por tag) un ejemplo ya validado. */
export async function guardarEjemplo(ejemplo: Ejemplo): Promise<void> {
  const { error } = await clienteSupabase()
    .from("motor_unifilares_ejemplos")
    .upsert({ tag: ejemplo.tag, cuando_aplica: ejemplo.cuandoAplica, commands: ejemplo.commands }, { onConflict: "tag" });
  if (error) throw new Error(`No se pudo guardar el ejemplo "${ejemplo.tag}": ${error.message}`);
}

export async function eliminarEjemplo(tag: string): Promise<void> {
  const { error } = await clienteSupabase().from("motor_unifilares_ejemplos").delete().eq("tag", tag);
  if (error) throw new Error(`No se pudo eliminar el ejemplo "${tag}": ${error.message}`);
}
