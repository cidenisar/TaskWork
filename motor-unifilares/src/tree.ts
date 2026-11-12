/**
 * Árbol de encadenado de circuitos (mismo algoritmo que
 * informes-app/src/lib/tableros/unifilar.ts#construirArboles — portado
 * acá para no importar entre las dos apps, ver types.ts). Se usa para
 * asignar códigos de equipo (codigos-equipo.ts) y para partir la
 * generación en lotes sin cortar un grupo a la mitad (anthropic-client.ts).
 */
import type { UnifilarCircuito } from "./types.js";

export interface NodoArbol {
  circuito: UnifilarCircuito;
  hijos: NodoArbol[];
}

/**
 * Arma los árboles de encadenado: cada árbol es un circuito cabeza
 * (`padreNumero` null, o que apunta a algo inexistente) más todo lo que
 * cuelga de él. Si los datos tienen un ciclo, se corta en el primer
 * circuito repetido dentro de la misma rama en vez de recursar infinito.
 */
export function construirArboles(circuitos: UnifilarCircuito[]): NodoArbol[] {
  const porNumero = new Map(circuitos.map((c) => [c.numero, c]));
  const hijosDe = new Map<number, UnifilarCircuito[]>();
  for (const c of circuitos) {
    if (c.padreNumero == null || c.padreNumero === c.numero || !porNumero.has(c.padreNumero)) continue;
    const lista = hijosDe.get(c.padreNumero) ?? [];
    lista.push(c);
    hijosDe.set(c.padreNumero, lista);
  }
  const sonHijo = new Set<number>();
  for (const lista of hijosDe.values()) for (const h of lista) sonHijo.add(h.numero);
  const raices = circuitos.filter((c) => !sonHijo.has(c.numero));

  function armar(c: UnifilarCircuito, ancestros: Set<number>): NodoArbol {
    const hijos = (hijosDe.get(c.numero) ?? [])
      .filter((h) => !ancestros.has(h.numero))
      .sort((a, b) => a.numero - b.numero)
      .map((h) => armar(h, new Set([...ancestros, h.numero])));
    return { circuito: c, hijos };
  }

  return raices.sort((a, b) => a.numero - b.numero).map((r) => armar(r, new Set([r.numero])));
}

/** Cantidad total de nodos (circuitos) en un árbol, raíz incluida. */
export function contarNodos(nodo: NodoArbol): number {
  return 1 + nodo.hijos.reduce((acc, h) => acc + contarNodos(h), 0);
}

/**
 * Cantidad de hojas (destinos reales, sin hijos) de un árbol — un circuito
 * que no alimenta a ningún otro. Usado en anthropic-client.ts para estimar
 * cuántos `Tn` de tierra va a necesitar el tablero (A7: uno por destino o
 * equipo) ANTES de llamar a la IA, para reservarle el espacio a la tabla
 * PUESTA A TIERRA — ver el comentario de `alturaReservadaEncabezado` ahí.
 */
export function contarHojas(nodo: NodoArbol): number {
  if (nodo.hijos.length === 0) return 1;
  return nodo.hijos.reduce((acc, h) => acc + contarHojas(h), 0);
}
