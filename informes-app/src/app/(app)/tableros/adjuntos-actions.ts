"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireAdmin } from "@/lib/auth";

export interface AdjuntoActionResult {
  success: boolean;
  error?: string;
}

/** Tope generoso — esto son documentos de referencia (planos, fotos del gabinete), no algo que se cargue en cantidad. */
const ADJUNTO_TAMANO_MAX_MB = 25;

function revalidarFicha() {
  revalidatePath("/ubicaciones/[id]", "page");
}

/**
 * Sube un archivo suelto a un tablero (un unifilar propio hecho afuera, un
 * PDF, una foto del gabinete) — no reemplaza el unifilar en vivo ni el DXF
 * que ya genera "Nueva Medición", se suma como material de referencia.
 * Cualquier técnico logueado puede agregar (mismo criterio que las fotos
 * generales de una medición).
 */
export async function subirAdjuntoTableroAction(tableroId: string, formData: FormData): Promise<AdjuntoActionResult> {
  const profile = await requireProfile();
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { success: false, error: "Elegí un archivo." };
  if (archivo.size > ADJUNTO_TAMANO_MAX_MB * 1024 * 1024) {
    return { success: false, error: `El archivo no puede pesar más de ${ADJUNTO_TAMANO_MAX_MB} MB.` };
  }

  const supabase = await createClient();
  const nombreOriginal = archivo.name || "archivo";
  const path = `tablero-adjuntos/${tableroId}/${crypto.randomUUID()}-${nombreOriginal}`;
  const buffer = Buffer.from(await archivo.arrayBuffer());
  const { error: upError } = await supabase.storage
    .from("informes-pdf")
    .upload(path, buffer, { contentType: archivo.type || "application/octet-stream" });
  if (upError) return { success: false, error: upError.message };

  const { error } = await supabase
    .from("tablero_adjuntos")
    .insert({ tablero_id: tableroId, nombre: nombreOriginal, archivo_url: path, created_by: profile.id });
  if (error) {
    await supabase.storage.from("informes-pdf").remove([path]);
    return { success: false, error: error.message };
  }

  revalidarFicha();
  return { success: true };
}

/** Borrar un adjunto es admin-only — mismo criterio que el resto de lo que un técnico carga y que requiere corrección (checklist, mediciones). */
export async function eliminarAdjuntoTableroAction(adjuntoId: string): Promise<AdjuntoActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: adjunto } = await supabase.from("tablero_adjuntos").select("archivo_url").eq("id", adjuntoId).single();
  if (!adjunto) return { success: false, error: "No se encontró el adjunto." };

  await supabase.storage.from("informes-pdf").remove([adjunto.archivo_url]);
  const { error } = await supabase.from("tablero_adjuntos").delete().eq("id", adjuntoId);
  if (error) return { success: false, error: error.message };

  revalidarFicha();
  return { success: true };
}
