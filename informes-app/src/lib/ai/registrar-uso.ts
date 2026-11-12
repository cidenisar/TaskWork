import type { createClient } from "@/lib/supabase/server";
import { calcularCostoUsd } from "./pricing";

/**
 * Deja un registro del consumo real de tokens de una llamada a la IA, para
 * poder ver el gasto estimado por módulo/día en Configuración → Uso de IA
 * en vez de solo adivinarlo. Best-effort: un fallo acá nunca debe romper la
 * respuesta real al técnico que está esperando el resultado de su foto.
 */
export async function registrarUsoIa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    endpoint: string;
    modulo: string;
    modelo: string;
    inputTokens: number;
    outputTokens: number;
    userId: string;
  },
) {
  try {
    await supabase.from("ia_uso").insert({
      endpoint: params.endpoint,
      modulo: params.modulo,
      modelo: params.modelo,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      costo_estimado_usd: calcularCostoUsd(params.modelo, params.inputTokens, params.outputTokens),
      created_by: params.userId,
    });
  } catch {
    // el registro de uso es best-effort, nunca debe romper la respuesta real
  }
}
