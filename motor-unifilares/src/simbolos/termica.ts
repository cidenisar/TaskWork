import type { DrawCommand } from "../types.js";

/**
 * Símbolo TERMICA (A5 de REGLAS_UNIFILAR.md: "Contacto IEC vertical, cuchilla
 * inclinada") — geometría extraída 1:1 del primer plano real que terminó
 * generando bien la IA (tablero de 53 circuitos, validado visualmente por el
 * usuario el 25/10/2026), no inventada de nuevo: rectángulo de 8x18mm con una
 * diagonal adentro. `cx` es el centro horizontal del símbolo, `yTop` su borde
 * superior — mismo sistema de coordenadas que el resto (Y crece hacia abajo).
 */
export function dibujarTermica(cx: number, yTop: number): DrawCommand[] {
  return [
    { type: "rect", x: cx - 4, y: yTop, width: 8, height: 18, layer: "SIMBOLOS" },
    { type: "line", x1: cx - 2, y1: yTop + 2, x2: cx + 2, y2: yTop + 16, layer: "SIMBOLOS" },
  ];
}
