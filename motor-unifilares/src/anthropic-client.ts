import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cargarEjemplos } from "./ejemplos.js";
import { CAPAS_DXF, type DrawCommand, type UnifilarCircuito, type RotuloUnifilar, type UnifilarDrawing } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGLAS_PATH = join(__dirname, "..", "reglas", "REGLAS_UNIFILAR.md");

/** El documento de reglas completo — lo reusa también scripts/ensenar.ts para darle el mismo contexto a los ejemplos nuevos. */
export const REGLAS_UNIFILAR = readFileSync(REGLAS_PATH, "utf-8");

export const ESQUEMA_DRAW_COMMAND = `
Cada elemento de "commands" es UNO de estos 5 tipos (discriminados por "type"):
- {"type":"line","x1":number,"y1":number,"x2":number,"y2":number,"layer":CAPA}
- {"type":"rect","x":number,"y":number,"width":number,"height":number,"layer":CAPA,"fill"?:boolean}
- {"type":"circle","x":number,"y":number,"r":number,"layer":CAPA}
- {"type":"ellipse","x":number,"y":number,"rx":number,"ry":number,"layer":CAPA}
- {"type":"text","x":number,"y":number,"text":string,"size":number,"layer":CAPA,"bold"?:boolean}

CAPA es EXACTAMENTE una de: ${CAPAS_DXF.join(", ")} (A9 del documento de reglas).

Unidades: milímetros reales, sobre una hoja A3 apaisada de 420x297mm. Origen
arriba-a-la-izquierda, Y crece hacia ABAJO (igual que una página normal, no
como un plano CAD — eso lo maneja el escritor DXF al final, no vos).
`.trim();

/** Ejemplos puntuales ya enseñados (ver reglas/ejemplos/) — casos reales resueltos que se suman a las reglas escritas. */
function construirBloqueEjemplos(): string {
  const ejemplos = cargarEjemplos();
  if (ejemplos.length === 0) return "";
  const bloques = ejemplos.map(
    (e) => `--- Ejemplo "${e.tag}" ---\nCuándo aplica: ${e.cuandoAplica}\nComandos:\n${JSON.stringify(e.commands)}`,
  );
  return (
    "\n\n=== EJEMPLOS ENSEÑADOS (casos reales ya resueltos y validados por el usuario, además de las reglas de arriba) ===\n\n" +
    bloques.join("\n\n") +
    '\n\nSi el tablero actual tiene un circuito/equipo que coincide con alguno de estos ejemplos, dibujalo siguiendo ESE ' +
    "patrón exacto de comandos (adaptando solo la posición y las coordenadas al lugar que le toca en el plano), en vez " +
    "de inventar una variante propia.\n"
  );
}

/** Prompt de sistema: el documento de reglas completo + los ejemplos enseñados + el esquema exacto que tiene que devolver. Nunca se resume el documento — la fidelidad a lo escrito ahí es el punto de todo este motor. */
function construirSystemPrompt(): string {
  return (
    "Sos un dibujante técnico que arma planos unifilares de tableros eléctricos, siguiendo al pie de la letra el estándar " +
    "de dibujo que te paso completo a continuación. Te dan una lista de circuitos YA RELEVADOS (de un tablero real, ya " +
    "revisados por un técnico) y tenés que devolver el plano como una lista de comandos de dibujo abstractos — el mismo " +
    "criterio que usa un CAD: líneas, rectángulos, círculos, elipses y texto, cada uno en su capa.\n\n" +
    "=== REGLAS_UNIFILAR.md (estándar completo, aplicá TODO lo que corresponda) ===\n\n" +
    REGLAS_UNIFILAR +
    construirBloqueEjemplos() +
    "\n\n=== FORMATO DE SALIDA ===\n\n" +
    ESQUEMA_DRAW_COMMAND +
    "\n\nRegla de oro (ya la viste arriba, la repito porque es la más importante): si un dato no está en el relevamiento, " +
    'no se inventa — se dibuja el texto "A CONFIRMAR" en la capa A_CONFIRMAR.\n\n' +
    "Respondé ÚNICAMENTE con un JSON válido: un objeto con \"commands\" (el array de comandos), \"width\" (420) y " +
    '"height" (el alto real que ocupó el dibujo, en mm — no fijes 297 de memoria, calculalo según cuánto contenido ' +
    "generaste, para que la hoja final no corte nada ni quede con espacio de más). Sin texto antes ni después, sin " +
    "bloque de código markdown."
  );
}

function construirUserMessage(circuitos: UnifilarCircuito[], rotulo: RotuloUnifilar): string {
  return (
    "Armá el unifilar de este tablero. Datos del rótulo (cuadro de título):\n" +
    JSON.stringify(rotulo, null, 2) +
    "\n\nCircuitos relevados (orden de lectura real, con su encadenado por padreNumero):\n" +
    JSON.stringify(circuitos, null, 2)
  );
}

const CAPAS_VALIDAS = new Set<string>(CAPAS_DXF);

export function validarDrawCommand(c: unknown): c is DrawCommand {
  if (!c || typeof c !== "object") return false;
  const o = c as Record<string, unknown>;
  if (typeof o.layer !== "string" || !CAPAS_VALIDAS.has(o.layer)) return false;
  switch (o.type) {
    case "line":
      return [o.x1, o.y1, o.x2, o.y2].every((n) => typeof n === "number");
    case "rect":
      return [o.x, o.y, o.width, o.height].every((n) => typeof n === "number");
    case "circle":
      return [o.x, o.y, o.r].every((n) => typeof n === "number");
    case "ellipse":
      return [o.x, o.y, o.rx, o.ry].every((n) => typeof n === "number");
    case "text":
      return typeof o.x === "number" && typeof o.y === "number" && typeof o.text === "string" && typeof o.size === "number";
    default:
      return false;
  }
}

export class RespuestaIaInvalida extends Error {}

/**
 * Le pasa los circuitos + el rótulo a Claude, con REGLAS_UNIFILAR.md entero
 * como contexto, y devuelve el `UnifilarDrawing` ya validado. `apiKey` es
 * la de quien llama (ver README) — este servicio no tiene una propia.
 */
export async function generarUnifilar(apiKey: string, circuitos: UnifilarCircuito[], rotulo: RotuloUnifilar): Promise<UnifilarDrawing> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    system: construirSystemPrompt(),
    messages: [{ role: "user", content: construirUserMessage(circuitos, rotulo) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new RespuestaIaInvalida(`La IA no devolvió un bloque de texto utilizable (stop_reason=${response.stop_reason}).`);
  }

  let parsed: unknown;
  try {
    const match = textBlock.text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : textBlock.text);
  } catch {
    throw new RespuestaIaInvalida("La respuesta de la IA no fue JSON parseable.");
  }

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.commands) || typeof obj.width !== "number" || typeof obj.height !== "number") {
    throw new RespuestaIaInvalida('La respuesta no tiene la forma esperada ({"commands":[],"width":n,"height":n}).');
  }
  const comandosInvalidos = obj.commands.filter((c) => !validarDrawCommand(c));
  if (comandosInvalidos.length > 0) {
    throw new RespuestaIaInvalida(`${comandosInvalidos.length} de ${obj.commands.length} comandos no tienen una forma válida de DrawCommand.`);
  }

  return { commands: obj.commands as DrawCommand[], width: obj.width, height: obj.height };
}
