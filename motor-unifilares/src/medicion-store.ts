/**
 * Acceso directo a tablero_mediciones (tabla de informes-app, mismo
 * proyecto de Supabase) desde el worker (scripts/procesar-cola.ts) — con la
 * service role key, el único caso en que motor-unifilares escribe en una
 * tabla que no es propia: cierra el circuito asincrónico sin que
 * informes-app tenga que volver a pedir el resultado por HTTP (ver
 * README.md "Generación asincrónica").
 */
import { clienteSupabase } from "./supabase-client.js";

export async function obtenerCreatedBy(medicionId: string): Promise<string> {
  const { data, error } = await clienteSupabase().from("tablero_mediciones").select("created_by").eq("id", medicionId).single();
  if (error || !data) throw new Error(`No se encontró la medición "${medicionId}": ${error?.message ?? "sin datos"}`);
  return (data as { created_by: string }).created_by;
}

export async function marcarUnifilarGenerando(medicionId: string): Promise<void> {
  const { error } = await clienteSupabase()
    .from("tablero_mediciones")
    .update({ unifilar_estado: "generando", unifilar_error: null })
    .eq("id", medicionId);
  if (error) throw new Error(`No se pudo marcar "generando" la medición "${medicionId}": ${error.message}`);
}

export async function marcarUnifilarError(medicionId: string, detalle: string): Promise<void> {
  const { error } = await clienteSupabase()
    .from("tablero_mediciones")
    .update({ unifilar_estado: "error", unifilar_error: detalle })
    .eq("id", medicionId);
  if (error) throw new Error(`No se pudo marcar "error" la medición "${medicionId}": ${error.message}`);
}

export async function guardarUnifilarListo(medicionId: string, dxfPath: string, pdfPath: string): Promise<void> {
  const { error } = await clienteSupabase()
    .from("tablero_mediciones")
    .update({ unifilar_estado: "listo", unifilar_error: null, dxf_url: dxfPath, unifilar_pdf_url: pdfPath })
    .eq("id", medicionId);
  if (error) throw new Error(`No se pudo guardar el resultado del unifilar de la medición "${medicionId}": ${error.message}`);
}
