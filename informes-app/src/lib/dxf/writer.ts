import type { DrawCommand } from "@/lib/tableros/unifilar";

/**
 * Escritor DXF ASCII mínimo (R12, `$ACADVER AC1009`) — a propósito no se
 * suma una librería de terceros para esto: el formato es texto plano y solo
 * necesitamos tres tipos de entidad (LINE, LWPOLYLINE para los rectángulos,
 * TEXT), que cualquier versión de AutoCAD lee sin problema. Nunca es un
 * plano a escala real (ver README) — son las mismas coordenadas abstractas
 * que ya arma `construirUnifilar`, con el eje Y invertido porque DXF/CAD
 * usan origen abajo-a-la-izquierda y nuestro modelo (como el PDF) usa
 * origen arriba-a-la-izquierda.
 */
function dxfLine(x1: number, y1: number, x2: number, y2: number): string {
  return ["0", "LINE", "8", "0", "10", x1.toFixed(3), "20", y1.toFixed(3), "30", "0.0", "11", x2.toFixed(3), "21", y2.toFixed(3), "31", "0.0"].join(
    "\n",
  );
}

function dxfRect(x: number, y: number, width: number, height: number): string {
  const puntos: [number, number][] = [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
  const lines: string[] = ["0", "LWPOLYLINE", "8", "0", "90", "4", "70", "1"];
  for (const [px, py] of puntos) lines.push("10", px.toFixed(3), "20", py.toFixed(3));
  return lines.join("\n");
}

function dxfText(x: number, y: number, text: string, size: number): string {
  // DXF no tolera saltos de línea ni ciertos caracteres de control dentro de un TEXT — se sanitiza por las dudas.
  const limpio = text.replace(/[\r\n]+/g, " ");
  return ["0", "TEXT", "8", "0", "10", x.toFixed(3), "20", y.toFixed(3), "30", "0.0", "40", size.toFixed(2), "1", limpio].join("\n");
}

export function drawCommandsToDxf(commands: DrawCommand[], height: number): Buffer {
  const flipY = (y: number) => height - y;
  const entidades: string[] = [];

  for (const cmd of commands) {
    if (cmd.type === "line") {
      entidades.push(dxfLine(cmd.x1, flipY(cmd.y1), cmd.x2, flipY(cmd.y2)));
    } else if (cmd.type === "rect") {
      entidades.push(dxfRect(cmd.x, flipY(cmd.y + cmd.height), cmd.width, cmd.height));
    } else {
      // TEXT en DXF se ancla abajo-a-la-izquierda del texto; nuestro modelo usa el mismo criterio que react-pdf (y = línea de base), así que alcanza con invertir Y.
      entidades.push(dxfText(cmd.x, flipY(cmd.y), cmd.text, cmd.size));
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
    "0",
    "ENDSEC",
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
