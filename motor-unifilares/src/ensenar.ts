/**
 * Núcleo de "enseñar un caso puntual" — recibe una imagen real (ej. una
 * captura de AutoCAD) + una explicación de un técnico, y le pide a Claude
 * que lo convierta en un `Ejemplo` reusable (ver types.ts). Lo usan tanto
 * scripts/ensenar.ts (CLI) como POST /api/ejemplos/previsualizar
 * (interfaz web, ver public/index.html) — un solo lugar para esta
 * lógica, dos formas de dispararla.
 */
import Anthropic from "@anthropic-ai/sdk";
import { REGLAS_UNIFILAR, ESQUEMA_DRAW_COMMAND, validarDrawCommand } from "./anthropic-client.js";
import type { DrawCommand, Ejemplo } from "./types.js";

export type MediaTypeImagen = "image/jpeg" | "image/png" | "image/webp";

export class RespuestaEnsenarInvalida extends Error {}

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

/**
 * Le pide a Claude que convierta imagen + explicación en un `Ejemplo`
 * validado. No lo persiste — eso lo hace el que llama (ver
 * ejemplos-store.ts), recién después de que el humano revisó la
 * previsualización.
 */
export async function generarEjemploDesdeImagen(
  apiKey: string,
  imagenBase64: string,
  mediaType: MediaTypeImagen,
  explicacion: string,
  tagForzado?: string,
): Promise<Ejemplo> {
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
    throw new RespuestaEnsenarInvalida(`La IA no devolvió un bloque de texto utilizable (stop_reason=${response.stop_reason}).`);
  }

  let parsed: unknown;
  try {
    const match = textBlock.text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : textBlock.text);
  } catch {
    throw new RespuestaEnsenarInvalida("La respuesta de la IA no fue JSON parseable.");
  }

  const obj = parsed as Record<string, unknown>;
  const tag = (tagForzado ?? obj.tag) as unknown;
  if (typeof tag !== "string" || !/^[a-z0-9_]+$/.test(tag)) {
    throw new RespuestaEnsenarInvalida(`Tag inválido: "${String(tag)}" (tiene que ser snake_case, solo minúsculas/números/_).`);
  }
  if (typeof obj.cuandoAplica !== "string" || !Array.isArray(obj.commands)) {
    throw new RespuestaEnsenarInvalida('La respuesta no tiene la forma esperada ({"tag","cuandoAplica","commands"}).');
  }
  const comandosInvalidos = obj.commands.filter((c) => !validarDrawCommand(c));
  if (comandosInvalidos.length > 0) {
    throw new RespuestaEnsenarInvalida(`${comandosInvalidos.length} de ${obj.commands.length} comandos no tienen una forma válida de DrawCommand.`);
  }

  return { tag, cuandoAplica: obj.cuandoAplica, commands: obj.commands as DrawCommand[] };
}
