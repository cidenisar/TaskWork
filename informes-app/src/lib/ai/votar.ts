import { normalizarValor } from "./comparar";

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** "No vi nada" — una IA que devuelve vacío o null en un campo no está opinando que ese campo sea vacío. */
const esVacio = (v: unknown): boolean => v === null || (typeof v === "string" && v.trim() === "");

/**
 * Combina las respuestas (ya ordenadas por prioridad) campo por campo.
 *
 * Regla de los valores vacíos: en un campo que hay que LEER (N° de serie, etiqueta, fecha...), una IA
 * que devuelve "" casi siempre es una IA que no lo vio, no una que vio que está vacío. Si esas
 * respuestas votaran, dos IAs flojas que no leyeron nada le ganarían a la que sí lo leyó y el campo
 * quedaría en blanco (pasó con el N° de serie de un UPS: Claude lo leyó bien y el resultado salió vacío).
 * Por eso solo votan entre sí las respuestas con contenido: si dos coinciden, gana ese valor; si no
 * hay coincidencia, se toma la de mayor prioridad que leyó algo y el campo queda marcado como dudoso
 * para que lo revise una persona. Solo si TODAS lo dejaron vacío, el resultado es vacío.
 *
 * Exportada para poder probarla aparte.
 */
export function votar(valores: unknown[], ruta: string, dudosos: string[]): unknown {
  const presentes = valores.filter((v) => v !== undefined);
  if (presentes.length === 0) return undefined;

  if (presentes.every(Array.isArray)) {
    const largos = (presentes as unknown[][]).map((a) => a.length);
    const cuenta = (n: number) => largos.filter((x) => x === n).length;
    const largo = [...largos].sort((a, b) => cuenta(b) - cuenta(a))[0];
    if (presentes.length >= 2 && cuenta(largo) < 2) dudosos.push(`${ruta || "raiz"}[cantidad]`);
    const candidatos = valores.map((v) => (Array.isArray(v) && v.length === largo ? v : undefined));
    return Array.from({ length: largo }, (_, i) => votar(candidatos.map((a) => a?.[i]), `${ruta}[${i}]`, dudosos));
  }

  if (presentes.every(esObjeto)) {
    const claves: string[] = [];
    for (const o of presentes as Record<string, unknown>[]) for (const k of Object.keys(o)) if (!claves.includes(k)) claves.push(k);
    const salida: Record<string, unknown> = {};
    for (const k of claves) {
      const v = votar(
        valores.map((o) => (esObjeto(o) ? o[k] : undefined)),
        ruta ? `${ruta}.${k}` : k,
        dudosos,
      );
      if (v !== undefined) salida[k] = v;
    }
    return salida;
  }

  const conDato = presentes.filter((v) => !esVacio(v));
  if (conDato.length === 0) return presentes[0]; // todas lo dejaron vacío

  const grupos = new Map<string, unknown[]>();
  for (const v of conDato) {
    const n = normalizarValor(v);
    grupos.set(n, [...(grupos.get(n) ?? []), v]);
  }
  const mejor = [...grupos.values()].sort((a, b) => b.length - a.length)[0];
  if (mejor.length >= 2) return mejor[0];
  // Sin dos que coincidan: se toma la de mayor prioridad que leyó algo, pero queda para revisar.
  if (presentes.length >= 2) dudosos.push(ruta || "raiz");
  return conDato[0];
}
