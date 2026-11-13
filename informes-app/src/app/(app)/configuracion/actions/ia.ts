"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { logAudit } from "@/lib/config/audit";
import type { ConfigIaRow, ModoIa } from "@/lib/database.types";
import type { ConfigActionResult } from "./empresa";

type CampoIa = "claude_activo" | "cloudflare_activo" | "groq_activo" | "openrouter_activo" | "nvidia_activo" | "modo";

const NOMBRE_CAMPO: Record<CampoIa, string> = {
  claude_activo: "Claude",
  cloudflare_activo: "Cloudflare",
  groq_activo: "Groq",
  openrouter_activo: "OpenRouter",
  nvidia_activo: "NVIDIA",
  modo: "Modo",
};

/**
 * Cambia UN interruptor (o el modo) de Configuración → IA. Solo Superusuario
 * (también lo exige la RLS de config_ia). Deja historial con valor anterior.
 */
export async function cambiarConfigIaAction(campo: CampoIa, valor: boolean | ModoIa): Promise<ConfigActionResult> {
  const profile = await requireProfile();
  if (profile.rol !== "superusuario") return { success: false, error: "Solo el Superusuario puede cambiar las IAs." };
  if (!(campo in NOMBRE_CAMPO)) return { success: false, error: "Campo inválido." };
  if (campo === "modo" ? valor !== "combinada" && valor !== "en_orden" : typeof valor !== "boolean") {
    return { success: false, error: "Valor inválido." };
  }

  const supabase = await createClient();
  const { data: actual, error: errLeer } = await supabase.from("config_ia").select("*").eq("id", 1).single();
  if (errLeer || !actual) return { success: false, error: "No se pudo leer la configuración de IA." };

  const antes = (actual as ConfigIaRow)[campo];
  if (antes === valor) return { success: true };

  const cambio: Partial<ConfigIaRow> = { updated_at: new Date().toISOString(), updated_by: profile.id };
  if (campo === "modo") cambio.modo = valor as ModoIa;
  else cambio[campo] = valor as boolean;
  const { error } = await supabase.from("config_ia").update(cambio).eq("id", 1);
  if (error) return { success: false, error: error.message };

  await supabase.from("config_ia_hist").insert({
    campo,
    valor_antes: String(antes),
    valor_despues: String(valor),
    quien: profile.id,
  });

  const texto =
    campo === "modo"
      ? `Cambió el modo de IA a "${valor === "combinada" ? "Combinada" : "En orden"}"`
      : `${valor ? "Prendió" : "Apagó"} la IA ${NOMBRE_CAMPO[campo]}`;
  await logAudit(supabase, profile, texto);
  revalidatePath("/configuracion/ia");
  return { success: true };
}
