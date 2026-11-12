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
  const precio = PRECIO_IA_USD_POR_MTOK[modelo];
  if (!precio) return 0;
  return (inputTokens * precio.entrada + outputTokens * precio.salida) / 1_000_000;
}
