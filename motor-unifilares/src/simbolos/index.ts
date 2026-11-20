import type { DrawCommand, Simbolo } from "../types.js";

/**
 * Desplaza TODAS las coordenadas de un fragmento de comandos por (dx,dy) —
 * a diferencia de `trasladarComandos` de anthropic-client.ts (que solo
 * mueve Y, porque los lotes de circuitos ya vienen alineados en X), esto
 * mueve X e Y: lo usa `dxf-import.ts` para normalizar un bloque recién
 * leído (centro horizontal + borde superior en (0,0)), y `expandirSimbolos`
 * para ubicar cada instancia donde la IA la pidió.
 */
export function trasladarXY(commands: DrawCommand[], dx: number, dy: number): DrawCommand[] {
  if (dx === 0 && dy === 0) return commands;
  return commands.map((c) => {
    switch (c.type) {
      case "line":
        return { ...c, x1: c.x1 + dx, y1: c.y1 + dy, x2: c.x2 + dx, y2: c.y2 + dy };
      case "rect":
      case "circle":
      case "ellipse":
      case "text":
      case "simbolo":
        return { ...c, x: c.x + dx, y: c.y + dy };
    }
  });
}

export class SimboloDesconocido extends Error {}

/**
 * Reemplaza cada comando `{"type":"simbolo","nombre":...}` por la
 * geometría real de la librería (ver `listarSimbolos` en
 * src/simbolos-store.ts) — se llama una sola vez, al final de
 * `generarUnifilar`, antes de que el dibujo llegue a los renderers
 * (DXF/PDF): esos dos nunca necesitan saber que "simbolo" existe, solo ven
 * líneas/rects/ellipses/texto de siempre. `biblioteca` son los símbolos
 * VIGENTES en el momento de generar (tabla motor_unifilares_simbolos) —
 * si la IA pidió un nombre que ya no existe (o nunca existió), es un error
 * real y se avisa fuerte en vez de dibujar cualquier cosa o nada.
 */
export function expandirSimbolos(commands: DrawCommand[], biblioteca: Map<string, Simbolo>): DrawCommand[] {
  return commands.flatMap((c) => {
    if (c.type !== "simbolo") return [c];
    const simbolo = biblioteca.get(c.nombre);
    if (!simbolo) {
      throw new SimboloDesconocido(`La IA pidió el símbolo "${c.nombre}", que no existe en la librería (ver public/simbolos.html).`);
    }
    return trasladarXY(simbolo.commands, c.x, c.y);
  });
}
