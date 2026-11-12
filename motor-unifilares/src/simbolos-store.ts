/**
 * La librería de símbolos (ver src/dxf-import.ts y public/simbolos.html)
 * vive en motor_unifilares_simbolos, tabla propia del mismo proyecto de
 * Supabase que usa informes-app — mismo criterio que ejemplos-store.ts:
 * tabla aparte, RLS habilitado sin políticas, solo accesible con la
 * service role key.
 */
import { clienteSupabase } from "./supabase-client.js";
import type { DrawCommand, Simbolo } from "./types.js";

interface FilaSimbolo {
  nombre: string;
  descripcion: string;
  commands: DrawCommand[];
  ancho: number;
  alto: number;
}

export async function listarSimbolos(): Promise<Simbolo[]> {
  const { data, error } = await clienteSupabase().from("motor_unifilares_simbolos").select("nombre, descripcion, commands, ancho, alto").order("nombre");
  if (error) throw new Error(`No se pudo leer la librería de símbolos: ${error.message}`);
  return (data as FilaSimbolo[] | null) ?? [];
}

/** Crea o reemplaza (por nombre) uno o más símbolos ya revisados — se guardan de a varios cuando se importa un DXF con múltiples bloques confirmados a la vez. */
export async function guardarSimbolos(simbolos: Simbolo[]): Promise<void> {
  if (simbolos.length === 0) return;
  const filas = simbolos.map((s) => ({ nombre: s.nombre, descripcion: s.descripcion, commands: s.commands, ancho: s.ancho, alto: s.alto, actualizado_en: new Date().toISOString() }));
  const { error } = await clienteSupabase().from("motor_unifilares_simbolos").upsert(filas, { onConflict: "nombre" });
  if (error) throw new Error(`No se pudo guardar la librería de símbolos: ${error.message}`);
}

export async function eliminarSimbolo(nombre: string): Promise<void> {
  const { error } = await clienteSupabase().from("motor_unifilares_simbolos").delete().eq("nombre", nombre);
  if (error) throw new Error(`No se pudo eliminar el símbolo "${nombre}": ${error.message}`);
}
