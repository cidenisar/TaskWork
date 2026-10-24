import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { listarEjemplos } from "./ejemplos-store.js";
import { calcularCodigosUnificados } from "./codigos-equipo.js";
import { armarLotes, circuitosDelLote } from "./lotes.js";
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

/** Ejemplos puntuales ya enseñados (ver src/ensenar.ts) — casos reales resueltos que se suman a las reglas escritas. */
async function construirBloqueEjemplos(): Promise<string> {
  const ejemplos = await listarEjemplos();
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

/**
 * Prompt de sistema: el documento de reglas completo + los ejemplos
 * enseñados + el esquema exacto que tiene que devolver, UNA SOLA VEZ por
 * generación (no por lote — ver `generarUnifilar`), con `cache_control`
 * para que la API de Anthropic no vuelva a procesar este bloque grande en
 * cada uno de los varios llamados de una misma generación. Nunca se
 * resume el documento — la fidelidad a lo escrito ahí es el punto de todo
 * este motor.
 */
async function construirSystemPrompt(): Promise<Anthropic.TextBlockParam[]> {
  const texto =
    "Sos un dibujante técnico que arma planos unifilares de tableros eléctricos, siguiendo al pie de la letra el estándar " +
    "de dibujo que te paso completo a continuación. Te dan una lista de circuitos YA RELEVADOS (de un tablero real, ya " +
    "revisados por un técnico) y tenés que devolver el plano como una lista de comandos de dibujo abstractos — el mismo " +
    "criterio que usa un CAD: líneas, rectángulos, círculos, elipses y texto, cada uno en su capa.\n\n" +
    "=== REGLAS_UNIFILAR.md (estándar completo, aplicá TODO lo que corresponda) ===\n\n" +
    REGLAS_UNIFILAR +
    (await construirBloqueEjemplos()) +
    "\n\n=== FORMATO DE SALIDA ===\n\n" +
    ESQUEMA_DRAW_COMMAND +
    "\n\nRegla de oro (ya la viste arriba, la repito porque es la más importante): si un dato no está en el relevamiento, " +
    'no se inventa — se dibuja el texto "A CONFIRMAR" en la capa A_CONFIRMAR.\n\n' +
    "=== GENERACIÓN POR TRAMOS (importante) ===\n\n" +
    "Por el tiempo máximo que tiene la función que te llama, el tablero completo NO se te pide en un solo pedido — se " +
    "divide en varios llamados separados, cada uno por un pedazo del mismo dibujo final, que después se unen en código " +
    "(trasladando cada pedazo a su posición Y real). En cada pedido te digo exactamente qué tenés que dibujar ahora; " +
    "dibujá SOLO eso, nunca de más ni de menos — no repitas elementos de otro tramo ni te adelantes a dibujar algo que " +
    "todavía no te pidieron. Hay dos tipos de pedido:\n\n" +
    '1. "circuitos": dibujás un tramo del cuerpo del tablero (cabecera B1 y/o una tanda de circuitos B2/B3), empezando ' +
    "SIEMPRE en Y=0 arriba de tu propio tramo (el lugar real en la hoja lo calcula el código después) — NUNCA dibujes " +
    "el marco, el título, el rótulo ni el sello, eso es un pedido aparte. Cada circuito que te paso ya trae su propio " +
    'campo "codigo" (Cnn, PD-n, BNR-nn, GENERAL, etc., ya calculado) — usalo tal cual en el rótulo del símbolo, nunca ' +
    "inventes ni renumeres un código de circuito vos. La numeración de conductores (A4: series A/P/T) sí es tuya: " +
    "te paso en qué número arranca cada serie para este tramo (porque el tablero sigue una sola numeración de punta a " +
    "punta, no por tramo) y vos devolvés en qué número quedaste al terminar, para que el próximo tramo continúe de ahí " +
    '— respondé con {"commands":[...],"height":<alto real que ocupó este tramo>,"numeroAFinal":<próximo A libre>,' +
    '"numeroPFinal":<próximo P libre>,"numeroTFinal":<próximo T libre>} (si no usaste una serie en este tramo, el ' +
    "Final de esa serie es igual al inicial que te pasaron).\n" +
    '2. "marco_rotulo": es el último llamado de la generación — acá SÍ dibujás únicamente el marco (A2: grilla 1-16/' +
    "A-H con flechas de centrado, bloque de revisiones), el título de 2 líneas, el rótulo abajo a la derecha y el " +
    "sello PARA REVISION, usando el alto total de contenido que te paso (el marco tiene que envolver TODO ese " +
    'contenido, que ya está dibujado por los llamados anteriores). Respondé con {"commands":[...],"height":<alto final ' +
    "de la hoja completa, incluyendo el espacio del rótulo/sello si hace falta más que el alto de contenido que te " +
    'pasé>} — sin numeroAFinal/P/T, ese pedido no dibuja circuitos.\n\n' +
    "Respondé SIEMPRE ÚNICAMENTE con el JSON pedido para el tipo de llamado que te toque, sin texto antes ni después, " +
    "sin bloque de código markdown.";

  return [{ type: "text", text: texto, cache_control: { type: "ephemeral" } }];
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

function validarComandos(commands: unknown): DrawCommand[] {
  if (!Array.isArray(commands)) throw new RespuestaIaInvalida('La respuesta no tiene "commands" como array.');
  const invalidos = commands.filter((c) => !validarDrawCommand(c));
  if (invalidos.length > 0) {
    throw new RespuestaIaInvalida(`${invalidos.length} de ${commands.length} comandos no tienen una forma válida de DrawCommand.`);
  }
  return commands as DrawCommand[];
}

/** Desplaza todas las coordenadas Y de un lote de comandos ya generado (cada tramo llega dibujado desde Y=0, acá se lo reubica en su altura real dentro de la hoja completa). */
function trasladarComandos(commands: DrawCommand[], dy: number): DrawCommand[] {
  if (dy === 0) return commands;
  return commands.map((c) => {
    switch (c.type) {
      case "line":
        return { ...c, y1: c.y1 + dy, y2: c.y2 + dy };
      case "rect":
      case "circle":
      case "ellipse":
      case "text":
        return { ...c, y: c.y + dy };
    }
  });
}

async function llamarIa(apiKey: string, system: Anthropic.TextBlockParam[], userMessage: string, maxTokens: number): Promise<Record<string, unknown>> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new RespuestaIaInvalida(`La IA no devolvió un bloque de texto utilizable (stop_reason=${response.stop_reason}).`);
  }
  try {
    const match = textBlock.text.match(/\{[\s\S]*\}/);
    return JSON.parse(match ? match[0] : textBlock.text) as Record<string, unknown>;
  } catch {
    throw new RespuestaIaInvalida("La respuesta de la IA no fue JSON parseable.");
  }
}

interface CircuitoConCodigo extends UnifilarCircuito {
  codigo: string;
}

function construirMensajeCircuitos(
  circuitos: CircuitoConCodigo[],
  incluirCabecera: boolean,
  rotulo: RotuloUnifilar,
  numeroAInicial: number,
  numeroPInicial: number,
  numeroTInicial: number,
): string {
  return (
    `Pedido de tipo "circuitos".` +
    (incluirCabecera
      ? " Este es el PRIMER tramo del tablero: dibujá primero la cabecera (B1 — ORIGEN, térmica GENERAL, borneras BNR, " +
        "protector de sobretensión, recuadro PUESTA A TIERRA) y después, debajo, estos circuitos."
      : " Este es un tramo intermedio: NO dibujes cabecera, arrancá directo con la barra de estos circuitos (B2).") +
    `\n\nDatos del rótulo (cuadro de título, solo para contexto — no lo dibujes acá):\n${JSON.stringify(rotulo, null, 2)}` +
    `\n\nNumeración de conductores: arrancá en A ${numeroAInicial}, P ${numeroPInicial}, T ${numeroTInicial}.` +
    `\n\nCircuitos de este tramo (orden de lectura real, con su encadenado por padreNumero y su "codigo" ya asignado):\n` +
    JSON.stringify(circuitos, null, 2)
  );
}

function construirMensajeMarcoRotulo(rotulo: RotuloUnifilar, alturaContenido: number, tensionesPresentes: string[]): string {
  return (
    `Pedido de tipo "marco_rotulo". Alto real del contenido ya dibujado por los tramos anteriores: ${alturaContenido}mm ` +
    `(el marco tiene que cubrir desde Y=0 hasta al menos esa altura).\n\n` +
    `Tensiones presentes en este tablero (para la segunda línea del título, "UNIFILAR <tensión> HOJA 1"): ` +
    `${tensionesPresentes.join("/") || "A CONFIRMAR"}.\n\n` +
    `Datos del rótulo (cuadro de título):\n${JSON.stringify(rotulo, null, 2)}`
  );
}

const TENSION_POR_TIPO_CIRCUITO: Partial<Record<UnifilarCircuito["tipoCircuito"], string>> = {
  "220v_mono": "220V",
  "380v_tri": "380V",
  "24vdc": "24V",
  "12vdc": "12V",
};

function tensionesPresentesEn(circuitos: UnifilarCircuito[]): string[] {
  const vistas = new Set<string>();
  const orden: string[] = [];
  for (const c of circuitos) {
    const tension = TENSION_POR_TIPO_CIRCUITO[c.tipoCircuito];
    if (tension && !vistas.has(tension)) {
      vistas.add(tension);
      orden.push(tension);
    }
  }
  return orden;
}

/**
 * Le pasa los circuitos + el rótulo a Claude y devuelve el `UnifilarDrawing`
 * ya validado. `apiKey` es la de quien llama (ver README) — este servicio
 * no tiene una propia.
 *
 * La generación se parte en varios llamados (ver `armarLotes`) porque un
 * tablero con muchos circuitos, pedido entero de una, puede superar el
 * límite de tiempo de la función serverless (ver README, "Vercel Runtime
 * Timeout") — cada lote dibuja su propio tramo (empezando en Y=0) y acá se
 * trasladan y concatenan en la posición real, más un último llamado que
 * dibuja el marco/título/rótulo alrededor de todo el contenido ya armado.
 * Los códigos de equipo (Cnn/PD-n/etc.) se calculan una sola vez en código
 * (codigos-equipo.ts) para que sean consistentes entre lotes — ver el
 * comentario de ese archivo sobre por qué no se le pide eso a la IA.
 */
export async function generarUnifilar(apiKey: string, circuitos: UnifilarCircuito[], rotulo: RotuloUnifilar): Promise<UnifilarDrawing> {
  const system = await construirSystemPrompt();
  const codigos = calcularCodigosUnificados(circuitos);
  const lotes = armarLotes(circuitos);

  const commands: DrawCommand[] = [];
  let alturaAcumulada = 0;
  let numeroA = 1;
  let numeroP = 1;
  let numeroT = 1;

  for (const [i, lote] of lotes.entries()) {
    const circuitosConCodigo: CircuitoConCodigo[] = circuitosDelLote(lote).map((c) => ({
      ...c,
      codigo: codigos.get(c.numero)?.texto ?? "A CONFIRMAR",
    }));
    const userMessage = construirMensajeCircuitos(circuitosConCodigo, i === 0, rotulo, numeroA, numeroP, numeroT);
    const maxTokens = Math.min(8000, 3000 + circuitosConCodigo.length * 600);
    const parsed = await llamarIa(apiKey, system, userMessage, maxTokens);

    if (typeof parsed.height !== "number" || typeof parsed.numeroAFinal !== "number" || typeof parsed.numeroPFinal !== "number" || typeof parsed.numeroTFinal !== "number") {
      throw new RespuestaIaInvalida(
        'La respuesta de un tramo "circuitos" no tiene la forma esperada ({"commands","height","numeroAFinal","numeroPFinal","numeroTFinal"}).',
      );
    }
    const loteComandos = validarComandos(parsed.commands);
    commands.push(...trasladarComandos(loteComandos, alturaAcumulada));
    alturaAcumulada += parsed.height;
    numeroA = parsed.numeroAFinal;
    numeroP = parsed.numeroPFinal;
    numeroT = parsed.numeroTFinal;
  }

  const userMessageMarco = construirMensajeMarcoRotulo(rotulo, alturaAcumulada, tensionesPresentesEn(circuitos));
  const parsedMarco = await llamarIa(apiKey, system, userMessageMarco, 3000);
  if (typeof parsedMarco.height !== "number") {
    throw new RespuestaIaInvalida('La respuesta del tramo "marco_rotulo" no tiene la forma esperada ({"commands","height"}).');
  }
  const comandosMarco = validarComandos(parsedMarco.commands);
  commands.push(...comandosMarco);

  return { commands, width: 420, height: Math.max(alturaAcumulada, parsedMarco.height) };
}
