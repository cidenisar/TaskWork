import { CATEGORIA_EQUIPO_LABEL, TIPO_CIRCUITO_LABEL } from "@/components/tableros/types";
import { calcularCalibreCircuito, parseAmperaje, type ConfigCalibreCable } from "./calibre-cable";
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

/** Aplica el orden de dibujo convencional a una lista de circuitos de un mismo cuerpo, preservando el N° de circuito como desempate final. */
export function ordenarCircuitosParaUnifilar<T extends UnifilarCircuito>(circuitos: T[]): T[] {
  return [...circuitos].sort((a, b) => {
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
  });
}

const LABEL_GRUPO: Record<GrupoUnifilar, string> = {
  energia_ac: "ENERGÍA 380V/220V",
  energia_dc: "ENERGÍA 24V/12V",
  control_acceso: "CONTROL DE ACCESO",
  cctv: "CCTV",
};

const ROL_BYPASS_SUFIJO: Record<TableroRolBypassUps, string> = { entrada: " (E)", bypass: " (BYP)", salida: " (S)" };

export type DrawCommand =
  | { type: "line"; x1: number; y1: number; x2: number; y2: number }
  | { type: "rect"; x: number; y: number; width: number; height: number }
  | { type: "circle"; x: number; y: number; r: number }
  | { type: "text"; x: number; y: number; text: string; size: number; bold?: boolean };

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
 * Simplificación deliberada frente al plano real: acá cada circuito es UN
 * solo símbolo por columna — los planos reales a veces encadenan varios
 * dispositivos en la misma columna (ej. bornera de entrada → térmica →
 * disyuntor, los tres en la misma bajada) porque físicamente un circuito
 * pasa por más de una protección en serie. Nuestro modelo de datos
 * (`tablero_circuitos`) guarda cada dispositivo como un circuito
 * independiente, sin relación "este alimenta a este otro" — reproducir la
 * cadena real necesitaría ese dato nuevo, no es solo un cambio de dibujo.
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
const DROP_A_ETIQUETA = 6;
const ALTO_LINEA = 7;
const LINEAS_SPEC = 3;
const ALTO_ID_BOX = 12;
const ALTO_FILA_COLUMNAS = BUS_DROP + SIMBOLO_R * 2 + DROP_A_ETIQUETA + LINEAS_SPEC * ALTO_LINEA + 4 + ALTO_ID_BOX;

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
    commands.push({ type: "circle", x: cx, y: yTop, r: 1.2 });
    commands.push({ type: "circle", x: cx, y: yBot, r: 1.2 });
    commands.push({ type: "line", x1: cx, y1: yBot, x2: cx + SIMBOLO_R * 0.8, y2: yTop + SIMBOLO_R * 0.3 });
    return;
  }
  if (CATEGORIAS_BORNERA.includes(categoria)) {
    commands.push({ type: "circle", x: cx, y: cy - SIMBOLO_R * 0.5, r: 1.6 });
    commands.push({ type: "circle", x: cx, y: cy + SIMBOLO_R * 0.5, r: 1.6 });
    return;
  }
  commands.push({ type: "rect", x: cx - SIMBOLO_R, y: cy - SIMBOLO_R, width: SIMBOLO_R * 2, height: SIMBOLO_R * 2 });
}

/** Trunca a un ancho de columna angosto (~100pt) — los planos reales también abrevian agresivamente en cada rama. */
function truncarColumna(s: string): string {
  return truncar(s, 16);
}

type RenglonUnifilar = { tipo: "header"; texto: string } | { tipo: "columnas"; circuitos: UnifilarCircuito[] };

/** Ordena los circuitos de un cuerpo, intercala un renglón de encabezado por cada cambio de sección (energía AC → DC → control de acceso → CCTV), y agrupa de a `COLUMNAS_POR_FILA` para la barra horizontal tipo escalera. */
function prepararRenglones(circuitos: UnifilarCircuito[]): RenglonUnifilar[] {
  const ordenados = ordenarCircuitosParaUnifilar(circuitos);
  const renglones: RenglonUnifilar[] = [];
  let grupoActual: GrupoUnifilar | null = null;
  let pendientes: UnifilarCircuito[] = [];

  const flush = () => {
    if (pendientes.length > 0) {
      renglones.push({ tipo: "columnas", circuitos: pendientes });
      pendientes = [];
    }
  };

  for (const c of ordenados) {
    const grupo = grupoDeCircuito(c);
    if (grupo !== grupoActual) {
      flush();
      renglones.push({ tipo: "header", texto: LABEL_GRUPO[grupo] });
      grupoActual = grupo;
    }
    pendientes.push(c);
    if (pendientes.length === COLUMNAS_POR_FILA) flush();
  }
  flush();
  return renglones;
}

function altoRenglon(r: RenglonUnifilar): number {
  return r.tipo === "header" ? ALTO_HEADER_SECCION : ALTO_FILA_COLUMNAS;
}

/** Arma los draw commands de un cuerpo ya resuelto en renglones (columnas de circuitos + encabezados de sección). Compartido por `construirUnifilar` y `construirUnifilarPaginado` para que el dibujo de a pedazos (paginado) sea idéntico al dibujo completo. */
function renderGrupos(grupos: [string, RenglonUnifilar[]][], configCalibre: ConfigCalibreCable[]): UnifilarDrawing {
  const commands: DrawCommand[] = [];
  let y = MARGEN;

  for (const [cuerpo, renglones] of grupos) {
    const alturaBloque = ALTO_HEADER_CUERPO + renglones.reduce((acc, r) => acc + altoRenglon(r), 0);
    const yInicioBloque = y;

    commands.push({ type: "rect", x: MARGEN, y: yInicioBloque, width: ANCHO - MARGEN * 2, height: alturaBloque });
    commands.push({ type: "text", x: MARGEN + 6, y: yInicioBloque + 12, text: cuerpo || "Sin cuerpo asignado", size: 9, bold: true });

    let yRenglon = yInicioBloque + ALTO_HEADER_CUERPO;
    for (const renglon of renglones) {
      if (renglon.tipo === "header") {
        commands.push({ type: "text", x: MARGEN + 6, y: yRenglon + 9, text: renglon.texto, size: 7.5, bold: true });
        yRenglon += ALTO_HEADER_SECCION;
        continue;
      }

      const yBus = yRenglon + 3;
      const ySymbol = yBus + BUS_DROP;
      const centros = renglon.circuitos.map((_, i) => MARGEN + i * COLUMNA_ANCHO + COLUMNA_ANCHO / 2);
      // Barra horizontal del renglón (doble línea) de la primera a la última columna usada.
      if (centros.length > 1) {
        commands.push({ type: "line", x1: centros[0], y1: yBus, x2: centros[centros.length - 1], y2: yBus });
        commands.push({ type: "line", x1: centros[0], y1: yBus + 1.2, x2: centros[centros.length - 1], y2: yBus + 1.2 });
      }

      renglon.circuitos.forEach((c, i) => {
        const cx = centros[i];
        commands.push({ type: "line", x1: cx, y1: yBus, x2: cx, y2: ySymbol - SIMBOLO_R });
        dibujarSimbolo(commands, c.categoriaEquipo, cx, ySymbol);
        const yEtiqueta = ySymbol + SIMBOLO_R + DROP_A_ETIQUETA;
        commands.push({ type: "line", x1: cx, y1: ySymbol + SIMBOLO_R, x2: cx, y2: yEtiqueta });

        const colLeft = cx - COLUMNA_ANCHO / 2 + 3;
        const amperaje = parseAmperaje(c.ampNominal);
        const { calibreMm2, colores } = calcularCalibreCircuito(c.categoriaEquipo, c.tipoCircuito, c.ampNominal, configCalibre);
        const sufijo = c.rolBypassUps ? ROL_BYPASS_SUFIJO[c.rolBypassUps] : c.alimentadoPorUps ? " (UPS)" : "";
        const linea1 = `${CATEGORIA_EQUIPO_LABEL[c.categoriaEquipo]}${sufijo}`;
        const linea2Partes = [c.tipoCircuito !== "na" ? TIPO_CIRCUITO_LABEL[c.tipoCircuito] : null, amperaje ? `${amperaje}A` : null].filter(
          (p): p is string => !!p,
        );
        const linea3Partes = [calibreMm2 ? `${calibreMm2}mm²` : null, colores].filter((p): p is string => !!p);
        const specs = [linea1, linea2Partes.join(" "), linea3Partes.join(" ")].filter((s) => s.length > 0);
        specs.slice(0, LINEAS_SPEC).forEach((s, li) => {
          commands.push({ type: "text", x: colLeft, y: yEtiqueta + ALTO_LINEA * (li + 1), text: truncarColumna(s), size: 6, bold: li === 0 });
        });

        const yId = yEtiqueta + LINEAS_SPEC * ALTO_LINEA + 4;
        commands.push({ type: "rect", x: colLeft - 1, y: yId, width: COLUMNA_ANCHO - 8, height: ALTO_ID_BOX });
        commands.push({
          type: "text",
          x: colLeft + 2,
          y: yId + 9,
          text: truncarColumna(`${c.numero} — ${c.texto}`),
          size: 6.5,
          bold: true,
        });
      });

      yRenglon += ALTO_FILA_COLUMNAS;
    }

    y = yInicioBloque + alturaBloque + GAP_CUERPO;
  }

  return { commands, width: ANCHO, height: y };
}

/**
 * Arma un esquema unifilar simplificado (no es un plano a escala — ver
 * README): una barra vertical por cuerpo con cada elemento ramificando en
 * fila (símbolo según categoría — llave, borne o caja de equipo — agrupado
 * en secciones energía AC/DC → control de acceso → CCTV, ver
 * `ordenarCircuitosParaUnifilar`), calibre de cable determinado por
 * catalogo_calibre_cable según el amperaje ya cargado — nunca estimado/
 * inventado. Devuelve "draw commands" abstractos (líneas/rectángulos/texto)
 * que después se renderizan tanto en el PDF (Svg de react-pdf) como en el
 * DXF — una sola fuente de verdad para los dos formatos.
 */
export function construirUnifilar(
  circuitosPorCuerpo: Iterable<[string, UnifilarCircuito[]]>,
  configCalibre: ConfigCalibreCable[],
): UnifilarDrawing {
  const grupos: [string, RenglonUnifilar[]][] = [];
  for (const [cuerpo, circuitos] of circuitosPorCuerpo) {
    grupos.push([cuerpo, prepararRenglones(circuitos)]);
  }
  return renderGrupos(grupos, configCalibre);
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
 */
export function construirUnifilarPaginado(
  circuitosPorCuerpo: Map<string, UnifilarCircuito[]>,
  configCalibre: ConfigCalibreCable[],
): UnifilarDrawing[] {
  const maxAlturaRenglones = ALTO_MAX_BLOQUE_SEGURO - MARGEN - GAP_CUERPO - ALTO_HEADER_CUERPO;

  const grupos: [string, RenglonUnifilar[]][] = [];
  for (const [cuerpo, circuitosOriginal] of circuitosPorCuerpo) {
    // Se arman los renglones (orden + encabezados de sección + columnas) ACÁ,
    // antes de partir en páginas, no solo dentro de `renderGrupos` — si se
    // armaran después de partir, cada parte quedaría prolija por separado
    // pero el corte entre partes caería en cualquier lado, mezclando los
    // grupos de categoría entre una parte y la siguiente.
    const renglones = prepararRenglones(circuitosOriginal);
    const alturaTotal = renglones.reduce((acc, r) => acc + altoRenglon(r), 0);
    if (alturaTotal <= maxAlturaRenglones) {
      grupos.push([cuerpo, renglones]);
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
    partes.forEach((p, i) => grupos.push([`${cuerpo || "Sin cuerpo asignado"} (parte ${i + 1}/${partes.length})`, p]));
  }

  const bloques: UnifilarDrawing[] = [];
  let actual: [string, RenglonUnifilar[]][] = [];
  let alturaActual = MARGEN;
  for (const grupo of grupos) {
    const alturaGrupo = ALTO_HEADER_CUERPO + grupo[1].reduce((acc, r) => acc + altoRenglon(r), 0) + GAP_CUERPO;
    if (actual.length > 0 && alturaActual + alturaGrupo > ALTO_MAX_BLOQUE_SEGURO) {
      bloques.push(renderGrupos(actual, configCalibre));
      actual = [];
      alturaActual = MARGEN;
    }
    actual.push(grupo);
    alturaActual += alturaGrupo;
  }
  if (actual.length > 0) bloques.push(renderGrupos(actual, configCalibre));
  return bloques;
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
