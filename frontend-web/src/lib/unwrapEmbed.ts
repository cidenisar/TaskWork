/** Supabase-js devuelve un embed FK-a-uno como objeto o como array de un elemento según la versión/tipado — este helper lo normaliza. */
export function unwrapEmbed<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}
