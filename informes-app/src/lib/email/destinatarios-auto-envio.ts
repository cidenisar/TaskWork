import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Lista de destinatarios activos para el envío automático por mail — misma
 * configuración de Configuración → Emails de envío que ya usaba Informe
 * Técnico (interruptor `config_general.auto_enviar_email` + lista
 * `config_emails_envio`), ahora compartida por todos los módulos que
 * generan un PDF al crear/cerrar un registro (relevamientos de Tableros,
 * Racks, Equipos, Torres, Salas, Bajas y Entregas a Depósito, además de
 * Informe Técnico y Rendición de Gastos). Devuelve [] si el interruptor
 * está apagado, no hay ningún destinatario activo, o falta configurar
 * GMAIL_USER/GMAIL_APP_PASSWORD en el servidor — en cualquiera de esos
 * casos, el llamador simplemente no manda nada (nunca corta el flujo).
 */
export async function obtenerDestinatariosAutoEnvio(supabase: SupabaseClient<Database>): Promise<string[]> {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return [];

  const { data: config } = await supabase.from("config_general").select("auto_enviar_email").eq("id", 1).single();
  if (!config?.auto_enviar_email) return [];

  const { data: emails } = await supabase.from("config_emails_envio").select("email").eq("activo", true);
  return (emails ?? []).map((e) => e.email);
}
