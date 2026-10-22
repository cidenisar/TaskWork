import type { DrawCommand } from "@/lib/tableros/unifilar";

/**
 * Escritor DXF ASCII mínimo (`$ACADVER AC1021`, DXF R2007) — a propósito no
 * se suma una librería de terceros para esto: el formato es texto plano y
 * solo necesitamos un puñado de tipos de entidad (LINE, LWPOLYLINE, CIRCLE,
 * TEXT), que cualquier versión moderna de AutoCAD lee sin problema. Validado
 * contra un lector de DXF real (ezdxf) además de a mano. Nunca es un plano a
 * escala real (ver README) — son las mismas coordenadas abstractas que ya
 * arma `construirUnifilar`, con el eje Y invertido porque DXF/CAD usan
 * origen abajo-a-la-izquierda y nuestro modelo (como el PDF) usa origen
 * arriba-a-la-izquierda.
 *
 * Por qué AC1021 y no AC1015: LWPOLYLINE alcanza desde AC1015/R2000, pero el
 * texto UTF-8 de archivo completo (ver más abajo) recién es seguro desde
 * AC1021/R2007 — la spec de DXF cambia de "un byte por carácter según
 * $DWGCODEPAGE" a "todo el archivo en UTF-8" justo en ese salto de versión.
 * Probado a mano con ezdxf: un archivo declarado AC1015 con bytes UTF-8
 * crudos decodifica mal ("Térmica" → "TÃ©rmica", por leerlo como CP1252);
 * el mismo contenido declarado AC1021 decodifica bien. No alcanza con que
 * la versión "sea nueva" — hay que confirmar el corte real con un lector.
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
 * LWPOLYLINE es una entidad "moderna" (post-R13): a diferencia de LINE/
 * CIRCLE/TEXT (que son válidas desde las versiones más viejas de DXF sin
 * marcado especial), necesita los marcadores de subclase `100 AcDbEntity` +
 * `100 AcDbPolyline` o un lector estricto la rechaza con un error de
 * estructura — confirmado a mano con ezdxf (sin los marcadores tira
 * `DXFStructureError: missing 'AcDbPolyline' subclass`). No hace falta un
 * handle propio (grupo `5`): un lector real le asigna uno si falta,
 * confirmado también a mano.
 */
function dxfLwpolyline(puntos: [number, number][], layer: string, cerrado = true): string {
  const lines: string[] = ["0", "LWPOLYLINE", "8", layer, "100", "AcDbEntity", "100", "AcDbPolyline", "90", String(puntos.length), "70", cerrado ? "1" : "0"];
  for (const [px, py] of puntos) lines.push("10", px.toFixed(3), "20", py.toFixed(3));
  return lines.join("\n");
}

/** Rectángulo sin relleno: un LWPOLYLINE cerrado de 4 vértices (reemplaza la vieja POLYLINE+VERTEX+SEQEND de R12, que ya no hace falta en AC1021). */
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
 * Rectángulo RELLENO (p. ej. la etiqueta gris de un equipo, A3 del
 * estándar). SOLID interpreta sus 4 puntos como dos triángulos — si se le
 * dan los 4 vértices "caminando" el perímetro (sentido horario/antihorario
 * normal), el relleno sale con forma de moño/reloj de arena en vez de
 * rectángulo; el orden correcto es con el 3er y 4to punto INTERCAMBIADOS
 * respecto al recorrido del perímetro (p1 arriba-izq., p2 arriba-der., p3
 * ABAJO-izq., p4 ABAJO-der.) — confirmado el formato de grupos (10/20/30,
 * 11/21/31, 12/22/32, 13/23/33) contra un lector real; el orden en sí es la
 * convención documentada de la entidad SOLID, no algo que un lector valide.
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

/** CIRCLE es válida desde las versiones más viejas de DXF, sin truco ninguno. */
function dxfCircle(x: number, y: number, r: number, layer: string): string {
  return ["0", "CIRCLE", "8", layer, "10", x.toFixed(3), "20", y.toFixed(3), "30", "0.0", "40", r.toFixed(3)].join("\n");
}

/**
 * ELLIPSE (A5: toroide del disyuntor) — válida desde DXF R13, sin truco
 * especial en AC1021. Grupos: 10/20 centro, 11/21 extremo del eje MAYOR
 * (relativo al centro, no absoluto), 40 ratio eje menor/mayor, 41/42 ángulo
 * inicial/final en radianes (0 a 2π = elipse completa). Nuestras elipses
 * siempre tienen los ejes alineados a X/Y (sin rotación) — invertir Y (como
 * cualquier otra entidad, ver `drawCommandsToDxf`) no rota una elipse así,
 * solo la refleja sobre sí misma, con el mismo rx/ry.
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
  // DXF no tolera saltos de línea ni ciertos caracteres de control dentro de un TEXT — se sanitiza por las dudas.
  const limpio = text.replace(/[\r\n]+/g, " ");
  return ["0", "TEXT", "8", layer, "10", x.toFixed(3), "20", y.toFixed(3), "30", "0.0", "40", size.toFixed(2), "1", limpio].join("\n");
}

/**
 * Capas DXF con color AutoCAD (ACI) fijo por capa, para que al abrir el
 * plano en AutoCAD se pueda apagar/prender cada grupo por separado.
 * Mapeo de 9 capas (reemplaza las 9 viejas de la Etapa anterior) tomado del
 * estándar de dibujo TerraLogic (ver docs/referencias-unifilar/
 * REGLAS_UNIFILAR.md, sección A9) — casi todo color 7 (blanco/negro según
 * fondo), con las excepciones que marca ese documento: ETIQUETAS en 8 (gris,
 * las etiquetas rellenas de equipo) y A_CONFIRMAR en 30 (naranja, para que
 * un dato faltante salte a la vista en vez de mezclarse con el resto).
 */
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

  // Desde AC1021 (R2007) el archivo entero va en UTF-8 — ya no hace falta
  // el truco de un byte por carácter en CP1252 que usaba la versión R12.
  return Buffer.from(contenido, "utf-8");
}
