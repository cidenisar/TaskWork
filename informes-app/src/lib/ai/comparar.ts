/**
 * Comparación de lo que leyó cada IA sobre la MISMA foto — pura, sin DB.
 * La usan el enchufe (lib/ai/motor.ts, para votar) y la pantalla
 * Configuración → IA → Comparación (para medir coincidencia).
 */

/** Dos valores "iguales" para votar/comparar: texto sin mayúsculas ni espacios de más, números a 2 decimales. */
export function normalizarValor(v: unknown): string {
  if (typeof v === "string") return v.trim().toLowerCase().replace(/\s+/g, " ");
  if (typeof v === "number") return String(Math.round(v * 100) / 100);
  return JSON.stringify(v ?? null);
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Aplana un JSON a `ruta → valor` (solo hojas). Cada lista suma además una
 * entrada `<ruta>[cantidad]`, así una IA que inventó o se salteó un ítem se
 * ve como diferencia. Ej.: `{ gastos: [{ monto: 5 }] }` → `gastos[cantidad]=1`, `gastos[0].monto=5`.
 */
export function aplanar(json: unknown, ruta = "", salida: Map<string, unknown> = new Map()): Map<string, unknown> {
  if (Array.isArray(json)) {
    salida.set(`${ruta || "raiz"}[cantidad]`, json.length);
    json.forEach((v, i) => aplanar(v, `${ruta}[${i}]`, salida));
  } else if (esObjeto(json)) {
    for (const [k, v] of Object.entries(json)) aplanar(v, ruta ? `${ruta}.${k}` : k, salida);
  } else {
    salida.set(ruta || "raiz", json);
  }
  return salida;
}

export interface CampoComparado {
  ruta: string;
  /** Valor de la referencia (undefined = la referencia no trajo este campo). */
  referencia: unknown;
  /** Lo que leyó cada IA (undefined = no trajo el campo). */
  valores: Record<string, unknown>;
  /** Si cada IA coincide con la referencia en este campo. */
  coinciden: Record<string, boolean>;
}

export interface ComparacionLectura {
  /** Contra quién se midió: una IA (ej. "claude") o "resultado" (lo votado, cuando la preferida no respondió). */
  referencia: string;
  campos: CampoComparado[];
  /** Por IA (sin contar la referencia): campos comparados y cuántos coinciden. */
  porIa: Record<string, { comparados: number; coinciden: number }>;
}

/**
 * Compara lo que devolvió cada IA contra una referencia: la `preferida`
 * (Claude) si respondió en esta lectura; si no, el resultado final votado.
 * Un campo que una IA agrega de más o se saltea cuenta como diferencia.
 */
export function compararLectura(jsonPorIa: Record<string, unknown>, resultado: unknown, preferida = "claude"): ComparacionLectura {
  const ias = Object.keys(jsonPorIa);
  const refEsIa = ias.includes(preferida);
  const referencia = refEsIa ? preferida : "resultado";
  const mapaRef = aplanar(refEsIa ? jsonPorIa[preferida] : resultado);
  const mapas = new Map(ias.map((id) => [id, aplanar(jsonPorIa[id])]));

  const vistas = new Set<string>();
  const rutas: string[] = [];
  const agregar = (r: string) => {
    if (!vistas.has(r)) {
      vistas.add(r);
      rutas.push(r);
    }
  };
  for (const r of mapaRef.keys()) agregar(r);
  for (const m of mapas.values()) for (const r of m.keys()) agregar(r);

  const iguales = (a: unknown, b: unknown) => a !== undefined && b !== undefined && normalizarValor(a) === normalizarValor(b);

  const campos: CampoComparado[] = rutas.map((ruta) => {
    const ref = mapaRef.get(ruta);
    const valores: Record<string, unknown> = {};
    const coinciden: Record<string, boolean> = {};
    for (const id of ias) {
      const v = mapas.get(id)!.get(ruta);
      valores[id] = v;
      coinciden[id] = iguales(ref, v);
    }
    return { ruta, referencia: ref, valores, coinciden };
  });

  const porIa: ComparacionLectura["porIa"] = {};
  for (const id of ias) {
    if (id === referencia) continue;
    let comparados = 0;
    let coinciden = 0;
    for (const c of campos) {
      if (c.referencia === undefined && c.valores[id] === undefined) continue;
      comparados++;
      if (c.coinciden[id]) coinciden++;
    }
    porIa[id] = { comparados, coinciden };
  }
  return { referencia, campos, porIa };
}

/** `coinciden / comparados` en %, redondeado; null si no hubo nada para comparar. */
export function porcentaje(coinciden: number, comparados: number): number | null {
  return comparados === 0 ? null : Math.round((coinciden / comparados) * 100);
}
