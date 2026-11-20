import type { TableroCategoriaEquipo, TableroRolBypassUps } from "@/lib/database.types";
import { construirArboles, type NodoArbol, type UnifilarCircuito } from "./unifilar";

/**
 * Código de equipo unificado al estándar de dibujo TerraLogic (ver
 * docs/referencias-unifilar/REGLAS_UNIFILAR.md, sección A3) — reemplaza el
 * `calcularCodigosEquipo` anterior (que solo nombraba equipos "de
 * instalación" como bornera/fuente/UPS) con el set completo del estándar:
 * circuito (Cnn), bloque de distribución (PD-n), equipo con prefijo propio
 * (BNR/FT/U/BT/CV/POE), y los nombres literales especiales (GENERAL,
 * SOBRETENSION, E.UPS/RODEO/S.UPS). `tipo` es solo informativo (para quien
 * consuma el código más adelante, ej. para decidir estilo de rótulo) — hoy
 * ningún consumidor lo usa todavía.
 */
export type TipoCodigo = "circuito" | "distribucion" | "equipo" | "especial";
export interface CodigoEquipo {
  texto: string;
  tipo: TipoCodigo;
}

/**
 * Prefijo de equipo por categoría — solo las categorías "de instalación"
 * que el estándar nombra con su propio código (A3). El resto (térmica,
 * disyuntor, lectora, cerradura, cámara, otro) se identifica por su
 * código de circuito (Cnn) o, si es la cabeza del cuerpo, por un nombre
 * especial (ver `recorrerRaiz`) — nunca por un prefijo de equipo.
 */
const PREFIJO_EQUIPO_POR_CATEGORIA: Partial<Record<TableroCategoriaEquipo, string>> = {
  bornera: "BNR",
  bornera_fusible: "BNR",
  fuente_industrial: "FT",
  ups_industrial: "U",
  bateria: "BT",
  conversor_dc: "CV",
  inyector_poe: "POE",
};

/** BNR y POE siguen la notación de 2 dígitos del estándar (BNR-01, POE-02); el resto va con 1 dígito (FT-1, U-1, BT-1, CV-1) — ambas convenciones vienen directo de REGLAS_UNIFILAR.md A3. */
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
 * Código correlativo por circuito/equipo, numerado dentro del mismo cuerpo
 * (mismo criterio que la función anterior: no se persiste, se recalcula
 * cada vez que se arma el dibujo, a partir de los circuitos ya cargados).
 *
 * Reglas de asignación, en orden de prioridad — las primeras tres (A) son
 * una propiedad DEL CIRCUITO EN SÍ y valen en cualquier posición del árbol
 * (raíz o no: una bornera/fuente que cuelga de la térmica general no deja
 * de ser una bornera/fuente por no ser la cabeza del cuerpo). Solo GENERAL
 * (B) depende de la posición:
 *
 * A. Por categoría propia del nodo (`codigoEspecialPropio`):
 *    1. `rolBypassUps` presente → nombre literal E.UPS/RODEO/S.UPS.
 *    2. `descargador_gaseoso` → SOBRETENSION.
 *    3. Prefijo de equipo (bornera/fuente/UPS/batería/conversor/PoE) →
 *       correlativo de equipo (BNR-01, FT-1, …).
 * B. Si el nodo es una RAÍZ del cuerpo, única, térmica/disyuntor, y no
 *    calificó por (A) → GENERAL (es una INFERENCIA por posición, no un
 *    dato explícito — confirmado con el usuario: si un cuerpo tiene
 *    varias raíces independientes, ninguna califica, cada una queda con
 *    su propio Cnn en vez de asumir cuál es "la general").
 * C. Si no calificó por (A) ni (B), arranca/continúa una cadena de
 *    circuito (Cnn): un nodo con un solo hijo hereda/propaga el mismo
 *    Cnn a lo largo de la cadena (térmica→disyuntor→destino); un nodo
 *    con VARIOS hijos (patrón "grupo") es un bloque de distribución
 *    (PD-n) y NUNCA hereda el código entrante — cada uno de sus hijos
 *    arranca su propia cadena Cnn nueva; una hoja sin cadena previa
 *    arranca su propio Cnn ahí mismo.
 *
 * Los hijos de un nodo con código de (A) o (B) también arrancan cadena
 * nueva cada uno — esos códigos no son parte de ninguna cadena Cnn.
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

  /** Regla (A): propiedad del circuito en sí, aplica en cualquier posición del árbol. */
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
    // Regla (B): GENERAL solo puede ser una raíz única del cuerpo — se
    // chequea ANTES de entrar a `recorrer` porque es la única regla que
    // depende de la posición, no de la categoría del nodo en sí.
    if (raices.length === 1 && CATEGORIAS_PROTECCION.includes(c.categoriaEquipo) && !codigoEspecialPropio(c)) {
      codigos.set(c.numero, { texto: CODIGO_GENERAL, tipo: "especial" });
      for (const hijo of raiz.hijos) recorrer(hijo, null);
      continue;
    }
    recorrer(raiz, null);
  }

  return codigos;
}
