import type { DrawCommand } from "./types.js";

/**
 * Escritor DXF ASCII mínimo (`$ACADVER AC1021`, DXF R2007) — portado tal
 * cual de informes-app/src/lib/dxf/writer.ts (ya validado ahí contra un
 * lector real, ezdxf). No se toca sin re-portar el cambio equivalente del
 * lado de informes-app también, si algún día hiciera falta.
 *
 * A propósito no se suma una librería de terceros para esto: el formato es
 * texto plano y solo necesitamos un puñado de tipos de entidad (LINE,
 * LWPOLYLINE, CIRCLE, ELLIPSE, TEXT). Nunca es un plano a escala real — son
 * las mismas coordenadas abstractas del `DrawCommand[]`, con el eje Y
 * invertido porque DXF/CAD usan origen abajo-a-la-izquierda y nuestro
 * modelo usa origen arriba-a-la-izquierda.
 *
 * Por qué AC1021 y no AC1015: LWPOLYLINE alcanza desde AC1015/R2000, pero el
 * texto UTF-8 de archivo completo recién es seguro desde AC1021/R2007 — la
 * spec de DXF cambia de "un byte por carácter según $DWGCODEPAGE" a "todo
 * el archivo en UTF-8" justo en ese salto de versión.
 */
function dxfLine(x1: number, y1: number, x2: number, y2: number, layer: string): string {
  return ["0", "LINE", "8", layer, "10", x1.toFixed(3), "20", y1.toFixed(3), "30", "0.0", "11", x2.toFixed(3), "21", y2.toFixed(3), "31", "0.0"].join(
    "\n",
  );
}

function dxfLwpolyline(puntos: [number, number][], layer: string, cerrado = true): string {
  const lines: string[] = ["0", "LWPOLYLINE", "8", layer, "100", "AcDbEntity", "100", "AcDbPolyline", "90", String(puntos.length), "70", cerrado ? "1" : "0"];
  for (const [px, py] of puntos) lines.push("10", px.toFixed(3), "20", py.toFixed(3));
  return lines.join("\n");
}

function dxfRect(x: number, y: number, width: number, height: number, layer: string): string {
  return dxfLwpolyline(
    [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
    ],
    layer,
  );
}

/**
 * Rectángulo RELLENO. SOLID interpreta sus 4 puntos como dos triángulos —
 * el orden correcto es con el 3er y 4to punto INTERCAMBIADOS respecto al
 * recorrido del perímetro (p1 arriba-izq., p2 arriba-der., p3 ABAJO-izq.,
 * p4 ABAJO-der.), si no el relleno sale con forma de moño.
 */
function dxfSolid(x: number, y: number, width: number, height: number, layer: string): string {
  const p1: [number, number] = [x, y];
  const p2: [number, number] = [x + width, y];
  const p3: [number, number] = [x, y + height];
  const p4: [number, number] = [x + width, y + height];
  return [
    "0",
    "SOLID",
    "8",
    layer,
    "10",
    p1[0].toFixed(3),
    "20",
    p1[1].toFixed(3),
    "30",
    "0.0",
    "11",
    p2[0].toFixed(3),
    "21",
    p2[1].toFixed(3),
    "31",
    "0.0",
    "12",
    p3[0].toFixed(3),
    "22",
    p3[1].toFixed(3),
    "32",
    "0.0",
    "13",
    p4[0].toFixed(3),
    "23",
    p4[1].toFixed(3),
    "33",
    "0.0",
  ].join("\n");
}

function dxfCircle(x: number, y: number, r: number, layer: string): string {
  return ["0", "CIRCLE", "8", layer, "10", x.toFixed(3), "20", y.toFixed(3), "30", "0.0", "40", r.toFixed(3)].join("\n");
}

/**
 * ELLIPSE (toroide del disyuntor) — grupos: 10/20 centro, 11/21 extremo del
 * eje MAYOR (relativo al centro), 40 ratio eje menor/mayor, 41/42 ángulo
 * inicial/final en radianes (0 a 2π = elipse completa). Siempre ejes
 * alineados a X/Y (sin rotación).
 */
function dxfEllipse(x: number, y: number, rx: number, ry: number, layer: string): string {
  const mayor = Math.max(rx, ry);
  const menor = Math.min(rx, ry);
  const ratio = mayor > 0 ? menor / mayor : 1;
  const [ejeX, ejeY] = rx >= ry ? [rx, 0] : [0, ry];
  return [
    "0",
    "ELLIPSE",
    "8",
    layer,
    "10",
    x.toFixed(3),
    "20",
    y.toFixed(3),
    "30",
    "0.0",
    "11",
    ejeX.toFixed(3),
    "21",
    ejeY.toFixed(3),
    "31",
    "0.0",
    "40",
    ratio.toFixed(4),
    "41",
    "0.0",
    "42",
    (2 * Math.PI).toFixed(6),
  ].join("\n");
}

function dxfText(x: number, y: number, text: string, size: number, layer: string): string {
  const limpio = text.replace(/[\r\n]+/g, " ");
  return ["0", "TEXT", "8", layer, "10", x.toFixed(3), "20", y.toFixed(3), "30", "0.0", "40", size.toFixed(2), "1", limpio].join("\n");
}

const COLOR_ACI_POR_CAPA: Record<string, number> = {
  MARCO: 7,
  POTENCIA: 7,
  SIMBOLOS: 7,
  BORNES: 7,
  NUM_CONDUCTOR: 7,
  CABLES: 7,
  ETIQUETAS: 8,
  DESTINOS: 7,
  A_CONFIRMAR: 30,
};

function tablaDeCapas(): string[] {
  const capas = Object.keys(COLOR_ACI_POR_CAPA);
  const lines: string[] = ["0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", String(capas.length)];
  for (const capa of capas) {
    lines.push("0", "LAYER", "2", capa, "70", "0", "62", String(COLOR_ACI_POR_CAPA[capa]), "6", "CONTINUOUS");
  }
  lines.push("0", "ENDTAB", "0", "ENDSEC");
  return lines;
}

export function drawCommandsToDxf(commands: DrawCommand[], height: number): Buffer {
  const flipY = (y: number) => height - y;
  const entidades: string[] = [];

  for (const cmd of commands) {
    if (cmd.type === "line") {
      entidades.push(dxfLine(cmd.x1, flipY(cmd.y1), cmd.x2, flipY(cmd.y2), cmd.layer));
    } else if (cmd.type === "rect") {
      const yTop = flipY(cmd.y + cmd.height);
      if (cmd.fill) {
        entidades.push(dxfSolid(cmd.x, yTop, cmd.width, cmd.height, cmd.layer));
      } else {
        entidades.push(dxfRect(cmd.x, yTop, cmd.width, cmd.height, cmd.layer));
      }
    } else if (cmd.type === "circle") {
      entidades.push(dxfCircle(cmd.x, flipY(cmd.y), cmd.r, cmd.layer));
    } else if (cmd.type === "ellipse") {
      entidades.push(dxfEllipse(cmd.x, flipY(cmd.y), cmd.rx, cmd.ry, cmd.layer));
    } else {
      entidades.push(dxfText(cmd.x, flipY(cmd.y), cmd.text, cmd.size, cmd.layer));
    }
  }

  const contenido = [
    "0",
    "SECTION",
    "2",
    "HEADER",
    "9",
    "$ACADVER",
    "1",
    "AC1021",
    "9",
    "$DWGCODEPAGE",
    "3",
    "ANSI_1252",
    "0",
    "ENDSEC",
    ...tablaDeCapas(),
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    ...entidades,
    "0",
    "ENDSEC",
    "0",
    "EOF",
  ].join("\n");

  return Buffer.from(contenido, "utf-8");
}
