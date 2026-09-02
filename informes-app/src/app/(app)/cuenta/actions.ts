"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";

export interface ActualizarPerfilResult {
  success: boolean;
  error?: string;
  fotoPerfilUrl?: string | null;
}

const FOTO_PATH_PREFIX = "foto";

export async function actualizarDatosPersonalesAction(formData: FormData): Promise<ActualizarPerfilResult> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const nombreCompleto = String(formData.get("nombreCompleto") ?? "").trim();
  const telefono = String(formData.get("telefono") ?? "").trim();
  if (!nombreCompleto) return { success: false, error: "El nombre no puede quedar vacío." };

  let fotoPerfilUrl: string | null | undefined;
  const foto = formData.get("foto");
  if (foto instanceof File && foto.size > 0) {
    const buffer = Buffer.from(await foto.arrayBuffer());
    const path = `${profile.id}/${FOTO_PATH_PREFIX}`;
    const { error: upErr } = await supabase.storage
      .from("fotos-perfil")
      .upload(path, buffer, { contentType: foto.type || "image/jpeg", upsert: true });
    if (upErr) return { success: false, error: `No se pudo subir la foto: ${upErr.message}` };

    const { data: pub } = supabase.storage.from("fotos-perfil").getPublicUrl(path);
    fotoPerfilUrl = `${pub.publicUrl}?v=${Date.now()}`;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      nombre_completo: nombreCompleto,
      telefono: telefono || null,
      ...(fotoPerfilUrl !== undefined ? { foto_perfil_url: fotoPerfilUrl } : {}),
    })
    .eq("id", profile.id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/", "layout");
  return { success: true, fotoPerfilUrl };
}
