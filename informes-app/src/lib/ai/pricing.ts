/**
 * Precios de lista de Anthropic en USD por millón de tokens — se usan para
 * ESTIMAR el gasto a partir del consumo real (`response.usage`), no para
 * facturar: el gasto exacto siempre está en console.anthropic.com → Usage
 * and Cost. Si Anthropic cambia precios, actualizar solo acá.
 */
export const PRECIO_IA_USD_POR_MTOK: Record<string, { entrada: number; salida: number }> = {
  "claude-opus-5-5": { entrada: 4, salida: 20 },
  "claude-sonnet-5-5": { entrada: 2, salida: 10 },
  "claude-haiku-4-5": { entrada: 1, salida: 5 },
};

export function calcularCostoUsd(modelo: string, inputTokens: number, outputTokens: number): number {
  // La API devuelve el id con fecha ("claude-haiku-4-5-20251001"): se busca por prefijo. Las IAs gratuitas ("groq:...") no coinciden → $0.
  const clave = Object.keys(PRECIO_IA_USD_POR_MTOK).find((k) => modelo === k || modelo.startsWith(`${k}-`));
  const precio = clave ? PRECIO_IA_USD_POR_MTOK[clave] : undefined;
  if (!precio) return 0;
  return (inputTokens * precio.entrada + outputTokens * precio.salida) / 1_000_000;
}
