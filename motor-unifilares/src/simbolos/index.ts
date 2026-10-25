import type { DrawCommand, NombreSimbolo } from "../types.js";
import { dibujarTermica } from "./termica.js";
import { dibujarDisyuntor } from "./disyuntor.js";

/**
 * Librería de símbolos (ver CRITERIOS_Y_IDEAS.md sobre la idea de ir
 * "enseñándole" una librería al motor en vez de que redibuje cada pieza de
 * cero) — cada entrada es una función pura que arma la geometría real
 * (líneas/rects/ellipses) a partir de un punto de anclaje. La IA no dibuja
 * esta geometría: solo pide `{"type":"simbolo","nombre":"termica",...}` (ver
 * ESQUEMA_DRAW_COMMAND en anthropic-client.ts) — más corto de generar, y
 * sale siempre igual de prolijo, consistente entre circuitos.
 */
const SIMBOLOS: Record<NombreSimbolo, (cx: number, yTop: number) => DrawCommand[]> = {
  termica: dibujarTermica,
  disyuntor: dibujarDisyuntor,
};

/**
 * Reemplaza cada comando `{"type":"simbolo",...}` por la geometría real —
 * se llama una sola vez, al final de `generarUnifilar`, antes de que el
 * dibujo llegue a los renderers (DXF/PDF): esos dos nunca necesitan saber
 * que "simbolo" existe, solo ven líneas/rects/ellipses/texto de siempre.
 */
export function expandirSimbolos(commands: DrawCommand[]): DrawCommand[] {
  return commands.flatMap((c) => (c.type === "simbolo" ? SIMBOLOS[c.nombre](c.x, c.y) : [c]));
}
