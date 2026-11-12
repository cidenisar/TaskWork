import type { DrawCommand } from "./types.js";

/** Bounding box de un fragmento de comandos, con margen — para previsualizar un ejemplo sin depender de un width/height ya fijado (los fragmentos "enseñados" no traen hoja, solo el dibujo puntual). */
export function calcularDimensiones(commands: DrawCommand[], margen = 20): { width: number; height: number } {
  let maxX = 40;
  let maxY = 40;
  for (const c of commands) {
    if (c.type === "line") {
      maxX = Math.max(maxX, c.x1, c.x2);
      maxY = Math.max(maxY, c.y1, c.y2);
    } else if (c.type === "rect") {
      maxX = Math.max(maxX, c.x + c.width);
      maxY = Math.max(maxY, c.y + c.height);
    } else if (c.type === "circle") {
      maxX = Math.max(maxX, c.x + c.r);
      maxY = Math.max(maxY, c.y + c.r);
    } else if (c.type === "ellipse") {
      maxX = Math.max(maxX, c.x + c.rx);
      maxY = Math.max(maxY, c.y + c.ry);
    } else if (c.type === "text") {
      maxX = Math.max(maxX, c.x + c.text.length * c.size * 0.6);
      maxY = Math.max(maxY, c.y);
    } else {
      // "simbolo": bounding box aproximado (ver src/simbolos/*.ts, 8x18mm) — alcanza para la previsualización de un ejemplo enseñado, no hace falta expandirlo acá.
      maxX = Math.max(maxX, c.x + 4);
      maxY = Math.max(maxY, c.y + 18);
    }
  }
  return { width: maxX + margen, height: maxY + margen };
}
