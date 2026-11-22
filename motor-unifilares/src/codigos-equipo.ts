/**
 * Código de equipo por circuito, siguiendo REGLAS_UNIFILAR.md A3 — mismo
 * algoritmo que informes-app/src/lib/tableros/codigos-equipo.ts (portado
 * acá, ver types.ts sobre por qué no se importa entre las dos apps).
 *
 * Se calcula en código (no se le pide a la IA) por dos motivos: 1) es
 * mecánico, no de criterio visual — no hay nada que "interpretar"; 2) al
 * generar el dibujo en varios lotes (ver anthropic-client.ts, por el
 * límite de tiempo de Vercel) la numeración tiene que ser consistente
 * entre lotes, y dejarle esa cuenta a la IA entre llamados separados es
 * frágil — calculada una sola vez acá, cada lote solo la usa.
 */
import type { TableroCategoriaEquipo, TableroRolBypassUps, UnifilarCircuito } from "./types.js";
import { construirArboles, type NodoArbol } from "./tree.js";

export type TipoCodigo = "circuito" | "distribucion" | "equipo" | "especial";
export interface CodigoEquipo {
  texto: string;
  tipo: TipoCodigo;
}

const PREFIJO_EQUIPO_POR_CATEGORIA: Partial<Record<TableroCategoriaEquipo, string>> = {
  bornera: "BNR",
  bornera_fusible: "BNR",
  fuente_industrial: "FT",
  ups_industrial: "U",
  bateria: "BT",
  conversor_dc: "CV",
  inyector_poe: "POE",
};

const PREFIJOS_DOS_DIGITOS = new Set(["BNR", "POE"]);
const PREFIJO_DISTRIBUCION = "PD";

const CODIGO_POR_ROL_BYPASS: Record<TableroRolBypassUps, string> = {
  entrada: "E.UPS",
  bypass: "RODEO",
  salida: "S.UPS",
};
const CODIGO_SOBRETENSION = "SOBRETENSION";
const CODIGO_GENERAL = "GENERAL";

const CATEGORIAS_PROTECCION: TableroCategoriaEquipo[] = ["termica", "disyuntor"];

function formatearCodigoEquipo(prefijo: string, n: number): string {
  const numeroStr = PREFIJOS_DOS_DIGITOS.has(prefijo) ? String(n).padStart(2, "0") : String(n);
  return `${prefijo}-${numeroStr}`;
}

/**
 * Código correlativo por circuito/equipo (ver el mismo docstring completo
 * en informes-app/src/lib/tableros/codigos-equipo.ts — acá no se repite
 * para no desalinearse de esa copia con el tiempo).
 */
export function calcularCodigosUnificados(circuitos: UnifilarCircuito[]): Map<number, CodigoEquipo> {
  const raices = construirArboles(circuitos);
  const contadorEquipo = new Map<string, number>();
  let contadorDistribucion = 0;
  let contadorCircuito = 0;
  const codigos = new Map<number, CodigoEquipo>();

  function siguienteCodigoEquipo(prefijo: string): string {
    const n = (contadorEquipo.get(prefijo) ?? 0) + 1;
    contadorEquipo.set(prefijo, n);
    return formatearCodigoEquipo(prefijo, n);
  }

  function siguienteCnn(): string {
    contadorCircuito += 1;
    return `C${String(contadorCircuito).padStart(2, "0")}`;
  }

  function codigoEspecialPropio(c: UnifilarCircuito): CodigoEquipo | null {
    if (c.rolBypassUps) return { texto: CODIGO_POR_ROL_BYPASS[c.rolBypassUps], tipo: "especial" };
    if (c.categoriaEquipo === "descargador_gaseoso") return { texto: CODIGO_SOBRETENSION, tipo: "especial" };
    const prefijoEquipo = PREFIJO_EQUIPO_POR_CATEGORIA[c.categoriaEquipo];
    if (prefijoEquipo) return { texto: siguienteCodigoEquipo(prefijoEquipo), tipo: "equipo" };
    return null;
  }

  function recorrer(nodo: NodoArbol, codigoHeredado: string | null): void {
    const c = nodo.circuito;
    const especial = codigoEspecialPropio(c);
    if (especial) {
      codigos.set(c.numero, especial);
      for (const hijo of nodo.hijos) recorrer(hijo, null);
      return;
    }
    if (nodo.hijos.length > 1) {
      contadorDistribucion += 1;
      codigos.set(c.numero, { texto: `${PREFIJO_DISTRIBUCION}-${contadorDistribucion}`, tipo: "distribucion" });
      for (const hijo of nodo.hijos) recorrer(hijo, null);
      return;
    }
    const codigo = codigoHeredado ?? siguienteCnn();
    codigos.set(c.numero, { texto: codigo, tipo: "circuito" });
    if (nodo.hijos.length === 1) recorrer(nodo.hijos[0], codigo);
  }

  for (const raiz of raices) {
    const c = raiz.circuito;
    if (raices.length === 1 && CATEGORIAS_PROTECCION.includes(c.categoriaEquipo) && !codigoEspecialPropio(c)) {
      codigos.set(c.numero, { texto: CODIGO_GENERAL, tipo: "especial" });
      for (const hijo of raiz.hijos) recorrer(hijo, null);
      continue;
    }
    recorrer(raiz, null);
  }

  return codigos;
}
