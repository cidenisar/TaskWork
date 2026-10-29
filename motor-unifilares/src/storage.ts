/**
 * Subida directa al bucket "informes-pdf" de informes-app (mismo proyecto
 * de Supabase) — el worker (scripts/procesar-cola.ts) sube el DXF/PDF acá
 * mismo en vez de devolverlos en base64 por HTTP (ver README.md
 * "Generación asincrónica"). Mismo bucket y misma convención de ruta
 * (`${createdBy}/tableros/${medicionId}/unifilar.<ext>`) que usaba antes
 * unifilar-actions.ts del lado de informes-app.
 */
import { clienteSupabase } from "./supabase-client.js";

const BUCKET = "informes-pdf";

export async function subirArchivo(path: string, contenido: Buffer, contentType: string): Promise<void> {
  const { error } = await clienteSupabase().storage.from(BUCKET).upload(path, contenido, { contentType, upsert: true });
  if (error) throw new Error(`No se pudo subir "${path}" al storage: ${error.message}`);
}
