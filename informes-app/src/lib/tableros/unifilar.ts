import { CATEGORIA_EQUIPO_LABEL, TIPO_CIRCUITO_LABEL } from "@/components/tableros/types";
import { calcularCalibreCircuito, parseAmperaje, type ConfigCalibreCable } from "./calibre-cable";
import type { TableroCategoriaEquipo, TableroTipoCircuito } from "@/lib/database.types";

export interface UnifilarCircuito {
  numero: number;
  texto: string;
  categoriaEquipo: TableroCategoriaEquipo;
  tipoCircuito: TableroTipoCircuito;
  ampNominal: string | null;
  cuerpo: string | null;
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
const MAX_CHARS_TEXTO = 58;

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
  circuitosPorCuerpo: Map<string, UnifilarCircuito[]>,
  configCalibre: ConfigCalibreCable[],
): UnifilarDrawing {
  const commands: DrawCommand[] = [];
  let y = MARGEN;

  for (const [cuerpo, circuitos] of circuitosPorCuerpo) {
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
      const calibre = calcularCalibreCircuito(c.categoriaEquipo, c.tipoCircuito, c.ampNominal, configCalibre);
      const partes = [`${c.numero} — ${c.texto}`, CATEGORIA_EQUIPO_LABEL[c.categoriaEquipo]];
      if (c.tipoCircuito !== "na") partes.push(TIPO_CIRCUITO_LABEL[c.tipoCircuito]);
      if (amperaje) partes.push(`${amperaje}A`);
      if (calibre) partes.push(`${calibre}mm²`);
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
