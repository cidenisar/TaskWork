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
 * cerradura, cámara, inyector PoE) y el voltaje del circuito en el resto
 * (térmica, disyuntor, bornera, fuente, UPS, batería, conversor DC,
 * descargador, otro).
 */
type GrupoUnifilar = "energia_ac" | "energia_dc" | "control_acceso" | "cctv";

const ORDEN_GRUPOS: GrupoUnifilar[] = ["energia_ac", "energia_dc", "control_acceso", "cctv"];

function grupoDeCircuito(c: UnifilarCircuito): GrupoUnifilar {
  if (c.categoriaEquipo === "lectora" || c.categoriaEquipo === "cerradura") return "control_acceso";
  if (c.categoriaEquipo === "camara" || c.categoriaEquipo === "inyector_poe") return "cctv";
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

export type DrawCommand =
  | { type: "line"; x1: number; y1: number; x2: number; y2: number }
  | { type: "rect"; x: number; y: number; width: number; height: number }
  | { type: "text"; x: number; y: number; text: string; size: number; bold?: boolean };

export interface UnifilarDrawing {
  commands: DrawCommand[];
  width: number;
  height: number;
}

const ANCHO = 500;
const MARGEN = 10;
const ALTO_HEADER_CUERPO = 18;
const ALTO_FILA = 16;
const GAP_CUERPO = 10;
const BUS_X = MARGEN + 14;
const BREAKER_X = BUS_X + 30;
const BREAKER_SIZE = 9;
const TEXTO_X = BREAKER_X + BREAKER_SIZE + 10;
const MAX_CHARS_TEXTO = 72;

function truncar(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Arma un esquema unifilar simplificado (no es un plano a escala — ver
 * README): una barra vertical por cuerpo con cada térmica/disyuntor
 * ramificando en fila, calibre de cable determinado por catalogo_calibre_
 * cable según el amperaje ya cargado — nunca estimado/inventado. Devuelve
 * "draw commands" abstractos (líneas/rectángulos/texto) que después se
 * renderizan tanto en el PDF (Svg de react-pdf) como en el DXF — una sola
 * fuente de verdad para los dos formatos.
 */
export function construirUnifilar(
  circuitosPorCuerpo: Iterable<[string, UnifilarCircuito[]]>,
  configCalibre: ConfigCalibreCable[],
): UnifilarDrawing {
  const commands: DrawCommand[] = [];
  let y = MARGEN;

  for (const [cuerpo, circuitosOriginal] of circuitosPorCuerpo) {
    const circuitos = ordenarCircuitosParaUnifilar(circuitosOriginal);
    const alturaBloque = ALTO_HEADER_CUERPO + circuitos.length * ALTO_FILA;
    const yInicioBloque = y;

    commands.push({
      type: "rect",
      x: MARGEN,
      y: yInicioBloque,
      width: ANCHO - MARGEN * 2,
      height: alturaBloque,
    });
    commands.push({
      type: "text",
      x: MARGEN + 6,
      y: yInicioBloque + 12,
      text: cuerpo || "Sin cuerpo asignado",
      size: 9,
      bold: true,
    });

    const yBusInicio = yInicioBloque + ALTO_HEADER_CUERPO;
    const yBusFin = yBusInicio + circuitos.length * ALTO_FILA;
    commands.push({ type: "line", x1: BUS_X, y1: yBusInicio, x2: BUS_X, y2: yBusFin });

    circuitos.forEach((c, i) => {
      const yFila = yBusInicio + i * ALTO_FILA + ALTO_FILA / 2;
      commands.push({ type: "line", x1: BUS_X, y1: yFila, x2: BREAKER_X, y2: yFila });
      commands.push({
        type: "rect",
        x: BREAKER_X,
        y: yFila - BREAKER_SIZE / 2,
        width: BREAKER_SIZE,
        height: BREAKER_SIZE,
      });
      commands.push({ type: "line", x1: BREAKER_X + BREAKER_SIZE, y1: yFila, x2: TEXTO_X - 4, y2: yFila });

      const amperaje = parseAmperaje(c.ampNominal);
      const { calibreMm2, colores } = calcularCalibreCircuito(c.categoriaEquipo, c.tipoCircuito, c.ampNominal, configCalibre);
      const partes = [`${c.numero} — ${c.texto}`, CATEGORIA_EQUIPO_LABEL[c.categoriaEquipo]];
      if (c.tipoCircuito !== "na") partes.push(TIPO_CIRCUITO_LABEL[c.tipoCircuito]);
      if (amperaje) partes.push(`${amperaje}A`);
      if (calibreMm2) partes.push(`${calibreMm2}mm²`);
      if (colores) partes.push(colores);
      commands.push({
        type: "text",
        x: TEXTO_X,
        y: yFila + 3,
        text: truncar(partes.join(" · "), MAX_CHARS_TEXTO),
        size: 7,
      });
    });

    y = yInicioBloque + alturaBloque + GAP_CUERPO;
  }

  return { commands, width: ANCHO, height: y };
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
  const maxItemsPorGrupo = Math.max(1, Math.floor((ALTO_MAX_BLOQUE_SEGURO - MARGEN - GAP_CUERPO - ALTO_HEADER_CUERPO) / ALTO_FILA));

  const grupos: [string, UnifilarCircuito[]][] = [];
  for (const [cuerpo, circuitosOriginal] of circuitosPorCuerpo) {
    // Se ordena ACÁ (antes de partir en páginas), no solo dentro de
    // `construirUnifilar` — si se ordenara después de partir, cada parte
    // quedaría prolija por separado pero el corte entre partes caería en
    // cualquier lado, mezclando los grupos de categoría entre una parte y
    // la siguiente.
    const circuitos = ordenarCircuitosParaUnifilar(circuitosOriginal);
    if (circuitos.length <= maxItemsPorGrupo) {
      grupos.push([cuerpo, circuitos]);
      continue;
    }
    const partes = Math.ceil(circuitos.length / maxItemsPorGrupo);
    for (let p = 0; p < partes; p++) {
      const slice = circuitos.slice(p * maxItemsPorGrupo, (p + 1) * maxItemsPorGrupo);
      grupos.push([`${cuerpo || "Sin cuerpo asignado"} (parte ${p + 1}/${partes})`, slice]);
    }
  }

  const bloques: UnifilarDrawing[] = [];
  let actual: [string, UnifilarCircuito[]][] = [];
  let alturaActual = MARGEN;
  for (const grupo of grupos) {
    const alturaGrupo = ALTO_HEADER_CUERPO + grupo[1].length * ALTO_FILA + GAP_CUERPO;
    if (actual.length > 0 && alturaActual + alturaGrupo > ALTO_MAX_BLOQUE_SEGURO) {
      bloques.push(construirUnifilar(actual, configCalibre));
      actual = [];
      alturaActual = MARGEN;
    }
    actual.push(grupo);
    alturaActual += alturaGrupo;
  }
  if (actual.length > 0) bloques.push(construirUnifilar(actual, configCalibre));
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
