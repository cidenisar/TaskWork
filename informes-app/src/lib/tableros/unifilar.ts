import { CATEGORIA_EQUIPO_LABEL, TIPO_CIRCUITO_LABEL } from "@/components/tableros/types";
import {
  calcularCalibreCircuito,
  CONDUCTORES_POR_TIPO,
  formatearFormacionCable,
  parseAmperaje,
  type ConfigCalibreCable,
} from "./calibre-cable";
import type { TableroCategoriaEquipo, TableroRolBypassUps, TableroTipoCircuito } from "@/lib/database.types";

export interface UnifilarCircuito {
  numero: number;
  texto: string;
  categoriaEquipo: TableroCategoriaEquipo;
  tipoCircuito: TableroTipoCircuito;
  ampNominal: string | null;
  cuerpo: string | null;
  alimentadoPorUps: boolean;
  rolBypassUps: TableroRolBypassUps | null;
  /** N° de otro circuito del mismo cuerpo del que "cuelga" este (mismo cuerpo del plano, un escalón más abajo) — null si es la cabeza de su propia columna. Varios circuitos pueden compartir el mismo padre (ver `construirArboles`): es el patrón "grupo" (una protección común con varias cargas colgando). */
  padreNumero: number | null;
  etiquetaCable: string | null;
}

/** Datos del cuadro de título (rótulo) que se agrega al pie de cada dibujo — todos ya existentes en la medición, nunca un dato nuevo que haya que cargar aparte. */
export interface RotuloUnifilar {
  sitio: string;
  tablero: string;
  /** Cliente del tablero (tableros.cliente, ej. "YPF") — nunca inventado, ver tableros/nuevo/actions.ts. */
  cliente: string;
  /** Nombre de la empresa contratista (config_general.nombre_empresa, ej. "SONDA") — configurable, nunca hardcodeado en el dibujo. */
  contratista: string;
  fecha: string;
  realizo: string;
  numeroGeneracion: string;
}

/**
 * Convención de dibujo "a mano" (AutoCAD) que se respeta en todo tablero,
 * tenga uno o varios cuerpos: de arriba hacia abajo siempre se agrupa
 * primero la energía de 380V/220V, después 24V/12V, después control de
 * acceso y por último CCTV — y dentro de cada grupo de energía, lo que sale
 * del tablero (bornera) va al fondo, para que el técnico nunca tenga que
 * entrar al tablero a conectar algo de campo. El grupo lo decide la
 * categoría del equipo cuando es una categoría "de función" (lectora,
 * cerradura, cámara, inyector PoE), la UPS por defecto va con la energía
 * AC (ver `grupoDeCircuito`), y el voltaje del circuito decide el resto
 * (térmica, disyuntor, bornera, fuente, batería, conversor DC,
 * descargador, otro).
 */
type GrupoUnifilar = "energia_ac" | "energia_dc" | "control_acceso" | "cctv";

const ORDEN_GRUPOS: GrupoUnifilar[] = ["energia_ac", "energia_dc", "control_acceso", "cctv"];

function grupoDeCircuito(c: UnifilarCircuito): GrupoUnifilar {
  if (c.categoriaEquipo === "lectora" || c.categoriaEquipo === "cerradura") return "control_acceso";
  if (c.categoriaEquipo === "camara" || c.categoriaEquipo === "inyector_poe") return "cctv";
  // La UPS casi siempre respalda el lado de 220V/380V (se busca la mayor
  // durabilidad: cuando se agota esa UPS, recién ahí sigue una UPS de 24V
  // aparte) — por eso una UPS sin tipo de circuito cargado ("No aplica", lo
  // más común) va con la energía AC por defecto, y solo cae en 24V/12V
  // cuando el técnico la carga explícitamente así (la UPS de 24V en sí).
  if (c.categoriaEquipo === "ups_industrial" && c.tipoCircuito !== "24vdc" && c.tipoCircuito !== "12vdc") return "energia_ac";
  if (c.tipoCircuito === "380v_tri" || c.tipoCircuito === "220v_mono") return "energia_ac";
  return "energia_dc";
}

const ORDEN_ROL_BYPASS: Record<TableroRolBypassUps, number> = { entrada: 0, bypass: 1, salida: 2 };

/**
 * Dentro de un mismo grupo: primero los circuitos normales, después las 3
 * térmicas del bypass del UPS (entrada → bypass → salida, siempre juntas y
 * en ese orden), después los circuitos de carga alimentados por UPS, y al
 * fondo de todo las borneras (siempre el último paso antes de salir del
 * tablero).
 */
function ordenDentroDeGrupo(c: UnifilarCircuito): number {
  if (c.categoriaEquipo === "bornera" || c.categoriaEquipo === "bornera_fusible") return 3;
  if (c.alimentadoPorUps) return 2;
  if (c.rolBypassUps) return 1;
  return 0;
}

function compararCircuitos(a: UnifilarCircuito, b: UnifilarCircuito): number {
  const grupoA = ORDEN_GRUPOS.indexOf(grupoDeCircuito(a));
  const grupoB = ORDEN_GRUPOS.indexOf(grupoDeCircuito(b));
  if (grupoA !== grupoB) return grupoA - grupoB;
  const ordenA = ordenDentroDeGrupo(a);
  const ordenB = ordenDentroDeGrupo(b);
  if (ordenA !== ordenB) return ordenA - ordenB;
  if (a.rolBypassUps && b.rolBypassUps && a.rolBypassUps !== b.rolBypassUps) {
    return ORDEN_ROL_BYPASS[a.rolBypassUps] - ORDEN_ROL_BYPASS[b.rolBypassUps];
  }
  return a.numero - b.numero;
}

/** Aplica el orden de dibujo convencional a una lista de circuitos de un mismo cuerpo, preservando el N° de circuito como desempate final. */
export function ordenarCircuitosParaUnifilar<T extends UnifilarCircuito>(circuitos: T[]): T[] {
  return [...circuitos].sort(compararCircuitos);
}

/** Un nodo del árbol de encadenado: el circuito propio más los circuitos que cuelgan directamente de él (0, 1, o varios — varios es el patrón "grupo": una protección común con varias cargas). */
interface NodoArbol {
  circuito: UnifilarCircuito;
  hijos: NodoArbol[];
}

/**
 * Arma los árboles de encadenado de un cuerpo: cada árbol es un circuito
 * cabeza (`padreNumero` null, o que apunta a algo que no existe en este
 * cuerpo) más todo lo que cuelga de él, directa o indirectamente. A
 * diferencia de una simple cadena lineal, un circuito puede tener VARIOS
 * hijos a la vez (ej. un disyuntor general con varias térmicas debajo,
 * cada una yendo a su propio destino) — cada hijo pasa a ser su propia
 * sub-columna en el dibujo (ver `dibujarNodo`).
 *
 * Si los datos tienen un ciclo (error de carga: A cuelga de B y B cuelga de
 * A), se corta en el primer circuito repetido dentro de la misma rama en
 * vez de recursar infinito.
 */
function construirArboles(circuitos: UnifilarCircuito[]): NodoArbol[] {
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

  return raices.map((r) => armar(r, new Set([r.numero])));
}

/** Cuántas "columnas base" (de ancho `COLUMNA_ANCHO`) ocupa un árbol — una hoja siempre ocupa 1; un nodo con hijos ocupa la suma de sus hijos (nunca menos de 1), para que cada carga final tenga el mismo ancho que un circuito suelto, sin achicarse por compartir protección. */
function anchoEnSlots(nodo: NodoArbol): number {
  if (nodo.hijos.length === 0) return 1;
  return nodo.hijos.reduce((acc, h) => acc + anchoEnSlots(h), 0);
}

/** Profundidad (en dispositivos encadenados) de la rama más larga del árbol — determina la altura de la fila completa. */
function profundidadMax(nodo: NodoArbol): number {
  if (nodo.hijos.length === 0) return 1;
  return 1 + Math.max(...nodo.hijos.map(profundidadMax));
}

/**
 * Prefijo de código de equipo por categoría — solo para equipos "de
 * instalación" que conviene poder nombrar por su cuenta en el plano
 * (bornera, fuente, UPS, batería, conversor DC, inyector PoE,
 * descargador). Las protecciones (térmica/disyuntor) no llevan código
 * propio: ya se identifican por el N° de circuito (la cajita de ID al
 * pie de cada columna), igual que categorías de función (cámara,
 * lectora, cerradura) u "otro".
 */
const PREFIJO_CODIGO_EQUIPO: Partial<Record<TableroCategoriaEquipo, string>> = {
  bornera: "BNR",
  bornera_fusible: "BNR",
  fuente_industrial: "FT",
  ups_industrial: "U",
  bateria: "BT",
  conversor_dc: "CV",
  inyector_poe: "POE",
  descargador_gaseoso: "PS",
};

/** BNR y POE siguen la notación de 2 dígitos del plano real (BNR-01, POE-02); el resto va con 1 dígito (FT-1, U-1, BT-1, CV-1, PS-1) — ambas convenciones vienen directo del documento de referencia. */
const PREFIJOS_DOS_DIGITOS = new Set(["BNR", "POE"]);

/**
 * Código correlativo por categoría de equipo, numerado dentro del mismo
 * cuerpo en orden de N° de circuito — así dos borneras del mismo cuerpo
 * nunca comparten código, y el orden es estable sin importar en qué
 * orden se cargaron. No se persiste en la base: se recalcula cada vez
 * que se arma el dibujo, a partir de los circuitos ya cargados (mismo
 * criterio que el resto del unifilar — nunca un dato nuevo que haya que
 * cargar aparte).
 */
function calcularCodigosEquipo(circuitos: UnifilarCircuito[]): Map<number, string> {
  const contador = new Map<string, number>();
  const codigos = new Map<number, string>();
  for (const c of [...circuitos].sort((a, b) => a.numero - b.numero)) {
    const prefijo = PREFIJO_CODIGO_EQUIPO[c.categoriaEquipo];
    if (!prefijo) continue;
    const n = (contador.get(prefijo) ?? 0) + 1;
    contador.set(prefijo, n);
    const numeroStr = PREFIJOS_DOS_DIGITOS.has(prefijo) ? String(n).padStart(2, "0") : String(n);
    codigos.set(c.numero, `${prefijo}-${numeroStr}`);
  }
  return codigos;
}

const LABEL_GRUPO: Record<GrupoUnifilar, string> = {
  energia_ac: "ENERGÍA 380V/220V",
  energia_dc: "ENERGÍA 24V/12V",
  control_acceso: "CONTROL DE ACCESO",
  cctv: "CCTV",
};

const ROL_BYPASS_SUFIJO: Record<TableroRolBypassUps, string> = { entrada: " (E)", bypass: " (BYP)", salida: " (S)" };

/**
 * Capa DXF de cada comando — permite que quien abra el plano en AutoCAD
 * apague/prenda el marco, la barra, los símbolos, el rótulo o el texto por
 * separado, en vez de recibir todo en una sola capa "0" (ver
 * `lib/dxf/writer.ts`). El PDF ignora este campo (siempre se ve todo junto).
 */
export type CapaDxf = "MARCO" | "BARRA" | "SIMBOLOS" | "ROTULO" | "TEXTO" | "BORNES" | "CABLES" | "SELLO" | "TIERRA";

export type DrawCommand =
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; layer: CapaDxf }
  | { type: "rect"; x: number; y: number; width: number; height: number; layer: CapaDxf }
  | { type: "circle"; x: number; y: number; r: number; layer: CapaDxf }
  | { type: "text"; x: number; y: number; text: string; size: number; bold?: boolean; layer: CapaDxf };

export interface UnifilarDrawing {
  commands: DrawCommand[];
  width: number;
  height: number;
}

/**
 * Layout tipo "escalera" (barra horizontal arriba, cada circuito cuelga
 * hacia abajo en su propia columna) — calcado de cómo lo dibuja el técnico
 * en AutoCAD: columnas de ~5 por fila (como en los planos reales), símbolo
 * de llave/borne/equipo, bloque de datos debajo, y una cajita de
 * identificación del circuito al pie de cada columna (el equivalente a los
 * "CIRCUITO X — ..." de los planos reales, sin rotar el texto para no
 * complicar el renderer de PDF/DXF).
 *
 * Una columna puede llevar varios dispositivos encadenados en serie (ej.
 * bornera de entrada → térmica → disyuntor, los tres en la misma bajada,
 * como pasa físicamente cuando un circuito atraviesa más de una protección
 * — ver `UnifilarCircuito.padreNumero` y `construirArboles`) y también
 * puede ABRIRSE en varias sub-columnas cuando una protección común
 * alimenta varias cargas (patrón "grupo": un disyuntor con varias
 * térmicas debajo, cada una yendo a su propio destino) — ver `dibujarNodo`.
 */
const ANCHO = 520;
const MARGEN = 10;
const ALTO_HEADER_CUERPO = 18;
const COLUMNA_ANCHO = 100;
const COLUMNAS_POR_FILA = Math.max(1, Math.floor((ANCHO - MARGEN * 2) / COLUMNA_ANCHO));
const ALTO_HEADER_SECCION = 12;
const GAP_CUERPO = 10;

const SIMBOLO_R = 5;
const ALTO_LINEA = 7;
const LINEAS_SPEC = 3;
const ALTO_ID_BOX = 12;

/**
 * Numeración de conductores (A4 del estándar de dibujo): cada punto donde un
 * cable entra a un dispositivo (térmica, disyuntor, bornera, o al destino
 * final) lleva un par de bornes N/F con su propio "A n" correlativo — el
 * número cambia al atravesar cada protección, nunca a lo largo de un mismo
 * tramo de cable. A diferencia del plano a mano (que redibuja el mismo par
 * en los dos extremos de cada tramo), acá se dibuja una sola vez por
 * dispositivo — mismo criterio de "esquema simplificado, no a escala" que ya
 * tiene el resto de este archivo (ver cabecera del módulo), elegido a
 * propósito para no triplicar el alto de cada columna (ver §10/§14/§16 de
 * CRITERIOS_Y_IDEAS.md — @react-pdf/renderer se cuelga arriba de cierta
 * altura de bloque, así que cada línea nueva de verdad cuesta).
 */
const CABLE_SEG = 5;
const PRE_BORNE_GAP = 2;
const BORNE_ALTO = 4.5;
const POST_BORNE_GAP = 2;
/** Tramo completo "cable con marca de formación + par de bornes numerado" antes de cada dispositivo (ver `dibujarBorneNumerado`/`marcaCable` en `dibujarNodo`) — mismo paso para el primero de la columna (baja de la barra) y para cualquier encadenado, porque ambos casos dibujan exactamente lo mismo. */
const PASO_DISPOSITIVO = CABLE_SEG + PRE_BORNE_GAP + BORNE_ALTO + POST_BORNE_GAP + SIMBOLO_R * 2;
/** Mismo tramo pero más corto, para el cable final que entra al destino (no hay otro dispositivo después, así que no hace falta el aire extra post-símbolo). */
const PASO_A_DESTINO = CABLE_SEG + PRE_BORNE_GAP + BORNE_ALTO;

/** Altura (desde la barra del renglón hasta el pie de la cajita de ID) de una columna con `profundidad` dispositivos encadenados en la rama más larga — calculada simulando los mismos pasos que dibuja `dibujarNodo`, para que nunca quede corta. Una rama que se abre en varias sub-columnas (patrón "grupo") no agrega altura extra: el sub-bus se apoya exactamente donde terminaría el siguiente escalón de una cadena lineal, así que la altura depende solo de la profundidad máxima, nunca de cuántas ramas hay. */
function alturaColumna(profundidad: number): number {
  const yDespuesUltimoDispositivo = profundidad * PASO_DISPOSITIVO;
  return yDespuesUltimoDispositivo + PASO_A_DESTINO + 3 + LINEAS_SPEC * ALTO_LINEA + 4 + ALTO_ID_BOX;
}

function truncar(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Ancho medio de carácter en Helvetica, como fracción del tamaño de fuente
 * — mismo criterio empírico que ya usaba `selloAncho` más abajo (0.62 para
 * texto en mayúsculas/negrita). Es una estimación, no una medida real del
 * glifo, pero alcanza para no truncar muy por debajo de lo que la caja
 * puede mostrar (que es justo el bug real: antes se truncaba a un número
 * fijo de caracteres —16, 12, 26— calibrado a mano con texto de prueba
 * corto, sin relación con el ancho real disponible, así que un texto real
 * como "Disyuntor/Diferencial" o "RACK Nº 05 / CKT 5 - INT. TERMOM."
 * quedaba cortado a la mitad aunque la caja tuviera lugar de sobra).
 */
function maxCharsEnAncho(anchoDisponible: number, size: number, bold = false): number {
  const factorAncho = bold ? 0.62 : 0.52;
  return Math.max(4, Math.floor(anchoDisponible / (size * factorAncho)));
}

/** Trunca `s` al máximo de caracteres que entran en `anchoDisponible` (puntos) para ese tamaño/peso de fuente — ver `maxCharsEnAncho`. */
function truncarA(s: string, anchoDisponible: number, size: number, bold = false): string {
  return truncar(s, maxCharsEnAncho(anchoDisponible, size, bold));
}

const CATEGORIAS_BREAKER: TableroCategoriaEquipo[] = ["termica", "disyuntor"];
const CATEGORIAS_BORNERA: TableroCategoriaEquipo[] = ["bornera", "bornera_fusible"];

/**
 * Símbolo por categoría en vez de un cuadrado vacío genérico: térmica/
 * disyuntor dibuja el símbolo clásico de llave seccionadora (dos bornes +
 * la cuchilla en diagonal), bornera dibuja el banco de bornes (dos círculos,
 * el punto de conexión de campo, como en los planos reales), y el resto de
 * las categorías usa una caja simple de equipo.
 */
function dibujarSimbolo(commands: DrawCommand[], categoria: TableroCategoriaEquipo, cx: number, cy: number): void {
  if (CATEGORIAS_BREAKER.includes(categoria)) {
    const yTop = cy - SIMBOLO_R;
    const yBot = cy + SIMBOLO_R;
    commands.push({ type: "circle", x: cx, y: yTop, r: 1.2, layer: "SIMBOLOS" });
    commands.push({ type: "circle", x: cx, y: yBot, r: 1.2, layer: "SIMBOLOS" });
    commands.push({ type: "line", x1: cx, y1: yBot, x2: cx + SIMBOLO_R * 0.8, y2: yTop + SIMBOLO_R * 0.3, layer: "SIMBOLOS" });
    return;
  }
  if (CATEGORIAS_BORNERA.includes(categoria)) {
    commands.push({ type: "circle", x: cx, y: cy - SIMBOLO_R * 0.5, r: 1.6, layer: "SIMBOLOS" });
    commands.push({ type: "circle", x: cx, y: cy + SIMBOLO_R * 0.5, r: 1.6, layer: "SIMBOLOS" });
    return;
  }
  commands.push({ type: "rect", x: cx - SIMBOLO_R, y: cy - SIMBOLO_R, width: SIMBOLO_R * 2, height: SIMBOLO_R * 2, layer: "SIMBOLOS" });
}

/** Contador correlativo de conductores ("A n", A4 del estándar) — un objeto mutable en vez de un argumento de retorno porque se comparte entre toda la recursión de un mismo cuerpo (mismo criterio que `codigos`, ver `calcularCodigosEquipo`). Arranca de nuevo en cada cuerpo — no hay una single fuente de verdad de "todos los cuerpos de este tablero" en un solo lugar antes de dibujar, y reiniciar por cuerpo evita que la numeración dependa de en qué parte/página terminó cayendo cada bloque (ver `construirUnifilarPaginado`). */
interface ContadorConductor {
  siguiente: number;
}

function nuevoContadorConductor(): ContadorConductor {
  return { siguiente: 1 };
}

/**
 * A5 BORNE: círculo con diagonal (tornillo), con su par de números "A n"
 * (neutro arriba, fase abajo — A4 regla 3) a la derecha. Devuelve el par de
 * números usado, por si hace falta (no se usa hoy, pero documenta qué
 * números quedaron en este punto).
 */
function dibujarBorneNumerado(commands: DrawCommand[], cx: number, cy: number, ctr: ContadorConductor): [number, number] {
  const nN = ctr.siguiente++;
  const nF = ctr.siguiente++;
  const r = 0.9;
  commands.push({ type: "circle", x: cx, y: cy, r, layer: "BORNES" });
  commands.push({ type: "line", x1: cx - r * 0.7, y1: cy - r * 0.7, x2: cx + r * 0.7, y2: cy + r * 0.7, layer: "BORNES" });
  commands.push({ type: "text", x: cx + 2, y: cy - 3, text: `N  A${nN}`, size: 3.2, layer: "TEXTO" });
  commands.push({ type: "text", x: cx + 2, y: cy + 2.5, text: `F  A${nF}`, size: 3.2, layer: "TEXTO" });
  return [nN, nF];
}

/**
 * A6: marca diagonal sobre la línea de conductor + texto de formación a la
 * izquierda. Doble trazo para 380V trifásico (3F+N, "marca doble" del
 * estándar), simple para el resto — `conductoresDe`/`CONDUCTORES_POR_TIPO`
 * decide cuántos hilos tiene el cable, no se inventa.
 */
function marcaCable(commands: DrawCommand[], cx: number, yTop: number, yBot: number, formacion: string | null, tipoCircuito: TableroTipoCircuito): void {
  commands.push({ type: "line", x1: cx, y1: yTop, x2: cx, y2: yBot, layer: "BARRA" });
  const ym = (yTop + yBot) / 2;
  const doble = (CONDUCTORES_POR_TIPO[tipoCircuito] ?? 2) >= 3;
  const largo = 2.2;
  for (const off of doble ? [-0.8, 0.8] : [0]) {
    commands.push({
      type: "line",
      x1: cx - largo / 2 + off,
      y1: ym - largo / 2,
      x2: cx + largo / 2 + off,
      y2: ym + largo / 2,
      layer: "CABLES",
    });
  }
  if (formacion) {
    commands.push({ type: "text", x: cx - 20, y: ym + 1, text: formacion, size: 3.4, layer: "CABLES" });
  }
}

/**
 * Ancho real disponible para el texto dentro de una columna del unifilar
 * (ancho de columna, menos el margen fijo de la cajita de ID y el padding
 * del texto hasta el borde) — los planos reales también abrevian
 * agresivamente en cada rama, pero acá se trunca al máximo real que entra,
 * no a un número de caracteres fijo (ver `truncarA`/`maxCharsEnAncho`).
 */
const ANCHO_TEXTO_COLUMNA = COLUMNA_ANCHO - 14;

type RenglonUnifilar = { tipo: "header"; texto: string } | { tipo: "columnas"; arboles: NodoArbol[] };

/** Ordena los árboles de un cuerpo (por la cabeza de cada uno), intercala un renglón de encabezado por cada cambio de sección (energía AC → DC → control de acceso → CCTV), y agrupa por fila respetando el ancho en slots de cada árbol (un árbol con ramas puede ocupar varios slots) hasta llenar `COLUMNAS_POR_FILA`. Un árbol más ancho que una fila entera igual se dibuja solo en su propia fila — nunca se parte un árbol a la mitad. */
function prepararRenglones(circuitos: UnifilarCircuito[]): RenglonUnifilar[] {
  const arboles = construirArboles(circuitos).sort((a, b) => compararCircuitos(a.circuito, b.circuito));
  const renglones: RenglonUnifilar[] = [];
  let grupoActual: GrupoUnifilar | null = null;
  let pendientes: NodoArbol[] = [];
  let slotsPendientes = 0;

  const flush = () => {
    if (pendientes.length > 0) {
      renglones.push({ tipo: "columnas", arboles: pendientes });
      pendientes = [];
      slotsPendientes = 0;
    }
  };

  for (const arbol of arboles) {
    const grupo = grupoDeCircuito(arbol.circuito);
    if (grupo !== grupoActual) {
      flush();
      renglones.push({ tipo: "header", texto: LABEL_GRUPO[grupo] });
      grupoActual = grupo;
    }
    const slots = anchoEnSlots(arbol);
    if (pendientes.length > 0 && slotsPendientes + slots > COLUMNAS_POR_FILA) flush();
    pendientes.push(arbol);
    slotsPendientes += slots;
    if (slotsPendientes >= COLUMNAS_POR_FILA) flush();
  }
  flush();
  return renglones;
}

function altoRenglon(r: RenglonUnifilar): number {
  if (r.tipo === "header") return ALTO_HEADER_SECCION;
  const profundidadMaxFila = Math.max(...r.arboles.map(profundidadMax));
  return alturaColumna(profundidadMaxFila);
}

/**
 * Dibuja un nodo del árbol de encadenado (un dispositivo) dentro del tramo
 * horizontal `[xLeft, xRight]` que le toca, arrancando en `yAnchor`:
 * - Si no tiene hijos, es el final de la rama: bloque de datos completo +
 *   cajita de identificación (igual que un circuito suelto).
 * - Si tiene UN hijo, el hijo ocupa el mismo tramo horizontal completo —
 *   la rama sigue derecho hacia abajo, sin ramificarse (caso común: térmica
 *   con su disyuntor debajo).
 * - Si tiene VARIOS hijos (patrón "grupo"), el tramo se reparte entre ellos
 *   según el ancho en slots de cada uno, con un sub-bus horizontal que los
 *   conecta — cada hijo pasa a tener su propia sub-columna, con el mismo
 *   ancho que tendría un circuito suelto.
 */
function dibujarNodo(
  commands: DrawCommand[],
  nodo: NodoArbol,
  xLeft: number,
  xRight: number,
  yAnchor: number,
  nivel: number,
  configCalibre: ConfigCalibreCable[],
  codigos: Map<number, string>,
  ctr: ContadorConductor,
): void {
  const c = nodo.circuito;
  const codigo = codigos.get(c.numero);
  const cx = (xLeft + xRight) / 2;

  // Tramo de entrada a este dispositivo: cable con su marca de formación
  // (A6) + un par de bornes numerado (A4) — mismo paso tanto para el primer
  // dispositivo de la columna (baja de la barra, nivel 0) como para
  // cualquier encadenado, porque los dos casos dibujan exactamente lo mismo.
  const { calibreMm2, colores } = calcularCalibreCircuito(c.categoriaEquipo, c.tipoCircuito, c.ampNominal, configCalibre);
  const formacion = formatearFormacionCable(calibreMm2, c.tipoCircuito);
  const yBorneEntrada = yAnchor + CABLE_SEG + PRE_BORNE_GAP + BORNE_ALTO / 2;
  marcaCable(commands, cx, yAnchor, yBorneEntrada, formacion, c.tipoCircuito);
  dibujarBorneNumerado(commands, cx, yBorneEntrada, ctr);
  const ySymbol = yBorneEntrada + BORNE_ALTO / 2 + POST_BORNE_GAP + SIMBOLO_R;
  commands.push({ type: "line", x1: cx, y1: yBorneEntrada, x2: cx, y2: ySymbol - SIMBOLO_R, layer: "BARRA" });
  dibujarSimbolo(commands, c.categoriaEquipo, cx, ySymbol);
  const yDespues = ySymbol + SIMBOLO_R;

  if (nodo.hijos.length > 0) {
    // Eslabón intermedio (ej. la térmica/disyuntor general de la que cuelga lo siguiente): una sola línea compacta al costado del símbolo.
    const amperaje = parseAmperaje(c.ampNominal);
    // El código va PRIMERO (no al final): varias categorías tienen nombre
    // largo ("Disyuntor/Diferencial", "Bornera doble piso c/ fusible") que
    // por sí solo ya agota el ancho truncado de un eslabón intermedio — si
    // el código fuera al final, nunca llegaría a verse.
    const partes = [codigo, CATEGORIA_EQUIPO_LABEL[c.categoriaEquipo], amperaje ? `${amperaje}A` : null].filter((p): p is string => !!p);
    // Ancho real disponible: desde el texto (al costado del símbolo, centrado en la sub-columna) hasta el borde derecho de esa sub-columna — no un número fijo, porque una sub-columna de un "grupo" puede ser más angosta que una columna entera.
    const anchoEslabon = xRight - (cx + SIMBOLO_R + 2) - 2;
    commands.push({ type: "text", x: cx + SIMBOLO_R + 2, y: ySymbol + 2, text: truncarA(partes.join(" "), anchoEslabon, 5.5), size: 5.5, layer: "TEXTO" });

    let offset = 0;
    const subTramos = nodo.hijos.map((hijo) => {
      const slots = anchoEnSlots(hijo);
      const hXLeft = xLeft + offset * COLUMNA_ANCHO;
      offset += slots;
      return { xLeft: hXLeft, xRight: hXLeft + slots * COLUMNA_ANCHO, hijo };
    });
    if (subTramos.length > 1) {
      const subCentros = subTramos.map((t) => (t.xLeft + t.xRight) / 2);
      commands.push({ type: "line", x1: subCentros[0], y1: yDespues, x2: subCentros[subCentros.length - 1], y2: yDespues, layer: "BARRA" });
    }
    subTramos.forEach((t) => dibujarNodo(commands, t.hijo, t.xLeft, t.xRight, yDespues, nivel + 1, configCalibre, codigos, ctr));
    return;
  }

  // Hoja: tramo final hasta el destino — mismo criterio del tramo de
  // entrada (cable con marca + borne numerado, A4/A6), con la misma
  // formación (el cable que sale de este dispositivo hacia el destino está
  // protegido por él, así que comparte calibre con el de entrada).
  const yBorneDestino = yDespues + CABLE_SEG + PRE_BORNE_GAP + BORNE_ALTO / 2;
  marcaCable(commands, cx, yDespues, yBorneDestino, formacion, c.tipoCircuito);
  dibujarBorneNumerado(commands, cx, yBorneDestino, ctr);
  const yEtiqueta = yBorneDestino + BORNE_ALTO / 2 + 3;
  commands.push({ type: "line", x1: cx, y1: yBorneDestino, x2: cx, y2: yEtiqueta, layer: "BARRA" });

  const colLeft = xLeft + 3;
  const amperaje = parseAmperaje(c.ampNominal);
  const sufijo = c.rolBypassUps ? ROL_BYPASS_SUFIJO[c.rolBypassUps] : c.alimentadoPorUps ? " (UPS)" : "";
  // Mismo criterio que arriba: el código va PRIMERO para que sobreviva al
  // truncado aunque el nombre de la categoría sea largo.
  const linea1 = codigo ? `${codigo} — ${CATEGORIA_EQUIPO_LABEL[c.categoriaEquipo]}${sufijo}` : `${CATEGORIA_EQUIPO_LABEL[c.categoriaEquipo]}${sufijo}`;
  const linea2Partes = [c.tipoCircuito !== "na" ? TIPO_CIRCUITO_LABEL[c.tipoCircuito] : null, amperaje ? `${amperaje}A` : null].filter(
    (p): p is string => !!p,
  );
  const linea3Partes = [formacion, colores].filter((p): p is string => !!p);
  const specs = [linea1, linea2Partes.join(" "), linea3Partes.join(" ")].filter((s) => s.length > 0);
  specs.slice(0, LINEAS_SPEC).forEach((s, li) => {
    const bold = li === 0;
    commands.push({
      type: "text",
      x: colLeft,
      y: yEtiqueta + ALTO_LINEA * (li + 1),
      text: truncarA(s, ANCHO_TEXTO_COLUMNA, 6, bold),
      size: 6,
      bold,
      layer: "TEXTO",
    });
  });

  const yId = yEtiqueta + LINEAS_SPEC * ALTO_LINEA + 4;
  commands.push({ type: "rect", x: colLeft - 1, y: yId, width: COLUMNA_ANCHO - 8, height: ALTO_ID_BOX, layer: "ROTULO" });
  const etiquetaId = c.etiquetaCable ? `${c.numero} — ${c.texto} (${c.etiquetaCable})` : `${c.numero} — ${c.texto}`;
  commands.push({ type: "text", x: colLeft + 2, y: yId + 9, text: truncarA(etiquetaId, ANCHO_TEXTO_COLUMNA, 6.5, true), size: 6.5, bold: true, layer: "ROTULO" });
}

/** Arma los draw commands de un cuerpo ya resuelto en renglones (columnas de circuitos + encabezados de sección) y su mapa de códigos de equipo. Compartido por `construirUnifilar` y `construirUnifilarPaginado` para que el dibujo de a pedazos (paginado) sea idéntico al dibujo completo. */
function renderGrupos(grupos: [string, RenglonUnifilar[], Map<number, string>][], configCalibre: ConfigCalibreCable[]): UnifilarDrawing {
  const commands: DrawCommand[] = [];
  let y = MARGEN;

  for (const [cuerpo, renglones, codigos] of grupos) {
    const alturaBloque = ALTO_HEADER_CUERPO + renglones.reduce((acc, r) => acc + altoRenglon(r), 0);
    const yInicioBloque = y;
    // Numeración de conductores ("A n") correlativa dentro de este cuerpo —
    // reinicia por cuerpo, mismo criterio que `codigos` (ver comentario de
    // `nuevoContadorConductor`).
    const ctr = nuevoContadorConductor();

    commands.push({ type: "rect", x: MARGEN, y: yInicioBloque, width: ANCHO - MARGEN * 2, height: alturaBloque, layer: "MARCO" });
    commands.push({ type: "text", x: MARGEN + 6, y: yInicioBloque + 12, text: cuerpo || "Sin cuerpo asignado", size: 9, bold: true, layer: "TEXTO" });

    let yRenglon = yInicioBloque + ALTO_HEADER_CUERPO;
    for (const renglon of renglones) {
      if (renglon.tipo === "header") {
        commands.push({ type: "text", x: MARGEN + 6, y: yRenglon + 9, text: renglon.texto, size: 7.5, bold: true, layer: "TEXTO" });
        yRenglon += ALTO_HEADER_SECCION;
        continue;
      }

      const yBus = yRenglon + 3;
      let offsetSlots = 0;
      const tramos = renglon.arboles.map((arbol) => {
        const slots = anchoEnSlots(arbol);
        const xLeft = MARGEN + offsetSlots * COLUMNA_ANCHO;
        offsetSlots += slots;
        return { xLeft, xRight: xLeft + slots * COLUMNA_ANCHO, arbol };
      });
      const centros = tramos.map((t) => (t.xLeft + t.xRight) / 2);
      // Barra horizontal del renglón (doble línea) de la primera a la última columna usada.
      if (centros.length > 1) {
        commands.push({ type: "line", x1: centros[0], y1: yBus, x2: centros[centros.length - 1], y2: yBus, layer: "BARRA" });
        commands.push({ type: "line", x1: centros[0], y1: yBus + 1.2, x2: centros[centros.length - 1], y2: yBus + 1.2, layer: "BARRA" });
      }

      tramos.forEach((t) => dibujarNodo(commands, t.arbol, t.xLeft, t.xRight, yBus, 0, configCalibre, codigos, ctr));

      yRenglon += altoRenglon(renglon);
    }

    y = yInicioBloque + alturaBloque + GAP_CUERPO;
  }

  return { commands, width: ANCHO, height: y };
}

/** Alto del cuadro de título (rótulo) que se agrega al pie de cada hoja. */
const ALTO_ROTULO = 28;
/** Espacio reservado alrededor del contenido para la grilla 1-16/A-H (números/letras + flechas de centrado, A2 del estándar) — por fuera del marco de la hoja. */
const BANDA_GRID = 10;
/** Espacio reservado ARRIBA, dentro del marco, para el título (2 líneas), el bloque de revisiones y el sello — el contenido del circuito empieza debajo de esta banda, nunca la pisa. */
const BANDA_TITULO = 34;
const GRID_COLS = 16;
const GRID_ROWS = 8;
const LETRAS_GRID = "ABCDEFGH";
/** Alto que `agregarMarcoYRotulo` agrega a CUALQUIER contenido (grilla + banda de título + rótulo) — toda altura de contenido tiene que presupuestar esto para no superar `ALTO_MAX_BLOQUE_SEGURO` una vez envuelta en su hoja (ver construirUnifilarPaginado y construirTablaTierra). */
const ALTURA_MARCO_HOJA = BANDA_GRID * 2 + 8 + BANDA_TITULO + ALTO_ROTULO;

function trasladarComandos(commands: DrawCommand[], dx: number, dy: number): DrawCommand[] {
  return commands.map((c) => {
    if (c.type === "line") return { ...c, x1: c.x1 + dx, y1: c.y1 + dy, x2: c.x2 + dx, y2: c.y2 + dy };
    if (c.type === "circle") return { ...c, x: c.x + dx, y: c.y + dy };
    return { ...c, x: c.x + dx, y: c.y + dy };
  });
}

/**
 * Convierte un bloque de contenido ya armado (cuerpos + circuitos) en una
 * hoja completa del estándar de dibujo (ver REGLAS_UNIFILAR.md parte A2):
 * marco con grilla 1-16 arriba/abajo y A-H izq/der con flechas de
 * centrado en los 4 lados, bloque de revisiones arriba a la derecha,
 * título arriba a la izquierda (2 líneas), sello "PARA REVISIÓN" mientras
 * no esté aprobado, y el rótulo de cuadro de título al pie (cliente/
 * contratista/obra/etc. — contenido completo en `armarTextoRotulo`, ver
 * `tableros/nuevo/actions.ts`). No es parte de `renderGrupos` porque la
 * numeración de hoja (`hojaActual`/`hojaTotal`) solo se conoce después de
 * resolver TODAS las hojas (ver `construirUnifilarPaginado`).
 */
function agregarMarcoYRotulo(drawing: UnifilarDrawing, rotulo: RotuloUnifilar, hojaActual: number, hojaTotal: number): UnifilarDrawing {
  const contenido = trasladarComandos(drawing.commands, BANDA_GRID, BANDA_GRID + BANDA_TITULO);
  const anchoInterior = drawing.width;
  const altoInterior = BANDA_TITULO + drawing.height + ALTO_ROTULO;
  const bx = BANDA_GRID;
  const by = BANDA_GRID;
  const commands: DrawCommand[] = [...contenido];

  // Marco (borde de la hoja).
  commands.push({ type: "rect", x: bx, y: by, width: anchoInterior, height: altoInterior, layer: "MARCO" });

  // Grilla 1-16 arriba/abajo, A-H izq/der, con flechas de centrado en los 4 lados.
  const colW = anchoInterior / GRID_COLS;
  const rowH = altoInterior / GRID_ROWS;
  for (let i = 0; i <= GRID_COLS; i++) {
    const x = bx + i * colW;
    commands.push({ type: "line", x1: x, y1: by, x2: x, y2: by + 3, layer: "MARCO" });
    commands.push({ type: "line", x1: x, y1: by + altoInterior - 3, x2: x, y2: by + altoInterior, layer: "MARCO" });
    if (i < GRID_COLS) {
      commands.push({ type: "text", x: x + colW / 2 - 2, y: by - 2, text: String(i + 1), size: 3, layer: "MARCO" });
      commands.push({ type: "text", x: x + colW / 2 - 2, y: by + altoInterior + 6, text: String(i + 1), size: 3, layer: "MARCO" });
    }
  }
  for (let i = 0; i <= GRID_ROWS; i++) {
    const y = by + i * rowH;
    commands.push({ type: "line", x1: bx, y1: y, x2: bx + 3, y2: y, layer: "MARCO" });
    commands.push({ type: "line", x1: bx + anchoInterior - 3, y1: y, x2: bx + anchoInterior, y2: y, layer: "MARCO" });
    if (i < GRID_ROWS) {
      commands.push({ type: "text", x: bx - 6, y: y + rowH / 2 + 2, text: LETRAS_GRID[i], size: 3, layer: "MARCO" });
      commands.push({ type: "text", x: bx + anchoInterior + 3, y: y + rowH / 2 + 2, text: LETRAS_GRID[i], size: 3, layer: "MARCO" });
    }
  }
  const midX = bx + anchoInterior / 2;
  const midY = by + altoInterior / 2;
  const fl = 3;
  commands.push(
    { type: "line", x1: midX - fl, y1: by, x2: midX, y2: by - fl * 1.5, layer: "MARCO" },
    { type: "line", x1: midX + fl, y1: by, x2: midX, y2: by - fl * 1.5, layer: "MARCO" },
    { type: "line", x1: midX - fl, y1: by + altoInterior, x2: midX, y2: by + altoInterior + fl * 1.5, layer: "MARCO" },
    { type: "line", x1: midX + fl, y1: by + altoInterior, x2: midX, y2: by + altoInterior + fl * 1.5, layer: "MARCO" },
    { type: "line", x1: bx, y1: midY - fl, x2: bx - fl * 1.5, y2: midY, layer: "MARCO" },
    { type: "line", x1: bx, y1: midY + fl, x2: bx - fl * 1.5, y2: midY, layer: "MARCO" },
    { type: "line", x1: bx + anchoInterior, y1: midY - fl, x2: bx + anchoInterior + fl * 1.5, y2: midY, layer: "MARCO" },
    { type: "line", x1: bx + anchoInterior, y1: midY + fl, x2: bx + anchoInterior + fl * 1.5, y2: midY, layer: "MARCO" },
  );

  // Título arriba a la izquierda (2 líneas: tablero, y hoja actual/total).
  commands.push(
    { type: "text", x: bx + 6, y: by + 13, text: truncar(`TABLERO ${rotulo.tablero}`, 48), size: 9, bold: true, layer: "MARCO" },
    { type: "text", x: bx + 6, y: by + 24, text: `UNIFILAR — HOJA ${hojaActual}/${hojaTotal}`, size: 5, layer: "MARCO" },
  );

  // Bloque de revisiones arriba a la derecha.
  const rbW = 150;
  const rbH = 9;
  const rbX = bx + anchoInterior - rbW;
  const rbY = by;
  commands.push({ type: "rect", x: rbX, y: rbY, width: rbW, height: rbH, layer: "MARCO" });
  const colsRev = [
    { label: "RevNo", w: 16 },
    { label: "Revision note", w: 62 },
    { label: "Date", w: 24 },
    { label: "Signature", w: 24 },
    { label: "Checked", w: 24 },
  ];
  let cx = rbX;
  for (const col of colsRev) {
    commands.push({ type: "text", x: cx + 1.5, y: rbY + rbH / 2 + 1.5, text: col.label, size: 3, layer: "MARCO" });
    cx += col.w;
    if (cx < rbX + rbW) commands.push({ type: "line", x1: cx, y1: rbY, x2: cx, y2: rbY + rbH, layer: "MARCO" });
  }

  // Sello "PARA REVISIÓN" (se quita en la versión final aprobada) — ancho
  // estimado a mano (no hay alineación "derecha" en DrawCommand.text) para
  // que el texto nunca se corte contra el borde derecho de la hoja.
  const selloTexto = "PARA REVISIÓN";
  const selloAncho = selloTexto.length * 11 * 0.62;
  commands.push({ type: "text", x: rbX + rbW - selloAncho, y: rbY + 24, text: selloTexto, size: 11, bold: true, layer: "SELLO" });

  // Rótulo (cuadro de título) al pie, abajo a la derecha.
  const rotY = by + BANDA_TITULO + drawing.height;
  const rotW = anchoInterior - MARGEN;
  commands.push({ type: "rect", x: bx + MARGEN, y: rotY, width: rotW, height: ALTO_ROTULO, layer: "MARCO" });
  commands.push({
    type: "text",
    x: bx + MARGEN + 6,
    y: rotY + 11,
    text: truncar(`CLIENTE: ${rotulo.cliente}   ·   CONTRATISTA: ${rotulo.contratista}   ·   OBRA: ${rotulo.sitio}`, 90),
    size: 6.5,
    bold: true,
    layer: "ROTULO",
  });
  commands.push({
    type: "text",
    x: bx + MARGEN + 6,
    y: rotY + 22,
    text: truncar(
      `FECHA: ${rotulo.fecha}   ·   REALIZÓ: ${rotulo.realizo}   ·   N° PLANO: ${rotulo.numeroGeneracion}   ·   HOJA ${hojaActual}/${hojaTotal}`,
      100,
    ),
    size: 6,
    layer: "ROTULO",
  });

  return {
    commands,
    width: anchoInterior + BANDA_GRID * 2 + 8,
    height: altoInterior + BANDA_GRID * 2 + 8,
  };
}

/** Circuitos "hoja" (destinos reales, sin hijos) de un árbol de encadenado, en el mismo orden en que `dibujarNodo` los recorre. */
function hojasDeArbol(nodo: NodoArbol): UnifilarCircuito[] {
  if (nodo.hijos.length === 0) return [nodo.circuito];
  return nodo.hijos.flatMap(hojasDeArbol);
}

interface FilaTierra {
  tn: number;
  etiqueta: string;
}

/**
 * Arma las filas T1..Tn de la tabla de PUESTA A TIERRA (A7 del estándar):
 * un Tn correlativo por cada destino real del tablero (hoja del árbol de
 * encadenado — un eslabón intermedio como una térmica general no es un
 * destino en sí), único para TODO el tablero, no por cuerpo — recorre
 * `grupos` en el mismo orden en que se dibuja, así Tn sigue el orden
 * visual de los circuitos.
 */
function filasTierra(grupos: [string, RenglonUnifilar[], Map<number, string>][]): FilaTierra[] {
  const filas: FilaTierra[] = [];
  let tn = 1;
  for (const [, renglones, codigos] of grupos) {
    for (const renglon of renglones) {
      if (renglon.tipo === "header") continue;
      for (const arbol of renglon.arboles) {
        for (const hoja of hojasDeArbol(arbol)) {
          const codigo = codigos.get(hoja.numero);
          // Sin truncar acá: el ancho real de columna solo se conoce en `construirTablaTierra`, recién cuando se sabe en cuántas columnas entró la tabla completa.
          const etiqueta = codigo ? `${codigo} — ${hoja.texto}` : hoja.texto;
          filas.push({ tn: tn++, etiqueta });
        }
      }
    }
  }
  return filas;
}

const ALTO_FILA_TIERRA = 6;
/**
 * El contenido de esta tabla, igual que cualquier otro bloque, se envuelve
 * después con `agregarMarcoYRotulo` (que agrega `ALTURA_MARCO_HOJA`) — así
 * que el presupuesto de filas tiene que calar contra
 * `ALTO_MAX_BLOQUE_SEGURO - ALTURA_MARCO_HOJA`, no contra 480 directo (un
 * bug real: con 60 filas/columna el contenido entraba bien pero, sumado el
 * marco, superaba el límite seguro de react-pdf — ver CRITERIOS_Y_IDEAS.md
 * § 19). 55 filas × 6pt = 330pt de filas + ~42pt de título/márgenes ≈ 372pt
 * de contenido, con margen de sobra debajo del presupuesto real (390pt).
 */
const MAX_FILAS_POR_COLUMNA_TIERRA = 55;
const MAX_COLUMNAS_TIERRA = 6;
const FILAS_POR_BLOQUE_TIERRA = MAX_FILAS_POR_COLUMNA_TIERRA * MAX_COLUMNAS_TIERRA;

/** Dibuja hasta `FILAS_POR_BLOQUE_TIERRA` filas de la tabla PUESTA A TIERRA como un bloque de contenido propio (mismas coordenadas locales que un bloque de `renderGrupos`), repartidas en columnas para no superar el alto seguro. */
function construirTablaTierra(filas: FilaTierra[]): UnifilarDrawing {
  const columnas = Math.min(MAX_COLUMNAS_TIERRA, Math.max(1, Math.ceil(filas.length / MAX_FILAS_POR_COLUMNA_TIERRA)));
  const filasPorColumna = Math.ceil(filas.length / columnas);
  const colW = (ANCHO - MARGEN * 2) / columnas;
  const yTitulo = MARGEN + 12;
  const yInicioFilas = yTitulo + 10;

  // Ancho real de ESTA columna (depende de en cuántas columnas entró la tabla completa, por eso se trunca acá y no en `filasTierra`).
  const anchoTextoTierra = colW - 8;
  const commands: DrawCommand[] = [{ type: "text", x: MARGEN + 6, y: yTitulo, text: "PUESTA A TIERRA", size: 9, bold: true, layer: "TIERRA" }];
  filas.forEach((f, i) => {
    const col = Math.floor(i / filasPorColumna);
    const row = i % filasPorColumna;
    commands.push({
      type: "text",
      x: MARGEN + 4 + col * colW,
      y: yInicioFilas + row * ALTO_FILA_TIERRA + 4,
      text: truncarA(`T${f.tn}  ${f.etiqueta}`, anchoTextoTierra, 5),
      size: 5,
      layer: "TIERRA",
    });
  });

  const height = yInicioFilas + filasPorColumna * ALTO_FILA_TIERRA + MARGEN;
  commands.unshift({ type: "rect", x: MARGEN, y: MARGEN, width: ANCHO - MARGEN * 2, height: height - MARGEN * 2, layer: "TIERRA" });
  return { commands, width: ANCHO, height };
}

/** Parte la tabla de tierra en varios bloques si no entra en uno solo (tablero con muchísimos circuitos) — mismo criterio de partición que `construirUnifilarPaginado`. */
function construirBloquesTierra(filas: FilaTierra[]): UnifilarDrawing[] {
  const bloques: UnifilarDrawing[] = [];
  for (let i = 0; i < filas.length; i += FILAS_POR_BLOQUE_TIERRA) {
    bloques.push(construirTablaTierra(filas.slice(i, i + FILAS_POR_BLOQUE_TIERRA)));
  }
  return bloques;
}

/**
 * Arma un esquema unifilar simplificado (no es un plano a escala — ver
 * README): una barra vertical por cuerpo con cada elemento ramificando en
 * fila (símbolo según categoría — llave, borne o caja de equipo — agrupado
 * en secciones energía AC/DC → control de acceso → CCTV, ver
 * `ordenarCircuitosParaUnifilar`), calibre de cable determinado por
 * catalogo_calibre_cable según el amperaje ya cargado — nunca estimado/
 * inventado. Devuelve "draw commands" abstractos (líneas/rectángulos/texto,
 * cada uno con su capa DXF) que después se renderizan tanto en el PDF (Svg
 * de react-pdf, que ignora la capa) como en el DXF (que sí la usa) — una
 * sola fuente de verdad para los dos formatos. `rotulo`, si se pasa, agrega
 * el cuadro de título al pie (hoja única 1/1 — este dibujo nunca se parte).
 */
export function construirUnifilar(
  circuitosPorCuerpo: Iterable<[string, UnifilarCircuito[]]>,
  configCalibre: ConfigCalibreCable[],
  rotulo?: RotuloUnifilar,
): UnifilarDrawing {
  const grupos: [string, RenglonUnifilar[], Map<number, string>][] = [];
  for (const [cuerpo, circuitos] of circuitosPorCuerpo) {
    grupos.push([cuerpo, prepararRenglones(circuitos), calcularCodigosEquipo(circuitos)]);
  }
  const drawing = renderGrupos(grupos, configCalibre);
  if (!rotulo) return drawing;

  // Tabla de PUESTA A TIERRA (A7) al pie del mismo dibujo — el DXF es
  // siempre una hoja única (sin límite de altura por bloque, a diferencia
  // del PDF), así que entra como más contenido de la misma hoja.
  const filasT = filasTierra(grupos);
  if (filasT.length === 0) return agregarMarcoYRotulo(drawing, rotulo, 1, 1);
  const tabla = construirBloquesTierra(filasT).reduce<UnifilarDrawing>(
    (acc, b) => ({ commands: [...acc.commands, ...trasladarComandos(b.commands, 0, acc.height)], width: Math.max(acc.width, b.width), height: acc.height + b.height }),
    { commands: [], width: ANCHO, height: 0 },
  );
  const combinado: UnifilarDrawing = {
    commands: [...drawing.commands, ...trasladarComandos(tabla.commands, 0, drawing.height)],
    width: Math.max(drawing.width, tabla.width),
    height: drawing.height + tabla.height,
  };
  return agregarMarcoYRotulo(combinado, rotulo, 1, 1);
}

/**
 * @react-pdf/renderer queda colgado (sin excepción, sin timeout propio) al
 * renderizar un bloque del esquema unifilar (Svg + muchos <Text> absolutos
 * apilados dentro de un mismo View) por encima de cierta altura — confirmado
 * reproduciendo el cuelgue localmente: con 39 circuitos en un solo cuerpo
 * (altura ~662pt) renderiza bien, con 40 (~678pt) el proceso no vuelve más
 * (ver CRITERIOS_Y_IDEAS.md § 10). Esta altura máxima por bloque, bien por
 * debajo de ese punto, es el límite real que no hay que cruzar nunca en el
 * PDF — ver UNIFILAR_ALTO_MAX_BLOQUE_PDF en tablero.tsx para el valor usado.
 */
const ALTO_MAX_BLOQUE_SEGURO = 480;

/**
 * Versión paginada de `construirUnifilar`, pensada para el PDF: en vez de
 * un solo dibujo gigante (que puede superar el alto seguro de un bloque),
 * devuelve una lista de dibujos más chicos — cada uno garantizado por
 * debajo de `ALTO_MAX_BLOQUE_SEGURO` sin importar cuántos circuitos tenga
 * el tablero en total. Un cuerpo que por sí solo ya supera el máximo se
 * parte en "Cuerpo X (parte 1/N)", "(parte 2/N)", etc.; cuerpos chicos
 * consecutivos se agrupan en el mismo bloque mientras entren juntos, para
 * no desperdiciar espacio con un bloque por cuerpo cuando no hace falta.
 * El DXF (que no pasa por react-pdf y no tiene este problema) sigue
 * usando `construirUnifilar` directo, con el dibujo completo sin partir.
 * `rotulo`, si se pasa, agrega el cuadro de título al pie de CADA hoja, con
 * "HOJA i/N" — N solo se conoce acá, después de resolver todos los bloques.
 */
export function construirUnifilarPaginado(
  circuitosPorCuerpo: Map<string, UnifilarCircuito[]>,
  configCalibre: ConfigCalibreCable[],
  rotulo?: RotuloUnifilar,
): UnifilarDrawing[] {
  // Se reserva el espacio del marco completo (grilla + título + sello +
  // rótulo, ver `agregarMarcoYRotulo`) acá, aunque no se termine agregando
  // — para que ningún bloque, con o sin marco, se acerque al alto real que
  // cuelga react-pdf (ver comentario de ALTO_MAX_BLOQUE_SEGURO). Más
  // margen de sobra nunca es un problema, solo parte en una hoja más.
  const limiteBloque = ALTO_MAX_BLOQUE_SEGURO - ALTURA_MARCO_HOJA;
  const maxAlturaRenglones = limiteBloque - MARGEN - GAP_CUERPO - ALTO_HEADER_CUERPO;

  const grupos: [string, RenglonUnifilar[], Map<number, string>][] = [];
  for (const [cuerpo, circuitosOriginal] of circuitosPorCuerpo) {
    // Se arman los renglones (orden + encabezados de sección + columnas) ACÁ,
    // antes de partir en páginas, no solo dentro de `renderGrupos` — si se
    // armaran después de partir, cada parte quedaría prolija por separado
    // pero el corte entre partes caería en cualquier lado, mezclando los
    // grupos de categoría entre una parte y la siguiente.
    const renglones = prepararRenglones(circuitosOriginal);
    // Los códigos de equipo son por CUERPO completo (no por parte): se
    // calculan una sola vez acá y se reutilizan en todas las partes de
    // este mismo cuerpo, para que una bornera no cambie de código según
    // en qué parte terminó cayendo.
    const codigos = calcularCodigosEquipo(circuitosOriginal);
    const alturaTotal = renglones.reduce((acc, r) => acc + altoRenglon(r), 0);
    if (alturaTotal <= maxAlturaRenglones) {
      grupos.push([cuerpo, renglones, codigos]);
      continue;
    }
    // Un cuerpo que por sí solo supera el máximo se parte por renglón
    // (nunca a mitad de una fila de columnas) en "parte N/M".
    const partes: RenglonUnifilar[][] = [];
    let parteActual: RenglonUnifilar[] = [];
    let alturaParte = 0;
    for (const r of renglones) {
      const alturaR = altoRenglon(r);
      if (parteActual.length > 0 && alturaParte + alturaR > maxAlturaRenglones) {
        partes.push(parteActual);
        parteActual = [];
        alturaParte = 0;
      }
      parteActual.push(r);
      alturaParte += alturaR;
    }
    if (parteActual.length > 0) partes.push(parteActual);
    partes.forEach((p, i) => grupos.push([`${cuerpo || "Sin cuerpo asignado"} (parte ${i + 1}/${partes.length})`, p, codigos]));
  }

  const bloques: UnifilarDrawing[] = [];
  let actual: [string, RenglonUnifilar[], Map<number, string>][] = [];
  let alturaActual = MARGEN;
  for (const grupo of grupos) {
    const alturaGrupo = ALTO_HEADER_CUERPO + grupo[1].reduce((acc, r) => acc + altoRenglon(r), 0) + GAP_CUERPO;
    if (actual.length > 0 && alturaActual + alturaGrupo > limiteBloque) {
      bloques.push(renderGrupos(actual, configCalibre));
      actual = [];
      alturaActual = MARGEN;
    }
    actual.push(grupo);
    alturaActual += alturaGrupo;
  }
  if (actual.length > 0) bloques.push(renderGrupos(actual, configCalibre));

  // Tabla de PUESTA A TIERRA (A7) como su propia hoja al final — usa
  // `grupos` completo (antes de partir en bloques) para que Tn recorra
  // TODOS los circuitos del tablero en orden, no solo los del último
  // bloque armado arriba.
  bloques.push(...construirBloquesTierra(filasTierra(grupos)));

  return rotulo ? bloques.map((b, i) => agregarMarcoYRotulo(b, rotulo, i + 1, bloques.length)) : bloques;
}

/** Agrupa circuitos por cuerpo preservando el orden de aparición (los sin cuerpo quedan en un grupo aparte, al final). */
export function agruparPorCuerpo<T extends { cuerpo: string | null }>(circuitos: T[]): Map<string, T[]> {
  const conCuerpo = new Map<string, T[]>();
  const sinCuerpo: T[] = [];
  for (const c of circuitos) {
    if (!c.cuerpo) {
      sinCuerpo.push(c);
      continue;
    }
    conCuerpo.set(c.cuerpo, [...(conCuerpo.get(c.cuerpo) ?? []), c]);
  }
  if (sinCuerpo.length > 0) conCuerpo.set("", sinCuerpo);
  return conCuerpo;
}
