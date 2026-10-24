/**
 * Partir los circuitos en lotes para la generación por tramos (ver
 * anthropic-client.ts) — cada lote es uno o más árboles completos
 * (nunca se corte un grupo a la mitad, REGLAS_UNIFILAR.md H3/H6), con un
 * tope de circuitos por lote para que cada llamado a la IA entre
 * cómodo en el límite de tiempo de la función serverless (ver README).
 */
import { construirArboles, contarNodos, type NodoArbol } from "./tree.js";
import type { UnifilarCircuito } from "./types.js";

/** Tope "blando": un lote no lo supera salvo que un solo árbol ya lo supere por sí solo (ahí va solo, no se parte). Mismo valor que B2 ("máximo 8 circuitos por hoja") — no es casualidad, es la cantidad que el propio estándar ya considera razonable para una sola hoja. */
export const CIRCUITOS_POR_LOTE = 8;

export function armarLotes(circuitos: UnifilarCircuito[]): NodoArbol[][] {
  const raices = construirArboles(circuitos);
  const lotes: NodoArbol[][] = [];
  let loteActual: NodoArbol[] = [];
  let nodosLoteActual = 0;

  for (const raiz of raices) {
    const nodos = contarNodos(raiz);
    if (loteActual.length > 0 && nodosLoteActual + nodos > CIRCUITOS_POR_LOTE) {
      lotes.push(loteActual);
      loteActual = [];
      nodosLoteActual = 0;
    }
    loteActual.push(raiz);
    nodosLoteActual += nodos;
  }
  if (loteActual.length > 0) lotes.push(loteActual);
  return lotes;
}

/** Aplana un lote (árboles) de vuelta a la lista de circuitos que contiene, en el mismo orden de lectura (G1). */
export function circuitosDelLote(lote: NodoArbol[]): UnifilarCircuito[] {
  const resultado: UnifilarCircuito[] = [];
  function visitar(nodo: NodoArbol): void {
    resultado.push(nodo.circuito);
    for (const hijo of nodo.hijos) visitar(hijo);
  }
  for (const raiz of lote) visitar(raiz);
  return resultado;
}
