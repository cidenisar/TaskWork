"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import type { ConfigActionResult } from "./empresa";

export async function setAutoEnviarEmailAction(activo: boolean): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("config_general").update({ auto_enviar_email: activo }).eq("id", 1);
  if (error) return { success: false, error: error.message };
  await logAudit(supabase, profile, `${activo ? "Activó" : "Desactivó"} el envío automático por email`);
  revalidatePath("/configuracion");
  return { success: true };
}

export async function addEmailAction(email: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const value = email.trim().toLowerCase();
  if (!value || !value.includes("@")) return { success: false, error: "Ingresá un email válido." };

  const supabase = await createClient();
  const { error } = await supabase.from("config_emails_envio").insert({ email: value, activo: true });
  if (error) {
    return { success: false, error: error.code === "23505" ? "Ese email ya está agregado." : error.message };
  }
  await logAudit(supabase, profile, `Agregó "${value}" a los destinatarios de email`);
  revalidatePath("/configuracion");
  revalidatePath("/informe-tecnico/nuevo");
  return { success: true };
}

export async function removeEmailAction(id: string, email: string): Promise<ConfigActionResult> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("config_emails_envio").delete().eq("id", id);
  if (error) return { success: false, error: error.message };
  await logAudit(supabase, profile, `Quitó "${email}" de los destinatarios de email`);
  revalidatePath("/configuracion");
  revalidatePath("/informe-tecnico/nuevo");
  return { success: true };
}
