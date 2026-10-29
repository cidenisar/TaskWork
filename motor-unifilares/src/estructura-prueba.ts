/**
 * Previsualización de ESTRUCTURA de un tablero antes de gastar nada en la
 * IA (ver pantalla /probar) — reusa el mismo cálculo mecánico que
 * anthropic-client.ts hace antes de llamar a Claude (códigos de equipo,
 * partido en lotes, altura reservada para el marco/PUESTA A TIERRA,
 * tensiones presentes), sin disparar ningún llamado. Sirve para detectar
 * datos mal cargados (un padreNumero que no existe, un tablero con más
 * lotes de los esperados) ANTES de pagar por generarlo.
 */
import { construirArboles, contarHojas } from "./tree.js";
import { calcularCodigosUnificados } from "./codigos-equipo.js";
import { armarLotes, circuitosDelLote } from "./lotes.js";
import { calcularAlturaReservadaEncabezado, tensionesPresentesEn } from "./anthropic-client.js";
import type { UnifilarCircuito } from "./types.js";

/**
 * Chequeo mínimo de forma para el JSON que pega un usuario en /probar (no
 * valida los enums de categoría/tipo contra una lista cerrada — un valor
 * fuera de lo esperado simplemente no matchea ningún prefijo/regla
 * particular más adelante, no rompe nada). Sí exige que `numero` y
 * `padreNumero` tengan sentido entre sí, porque de eso depende
 * directamente `construirArboles`/`armarLotes`.
 */
export function validarCircuitosPrueba(valor: unknown): string | null {
  if (!Array.isArray(valor) || valor.length === 0) return 'Tiene que ser un array de circuitos, no vacío.';
  const numeros = new Set<number>();
  for (const [i, c] of valor.entries()) {
    if (!c || typeof c !== "object") return `El circuito en la posición ${i} no es un objeto.`;
    const o = c as Record<string, unknown>;
    if (typeof o.numero !== "number") return `El circuito en la posición ${i} no tiene "numero" numérico.`;
    if (typeof o.texto !== "string" || !o.texto.trim()) return `El circuito "${o.numero}" no tiene "texto".`;
    if (o.padreNumero !== null && typeof o.padreNumero !== "number") return `El circuito "${o.numero}" tiene "padreNumero" inválido (tiene que ser number o null).`;
    numeros.add(o.numero);
  }
  for (const c of valor as Record<string, unknown>[]) {
    if (c.padreNumero !== null && !numeros.has(c.padreNumero as number)) {
      return `El circuito "${c.numero}" apunta con padreNumero a "${c.padreNumero}", que no existe en la lista.`;
    }
  }
  return null;
}

export interface CircuitoConCodigoPrevia {
  numero: number;
  texto: string;
  codigo: string;
}

export interface LotePrevia {
  indice: number;
  circuitos: CircuitoConCodigoPrevia[];
}

export interface EstructuraPrevia {
  totalCircuitos: number;
  lotes: LotePrevia[];
  /** Cantidad de destinos reales (hojas de los árboles de encadenado) — uno por línea del recuadro PUESTA A TIERRA. */
  destinosReales: number;
  alturaReservadaEncabezado: number;
  tensionesPresentes: string[];
  /** Lotes de circuitos + 1 (el llamado final de marco/rótulo) — cada uno es un llamado real a la IA. */
  llamadosEstimados: number;
}

export function calcularEstructuraPrevia(circuitos: UnifilarCircuito[]): EstructuraPrevia {
  const codigos = calcularCodigosUnificados(circuitos);
  const lotesArboles = armarLotes(circuitos);
  const lotes: LotePrevia[] = lotesArboles.map((lote, indice) => ({
    indice,
    circuitos: circuitosDelLote(lote).map((c) => ({ numero: c.numero, texto: c.texto, codigo: codigos.get(c.numero)?.texto ?? "A CONFIRMAR" })),
  }));
  const destinosReales = construirArboles(circuitos).reduce((acc, raiz) => acc + contarHojas(raiz), 0);

  return {
    totalCircuitos: circuitos.length,
    lotes,
    destinosReales,
    alturaReservadaEncabezado: calcularAlturaReservadaEncabezado(circuitos),
    tensionesPresentes: tensionesPresentesEn(circuitos),
    llamadosEstimados: lotes.length + 1,
  };
}
