/**
 * Renderer de PDF — mismo DrawCommand[] que ya consume dxf-writer.ts,
 * portado tal cual del mapeo a Svg de react-pdf que ya usa informes-app
 * (lib/pdf/tablero.tsx): líneas/rects/círculos/elipses van en un <Svg>,
 * el texto aparte en <Text> posicionado absoluto (react-pdf no soporta
 * texto dentro de <Svg> con el control de fuente que necesitamos).
 *
 * Sin JSX a propósito (createElement a mano): el bundler de funciones de
 * Vercel (Node File Trace) no resolvía bien un archivo .tsx importado con
 * especificador .js (el truco de NodeNext) — sí resolvía los .ts
 * normales del resto de src/. En vez de pelear con la config del
 * bundler, se saca el único .tsx del proyecto.
 */
import { createElement } from "react";
import { Document, Page, View, Svg, Line, Rect, Circle, Ellipse, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { COLOR_POR_CAPA } from "./colores-capa.js";
import type { DrawCommand } from "./types.js";

const styles = StyleSheet.create({
  page: { padding: "20 20 20", fontFamily: "Helvetica", color: "#1a1a1a" },
  pageSinMargen: { padding: 0, fontFamily: "Helvetica", color: "#1a1a1a" },
});

function dibujoSvgTexto(commands: DrawCommand[], width: number, height: number) {
  const trazos = commands.map((cmd, i) => {
    const color = COLOR_POR_CAPA[cmd.layer] ?? "#1a1a1a";
    if (cmd.type === "line") {
      return createElement(Line, { key: i, x1: cmd.x1, y1: cmd.y1, x2: cmd.x2, y2: cmd.y2, stroke: color, strokeWidth: 0.75 });
    }
    if (cmd.type === "rect") {
      return createElement(Rect, {
        key: i,
        x: cmd.x,
        y: cmd.y,
        width: cmd.width,
        height: cmd.height,
        stroke: color,
        strokeWidth: 0.75,
        fill: cmd.fill ? color : "none",
      });
    }
    if (cmd.type === "circle") {
      return createElement(Circle, { key: i, cx: cmd.x, cy: cmd.y, r: cmd.r, stroke: color, strokeWidth: 0.75, fill: "none" });
    }
    if (cmd.type === "ellipse") {
      return createElement(Ellipse, { key: i, cx: cmd.x, cy: cmd.y, rx: cmd.rx, ry: cmd.ry, stroke: color, strokeWidth: 0.6, fill: "none" });
    }
    return null;
  });

  const textos = commands.map((cmd, i) =>
    cmd.type === "text"
      ? createElement(
          Text,
          {
            key: `t${i}`,
            style: {
              position: "absolute",
              left: cmd.x,
              top: cmd.y - cmd.size,
              fontSize: cmd.size,
              fontFamily: cmd.bold ? "Helvetica-Bold" : "Helvetica",
              color: COLOR_POR_CAPA[cmd.layer] ?? "#1a1a1a",
            },
          },
          cmd.text,
        )
      : null,
  );

  return createElement(
    View,
    { style: { position: "relative", width, height } },
    createElement(Svg, { width, height }, ...trazos),
    ...textos,
  );
}

/** Hoja completa A3 apaisada — lo que devuelve POST /api/unifilar. */
export function drawCommandsToPdf(commands: DrawCommand[], width: number, height: number): Promise<Buffer> {
  return renderToBuffer(
    createElement(
      Document,
      null,
      createElement(Page, { size: "A3", orientation: "landscape", style: styles.page }, dibujoSvgTexto(commands, width, height)),
    ),
  );
}

/** Previsualización de un fragmento puntual (un ejemplo "enseñado", ver ensenar.ts) — página recortada al tamaño real del dibujo, no una A3 con espacio de más alrededor. */
export function drawCommandsToPdfFragment(commands: DrawCommand[], width: number, height: number): Promise<Buffer> {
  return renderToBuffer(
    createElement(
      Document,
      null,
      createElement(Page, { size: [width, height], style: styles.pageSinMargen }, dibujoSvgTexto(commands, width, height)),
    ),
  );
}
