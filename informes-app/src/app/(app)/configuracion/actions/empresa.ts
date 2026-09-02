"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";

export interface ConfigActionResult {
  success: boolean;
  error?: string;
}

const LOGO_PATH = "empresa-logo";

export async function subirLogoAction(formData: FormData): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Elegí una imagen." };
  }

  const supabase = await createClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from("logo-empresa")
    .upload(LOGO_PATH, buffer, { contentType: file.type || "image/png", upsert: true });
  if (upErr) return { success: false, error: `No se pudo subir el logo: ${upErr.message}` };

  const { data: pub } = supabase.storage.from("logo-empresa").getPublicUrl(LOGO_PATH);
  // cache-bust: el bucket es público y la URL siempre es la misma, así que agregamos
  // un query param con la hora para que <img> no muestre el logo anterior en caché.
  const url = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: updErr } = await supabase.from("config_general").update({ logo_empresa_url: url }).eq("id", 1);
  if (updErr) return { success: false, error: `No se pudo guardar el logo: ${updErr.message}` };

  await logAudit(supabase, profile, "Actualizó el logo de la empresa");
  revalidatePath("/", "layout");
  return { success: true };
}

export async function quitarLogoAction(): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();

  await supabase.storage.from("logo-empresa").remove([LOGO_PATH]);
  const { error } = await supabase.from("config_general").update({ logo_empresa_url: null }).eq("id", 1);
  if (error) return { success: false, error: error.message };

  await logAudit(supabase, profile, "Quitó el logo de la empresa");
  revalidatePath("/", "layout");
  return { success: true };
}
