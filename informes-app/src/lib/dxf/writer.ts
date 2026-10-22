import type { DrawCommand } from "@/lib/tableros/unifilar";

/**
 * Escritor DXF ASCII mínimo (R12, `$ACADVER AC1009`) — a propósito no se
 * suma una librería de terceros para esto: el formato es texto plano y solo
 * necesitamos tres tipos de entidad (LINE, POLYLINE clásica para los
 * rectángulos, TEXT), que cualquier versión de AutoCAD lee sin problema.
 * Validado contra un lector de DXF real (ezdxf) además de a mano. Nunca es un
 * plano a escala real (ver README) — son las mismas coordenadas abstractas
 * que ya arma `construirUnifilar`, con el eje Y invertido porque DXF/CAD
 * usan origen abajo-a-la-izquierda y nuestro modelo (como el PDF) usa
 * origen arriba-a-la-izquierda.
 */
function dxfLine(x1: number, y1: number, x2: number, y2: number, layer: string): string {
  return [
    "0",
    "LINE",
    "8",
    layer,
    "10",
    x1.toFixed(3),
    "20",
    y1.toFixed(3),
    "30",
    "0.0",
    "11",
    x2.toFixed(3),
    "21",
    y2.toFixed(3),
    "31",
    "0.0",
  ].join("\n");
}

/**
 * LWPOLYLINE no existe en DXF R12/AC1009 (se agregó recién en R14) — un
 * archivo que declara $ACADVER AC1009 pero usa LWPOLYLINE es inválido, y
 * varios lectores de DXF (sobre todo visores livianos, no AutoCAD en sí)
 * lo rechazan entero en vez de ignorar solo esa entidad, mostrando el plano
 * vacío. Por eso los rectángulos van como POLYLINE clásica (grupo 66+70) +
 * VERTEX + SEQEND, que es el formato válido desde las versiones más viejas
 * de DXF.
 */
function dxfRect(x: number, y: number, width: number, height: number, layer: string): string {
  const puntos: [number, number][] = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
  const lines: string[] = ["0", "POLYLINE", "8", layer, "66", "1", "70", "1"];
  for (const [px, py] of puntos) lines.push("0", "VERTEX", "8", layer, "10", px.toFixed(3), "20", py.toFixed(3), "30", "0.0");
  lines.push("0", "SEQEND");
  return lines.join("\n");
}

/** CIRCLE es válida desde las versiones más viejas de DXF (a diferencia de LWPOLYLINE), sin truco ninguno. */
function dxfCircle(x: number, y: number, r: number, layer: string): string {
  return ["0", "CIRCLE", "8", layer, "10", x.toFixed(3), "20", y.toFixed(3), "30", "0.0", "40", r.toFixed(3)].join("\n");
}

function dxfText(x: number, y: number, text: string, size: number, layer: string): string {
  // DXF no tolera saltos de línea ni ciertos caracteres de control dentro de un TEXT — se sanitiza por las dudas.
  const limpio = text.replace(/[\r\n]+/g, " ");
  return ["0", "TEXT", "8", layer, "10", x.toFixed(3), "20", y.toFixed(3), "30", "0.0", "40", size.toFixed(2), "1", limpio].join("\n");
}

/**
 * Capas DXF con color AutoCAD (ACI) fijo por capa, para que al abrir el
 * plano en AutoCAD se pueda apagar/prender el marco, la barra, los
 * símbolos, el rótulo o el texto por separado — antes todo iba a la capa
 * "0" sin distinción. Colores elegidos por convención (7=blanco, 5=azul,
 * 2=amarillo, 3=verde), no por norma de ninguna obra en particular.
 */
const COLOR_ACI_POR_CAPA: Record<string, number> = {
  MARCO: 7,
  BARRA: 5,
  SIMBOLOS: 2,
  ROTULO: 3,
  TEXTO: 7,
  BORNES: 5,
  CABLES: 6,
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

/**
 * Un TEXT de DXF R12 no es UTF-8: son bytes crudos interpretados según el
 * codepage del header ($DWGCODEPAGE) — "\U+XXXX" es una notación de escape
 * que solo existe para MTEXT (una entidad que ni siquiera existe en R12),
 * NO para TEXT, así que no sirve acá (un lector real la deja tal cual,
 * literal, en vez de decodificarla — peor que el acento roto). La forma
 * correcta es escribir el archivo entero en ANSI_1252 (Windows-1252) y
 * declararlo en el header, que es lo que cualquier DXF R12 real trae.
 * Windows-1252 coincide con Unicode 1 a 1 en 0x00-0x7F y 0xA0-0xFF (ahí
 * entran tildes/ñ/° 'más — el único hueco real es 0x80-0x9F, un puñado de
 * símbolos (comillas tipográficas, rayas, elipsis) con su propio mapeo).
 */
const CP1252_ESPECIALES: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

function encodeCp1252(contenido: string): Buffer {
  const bytes = Array.from(contenido).map((ch) => {
    const code = ch.codePointAt(0)!;
    if (code <= 0xff && !(code >= 0x80 && code <= 0x9f)) return code;
    return CP1252_ESPECIALES[code] ?? 0x3f; // '?' para lo poquísimo que ni así se puede representar
  });
  return Buffer.from(bytes);
}

export function drawCommandsToDxf(commands: DrawCommand[], height: number): Buffer {
  const flipY = (y: number) => height - y;
  const entidades: string[] = [];

  for (const cmd of commands) {
    if (cmd.type === "line") {
      entidades.push(dxfLine(cmd.x1, flipY(cmd.y1), cmd.x2, flipY(cmd.y2), cmd.layer));
    } else if (cmd.type === "rect") {
      entidades.push(dxfRect(cmd.x, flipY(cmd.y + cmd.height), cmd.width, cmd.height, cmd.layer));
    } else if (cmd.type === "circle") {
      entidades.push(dxfCircle(cmd.x, flipY(cmd.y), cmd.r, cmd.layer));
    } else {
      // TEXT en DXF se ancla abajo-a-la-izquierda del texto; nuestro modelo usa el mismo criterio que react-pdf (y = línea de base), así que alcanza con invertir Y.
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
    "AC1009",
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

  return encodeCp1252(contenido);
}
