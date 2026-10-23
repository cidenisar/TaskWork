/**
 * Herramienta de desarrollo para "enseñarle" un caso puntual al motor:
 * se le pasa una imagen real (ej. una captura de AutoCAD) + una explicación
 * de un técnico sobre cómo se conecta/dibuja eso, y Claude lo convierte en
 * un ejemplo reusable (reglas/ejemplos/<tag>.json) que el generador suma a
 * las reglas desde ese momento (ver src/anthropic-client.ts).
 *
 * Uso:
 *   ANTHROPIC_API_KEY=... npm run ensenar -- <imagen> <explicación-o-archivo.txt> [tag]
 *
 * El tag es opcional — si no se pasa, lo decide la IA a partir de la imagen
 * y la explicación. Si ya existe un archivo con ese tag, se pisa (es la
 * forma de corregir un ejemplo mal enseñado).
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { REGLAS_UNIFILAR, ESQUEMA_DRAW_COMMAND, validarDrawCommand } from "../src/anthropic-client.js";
import { EJEMPLOS_DIR } from "../src/ejemplos.js";
import { drawCommandsToDxf } from "../src/dxf-writer.js";
import type { DrawCommand } from "../src/types.js";

const MEDIA_TYPE_POR_EXTENSION: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function construirSystemPrompt(): string {
  return (
    "Sos un dibujante técnico experto en el mismo estándar de planos unifilares que ya conocés por las reglas de abajo. " +
    "Un técnico te muestra una imagen real (una captura de AutoCAD, una foto de un plano, etc.) de un caso puntual — un " +
    "equipo o una conexión que las reglas escritas no alcanzan a cubrir bien solo con texto — y te explica cómo se " +
    "dibuja/conecta. Tu trabajo es convertir ESE caso puntual en un ejemplo reusable: un fragmento de comandos de " +
    "dibujo (no un tablero completo, solo el elemento/conexión que te están enseñando) en las mismas convenciones que " +
    "ya usás para armar planos completos.\n\n" +
    "=== REGLAS_UNIFILAR.md (mismo estándar de siempre, para que el ejemplo nuevo sea consistente con él) ===\n\n" +
    REGLAS_UNIFILAR +
    "\n\n=== FORMATO DE CADA COMANDO ===\n\n" +
    ESQUEMA_DRAW_COMMAND +
    "\n\nRespondé ÚNICAMENTE con un JSON válido, sin texto antes ni después ni bloque de código markdown, con esta forma:\n" +
    '{"tag": "identificador_corto_en_snake_case", "cuandoAplica": "descripción corta de cuándo usar este ejemplo — qué ' +
    'equipo o situación es, para que el generador lo reconozca en futuros tableros", "commands": [ /* DrawCommand[] */ ]}\n\n' +
    "El fragmento de comandos arranca en coordenadas razonables cerca de (0,0) — quien lo use después lo va a reposicionar."
  );
}

async function main(): Promise<void> {
  const [imagenPath, explicacionArg, tagForzado] = process.argv.slice(2);
  if (!imagenPath || !explicacionArg) {
    console.error("Uso: npm run ensenar -- <imagen> <explicación-o-archivo.txt> [tag]");
    process.exit(1);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Falta ANTHROPIC_API_KEY en el entorno.");
    process.exit(1);
  }

  const extension = extname(imagenPath).toLowerCase();
  const mediaType = MEDIA_TYPE_POR_EXTENSION[extension];
  if (!mediaType) {
    console.error(`Extensión de imagen no soportada: "${extension}" (usar .jpg/.jpeg/.png/.webp).`);
    process.exit(1);
  }
  const imagenBase64 = readFileSync(imagenPath).toString("base64");
  const explicacion = existsSync(explicacionArg) ? readFileSync(explicacionArg, "utf-8") : explicacionArg;

  console.log("Consultando a Claude...");
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    system: construirSystemPrompt(),
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imagenBase64 } },
          { type: "text", text: `Explicación del técnico:\n\n${explicacion}` },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`La IA no devolvió un bloque de texto utilizable (stop_reason=${response.stop_reason}).`);
  }
  const match = textBlock.text.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match ? match[0] : textBlock.text) as Record<string, unknown>;

  const tag = (tagForzado ?? parsed.tag) as string;
  if (typeof tag !== "string" || !/^[a-z0-9_]+$/.test(tag)) {
    throw new Error(`Tag inválido: "${String(tag)}" (tiene que ser snake_case).`);
  }
  if (typeof parsed.cuandoAplica !== "string" || !Array.isArray(parsed.commands)) {
    throw new Error('La respuesta no tiene la forma esperada ({"tag","cuandoAplica","commands"}).');
  }
  const comandosInvalidos = parsed.commands.filter((c) => !validarDrawCommand(c));
  if (comandosInvalidos.length > 0) {
    throw new Error(`${comandosInvalidos.length} de ${parsed.commands.length} comandos no son DrawCommand válidos.`);
  }
  const commands = parsed.commands as DrawCommand[];

  mkdirSync(EJEMPLOS_DIR, { recursive: true });
  const destino = join(EJEMPLOS_DIR, `${tag}.json`);
  writeFileSync(destino, JSON.stringify({ tag, cuandoAplica: parsed.cuandoAplica, commands }, null, 2) + "\n", "utf-8");
  console.log(`Ejemplo guardado en ${destino}`);
  console.log(`Cuándo aplica: ${parsed.cuandoAplica}`);

  const maxY = Math.max(50, ...commands.flatMap((c) => ("y" in c ? [c.y] : [c.y1, c.y2])));
  const dxfPath = join("/tmp", `ejemplo-${tag}.dxf`);
  writeFileSync(dxfPath, drawCommandsToDxf(commands, maxY + 20));
  console.log(`DXF de previsualización: ${dxfPath} (abrilo con un lector DXF/ezdxf para confirmar que se ve bien antes de commitear).`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
