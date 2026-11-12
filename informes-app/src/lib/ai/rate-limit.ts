import type { createClient } from "@/lib/supabase/server";

/**
 * Tope de uso de IA por usuario — reusa `ia_uso` (ya loguea cada llamada con
 * `created_by`/`created_at` para Configuración → Uso de IA) en vez de sumar
 * infraestructura nueva (Redis/Upstash). No es para frenar a un técnico con
 * un uso normal — una ventana corta generosa cubre leer varias fotos
 * seguidas en un mismo relevamiento — es para cortar un script/loop que
 * golpee el endpoint sin parar, porque cada llamada gasta crédito real de
 * la cuenta de Anthropic (ver CRITERIOS_Y_IDEAS.md §27.4).
 */
const VENTANA_CORTA_MIN = 5;
const MAX_EN_VENTANA_CORTA = 20;
const VENTANA_LARGA_MIN = 24 * 60;
const MAX_EN_VENTANA_LARGA = 150;

export type ResultadoLimiteIa = { permitido: true } | { permitido: false; error: string };

async function contarLlamadas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  desde: string,
): Promise<number> {
  const { count } = await supabase
    .from("ia_uso")
    .select("id", { count: "exact", head: true })
    .eq("created_by", userId)
    .gte("created_at", desde);
  return count ?? 0;
}

/**
 * Chequear ANTES de llamar a la IA (no después) — si el chequeo mismo falla
 * (ej. la tabla no está disponible), no bloquea al técnico por un problema
 * nuestro: deja pasar la llamada en vez de romper su flujo de trabajo.
 */
export async function verificarLimiteIa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<ResultadoLimiteIa> {
  try {
    const desdeCorta = new Date(Date.now() - VENTANA_CORTA_MIN * 60_000).toISOString();
    if ((await contarLlamadas(supabase, userId, desdeCorta)) >= MAX_EN_VENTANA_CORTA) {
      return {
        permitido: false,
        error: "Hiciste muchas lecturas con IA en poco tiempo — esperá unos minutos y probá de nuevo.",
      };
    }

    const desdeLarga = new Date(Date.now() - VENTANA_LARGA_MIN * 60_000).toISOString();
    if ((await contarLlamadas(supabase, userId, desdeLarga)) >= MAX_EN_VENTANA_LARGA) {
      return {
        permitido: false,
        error: "Llegaste al límite diario de lecturas con IA — probá de nuevo más tarde o avisá a un Administrador.",
      };
    }

    return { permitido: true };
  } catch {
    return { permitido: true };
  }
}
