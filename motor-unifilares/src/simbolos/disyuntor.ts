import type { DrawCommand } from "../types.js";

/**
 * Símbolo DISYUNTOR (A5: "Térmica + óvalo de toroide") — mismo criterio que
 * termica.ts: geometría extraída del plano real ya validado, no inventada.
 * Mismo rectángulo de 8x18mm que la térmica, con un óvalo (toroide) de
 * 14x8mm centrado — más ancho que el rectángulo a propósito (así se ve en
 * el plano de referencia: el toroide es más ancho que el cuerpo del
 * disyuntor). `cx`/`yTop` con el mismo significado que en termica.ts.
 */
export function dibujarDisyuntor(cx: number, yTop: number): DrawCommand[] {
  return [
    { type: "rect", x: cx - 4, y: yTop, width: 8, height: 18, layer: "SIMBOLOS" },
    { type: "ellipse", x: cx, y: yTop + 9, rx: 7, ry: 4, layer: "SIMBOLOS" },
  ];
}
