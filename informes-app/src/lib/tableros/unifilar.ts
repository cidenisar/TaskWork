import { CATEGORIA_EQUIPO_LABEL, TIPO_CIRCUITO_LABEL } from "@/components/tableros/types";
import { calcularCalibreCircuito, formatearFormacionCable, parseAmperaje, type ConfigCalibreCable } from "./calibre-cable";
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
export type CapaDxf = "MARCO" | "BARRA" | "SIMBOLOS" | "ROTULO" | "TEXTO";

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

const BUS_DROP = 8;
const SIMBOLO_R = 5;
const PASO_ENCADENADO = SIMBOLO_R * 2 + 3;
const DROP_A_ETIQUETA = 6;
const ALTO_LINEA = 7;
const LINEAS_SPEC = 3;
const ALTO_ID_BOX = 12;

/** Altura (desde la barra del renglón hasta el pie de la cajita de ID) de una columna con `profundidad` dispositivos encadenados en la rama más larga — calculada simulando los mismos pasos que dibuja `dibujarNodo`, para que nunca quede corta. Una rama que se abre en varias sub-columnas (patrón "grupo") no agrega altura extra: el sub-bus se apoya exactamente donde terminaría el siguiente escalón de una cadena lineal, así que la altura depende solo de la profundidad máxima, nunca de cuántas ramas hay. */
function alturaColumna(profundidad: number): number {
  let yAnchor = 0;
  for (let nivel = 0; nivel < profundidad; nivel++) {
    const paso = nivel === 0 ? BUS_DROP : PASO_ENCADENADO;
    yAnchor = yAnchor + paso + SIMBOLO_R;
  }
  return yAnchor + DROP_A_ETIQUETA + LINEAS_SPEC * ALTO_LINEA + 4 + ALTO_ID_BOX;
}

function truncar(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
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

/** Trunca a un ancho de columna angosto (~100pt) — los planos reales también abrevian agresivamente en cada rama. */
function truncarColumna(s: string): string {
  return truncar(s, 16);
}

/** Trunca la etiqueta compacta de un eslabón intermedio de una cadena (va al costado del símbolo, con menos lugar todavía). */
function truncarEslabon(s: string): string {
  return truncar(s, 12);
}

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
): void {
  const c = nodo.circuito;
  const codigo = codigos.get(c.numero);
  const cx = (xLeft + xRight) / 2;
  const paso = nivel === 0 ? BUS_DROP : PASO_ENCADENADO;
  const ySymbol = yAnchor + paso;
  commands.push({ type: "line", x1: cx, y1: yAnchor, x2: cx, y2: ySymbol - SIMBOLO_R, layer: "BARRA" });
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
    commands.push({ type: "text", x: cx + SIMBOLO_R + 2, y: ySymbol + 2, text: truncarEslabon(partes.join(" ")), size: 5.5, layer: "TEXTO" });

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
    subTramos.forEach((t) => dibujarNodo(commands, t.hijo, t.xLeft, t.xRight, yDespues, nivel + 1, configCalibre, codigos));
    return;
  }

  const yEtiqueta = yDespues + DROP_A_ETIQUETA;
  commands.push({ type: "line", x1: cx, y1: yDespues, x2: cx, y2: yEtiqueta, layer: "BARRA" });

  const colLeft = xLeft + 3;
  const { calibreMm2, colores } = calcularCalibreCircuito(c.categoriaEquipo, c.tipoCircuito, c.ampNominal, configCalibre);
  const amperaje = parseAmperaje(c.ampNominal);
  const sufijo = c.rolBypassUps ? ROL_BYPASS_SUFIJO[c.rolBypassUps] : c.alimentadoPorUps ? " (UPS)" : "";
  // Mismo criterio que arriba: el código va PRIMERO para que sobreviva al
  // truncado aunque el nombre de la categoría sea largo.
  const linea1 = codigo ? `${codigo} — ${CATEGORIA_EQUIPO_LABEL[c.categoriaEquipo]}${sufijo}` : `${CATEGORIA_EQUIPO_LABEL[c.categoriaEquipo]}${sufijo}`;
  const linea2Partes = [c.tipoCircuito !== "na" ? TIPO_CIRCUITO_LABEL[c.tipoCircuito] : null, amperaje ? `${amperaje}A` : null].filter(
    (p): p is string => !!p,
  );
  const formacion = formatearFormacionCable(calibreMm2, c.tipoCircuito);
  const linea3Partes = [formacion, colores].filter((p): p is string => !!p);
  const specs = [linea1, linea2Partes.join(" "), linea3Partes.join(" ")].filter((s) => s.length > 0);
  specs.slice(0, LINEAS_SPEC).forEach((s, li) => {
    commands.push({
      type: "text",
      x: colLeft,
      y: yEtiqueta + ALTO_LINEA * (li + 1),
      text: truncarColumna(s),
      size: 6,
      bold: li === 0,
      layer: "TEXTO",
    });
  });

  const yId = yEtiqueta + LINEAS_SPEC * ALTO_LINEA + 4;
  commands.push({ type: "rect", x: colLeft - 1, y: yId, width: COLUMNA_ANCHO - 8, height: ALTO_ID_BOX, layer: "ROTULO" });
  const etiquetaId = c.etiquetaCable ? `${c.numero} — ${c.texto} (${c.etiquetaCable})` : `${c.numero} — ${c.texto}`;
  commands.push({ type: "text", x: colLeft + 2, y: yId + 9, text: truncarColumna(etiquetaId), size: 6.5, bold: true, layer: "ROTULO" });
}

/** Arma los draw commands de un cuerpo ya resuelto en renglones (columnas de circuitos + encabezados de sección) y su mapa de códigos de equipo. Compartido por `construirUnifilar` y `construirUnifilarPaginado` para que el dibujo de a pedazos (paginado) sea idéntico al dibujo completo. */
function renderGrupos(grupos: [string, RenglonUnifilar[], Map<number, string>][], configCalibre: ConfigCalibreCable[]): UnifilarDrawing {
  const commands: DrawCommand[] = [];
  let y = MARGEN;

  for (const [cuerpo, renglones, codigos] of grupos) {
    const alturaBloque = ALTO_HEADER_CUERPO + renglones.reduce((acc, r) => acc + altoRenglon(r), 0);
    const yInicioBloque = y;

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

      tramos.forEach((t) => dibujarNodo(commands, t.arbol, t.xLeft, t.xRight, yBus, 0, configCalibre, codigos));

      yRenglon += altoRenglon(renglon);
    }

    y = yInicioBloque + alturaBloque + GAP_CUERPO;
  }

  return { commands, width: ANCHO, height: y };
}

/** Alto del cuadro de título (rótulo) que se agrega al pie de cada dibujo. */
const ALTO_ROTULO = 28;

/**
 * Agrega el cuadro de título al pie de un dibujo ya armado — no es parte de
 * `renderGrupos` porque la numeración de hoja (`hojaActual`/`hojaTotal`) solo
 * se conoce después de resolver TODAS las hojas (ver
 * `construirUnifilarPaginado`, que arma primero todos los bloques y recién
 * ahí sabe cuántos son en total). Solo dos líneas de texto dentro de un
 * marco — no es la grilla/sello de un plano CAD real, es lo mínimo para
 * identificar de qué plano se trata si se lo encuentra suelto.
 */
function agregarRotulo(drawing: UnifilarDrawing, rotulo: RotuloUnifilar, hojaActual: number, hojaTotal: number): UnifilarDrawing {
  const y = drawing.height;
  const w = drawing.width - MARGEN * 2;
  const commands: DrawCommand[] = [
    ...drawing.commands,
    { type: "rect", x: MARGEN, y, width: w, height: ALTO_ROTULO, layer: "MARCO" },
    {
      type: "text",
      x: MARGEN + 6,
      y: y + 11,
      text: truncar(`SITIO: ${rotulo.sitio}   ·   TABLERO: ${rotulo.tablero}`, 80),
      size: 7,
      bold: true,
      layer: "ROTULO",
    },
    {
      type: "text",
      x: MARGEN + 6,
      y: y + 22,
      text: truncar(
        `FECHA: ${rotulo.fecha}   ·   REALIZÓ: ${rotulo.realizo}   ·   N° PLANO: ${rotulo.numeroGeneracion}   ·   HOJA ${hojaActual}/${hojaTotal}`,
        100,
      ),
      size: 6,
      layer: "ROTULO",
    },
  ];
  return { commands, width: drawing.width, height: y + ALTO_ROTULO + MARGEN };
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
  return rotulo ? agregarRotulo(drawing, rotulo, 1, 1) : drawing;
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
  // Se reserva el espacio del rótulo acá (aunque no se termine agregando)
  // para que ningún bloque, con o sin rótulo, se acerque al alto real que
  // cuelga react-pdf (ver comentario de ALTO_MAX_BLOQUE_SEGURO) — más
  // margen de sobra nunca es un problema, solo parte en una hoja más.
  const limiteBloque = ALTO_MAX_BLOQUE_SEGURO - ALTO_ROTULO - MARGEN;
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
  return rotulo ? bloques.map((b, i) => agregarRotulo(b, rotulo, i + 1, bloques.length)) : bloques;
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
