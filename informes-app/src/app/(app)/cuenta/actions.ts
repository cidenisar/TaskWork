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

export interface ActualizarDatosAdicionalesResult {
  success: boolean;
  error?: string;
}

function campoTexto(formData: FormData, campo: string): string | null {
  const value = String(formData.get(campo) ?? "").trim();
  return value || null;
}

/**
 * Documentación personal, contacto de emergencia y talla de indumentaria
 * (spec futura — ver README). Todo opcional, todo autoeditable: ninguno de
 * estos campos está protegido por protect_profile_privileged_fields_trigger.
 */
export async function actualizarDatosAdicionalesAction(formData: FormData): Promise<ActualizarDatosAdicionalesResult> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({
      dni: campoTexto(formData, "dni"),
      dni_vencimiento: campoTexto(formData, "dniVencimiento"),
      fecha_nacimiento: campoTexto(formData, "fechaNacimiento"),
      factor_sanguineo: campoTexto(formData, "factorSanguineo"),
      licencia_conducir_vencimiento: campoTexto(formData, "licenciaConducirVencimiento"),
      email_alternativo: campoTexto(formData, "emailAlternativo"),
      contacto_emergencia_nombre: campoTexto(formData, "contactoEmergenciaNombre"),
      contacto_emergencia_telefono: campoTexto(formData, "contactoEmergenciaTelefono"),
      talla_camisa: campoTexto(formData, "tallaCamisa"),
      talla_pantalon: campoTexto(formData, "tallaPantalon"),
      talla_remera: campoTexto(formData, "tallaRemera"),
      talla_campera: campoTexto(formData, "tallaCampera"),
      talla_mameluco: campoTexto(formData, "tallaMameluco"),
      talla_botines: campoTexto(formData, "tallaBotines"),
    })
    .eq("id", profile.id);
  if (error) return { success: false, error: error.message };

  revalidatePath("/cuenta");
  return { success: true };
}
