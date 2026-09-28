import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import {
  CATEGORIA_EQUIPO_OPCIONES,
  CATEGORIA_EQUIPO_LABEL,
  TIPO_CIRCUITO_OPCIONES,
  TIPO_CIRCUITO_LABEL,
  TABLERO_TIPO_LABEL,
} from "@/components/tableros/types";
import type { TableroCategoriaEquipo, TableroTipo, TableroTipoCircuito } from "@/lib/database.types";

/**
 * Lee una foto del tablero con Claude Vision y devuelve una lista de
 * circuitos/elementos (número, texto, amperaje si es legible, categoría de
 * equipamiento y tipo de circuito) para precargar el formulario — el
 * técnico revisa y corrige antes de guardar, la IA nunca escribe directo a
 * la base. Un tablero puede ser mixto (energía + CCTV + control de acceso
 * en el mismo gabinete), así que la clasificación es universal: cualquier
 * elemento puede aparecer en cualquier foto, no se restringe por tipo.
 */

interface CircuitoDetectado {
  numero: number;
  texto: string;
  ampNominal: string;
  categoriaEquipo: TableroCategoriaEquipo;
  tipoCircuito: TableroTipoCircuito;
  identificado: boolean;
}

const CATEGORIAS_TEXTO = CATEGORIA_EQUIPO_OPCIONES.map((c) => `"${c}" (${CATEGORIA_EQUIPO_LABEL[c]})`).join(", ");
const TIPOS_CIRCUITO_TEXTO = TIPO_CIRCUITO_OPCIONES.map((t) => `"${t}" (${TIPO_CIRCUITO_LABEL[t]})`).join(", ");

export async function POST(req: NextRequest) {
  await requireProfile();

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "La lectura de fotos con IA no está configurada en este entorno (falta ANTHROPIC_API_KEY)." }, { status: 503 });
  }

  const formData = await req.formData();
  const file = formData.get("foto");
  const subsistemasParam = (formData.get("subsistemas") as string | null) ?? "";
  const subsistemas = subsistemasParam
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is TableroTipo => s === "energia" || s === "cctv" || s === "control_acceso");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta la foto." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mediaType = file.type === "image/png" ? "image/png" : "image/jpeg";

  const contextoSubsistemas =
    subsistemas.length > 0
      ? ` Este tablero en particular tiene relevado: ${subsistemas.map((s) => TABLERO_TIPO_LABEL[s]).join(", ")} — pero puede ser mixto, así que igual clasificá cada elemento por lo que ves, no asumas que todo pertenece a esos subsistemas.`
      : "";

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      output_config: { effort: "low" },
      system:
        "Sos un asistente que ayuda a un técnico de campo a relevar un tablero eléctrico, que puede ser mixto: interruptores/térmicas " +
        "de energía, fuentes/UPS/baterías/conversores, y también elementos de CCTV o control de acceso (cámaras, lectoras, cerraduras) " +
        `conviviendo en el mismo gabinete.${contextoSubsistemas} Te paso una foto y tenés que listar cada circuito/elemento identificable, ` +
        "en el orden en que aparecen físicamente (de arriba hacia abajo y de izquierda a derecha). Para cada uno: " +
        '"numero" (posición secuencial empezando en 1); "texto" (la etiqueta tal cual la leés si hay una legible — impresa, escrita a ' +
        "mano o en cinta —, y si NO hay ninguna etiqueta legible, describí el elemento por lo que ves físicamente: cantidad de polos, " +
        "grosor/color de cable, contactor/temporizador/fotocélula al lado, tipo de cámara/lectora, cantidad de conectores, etc. — nunca " +
        'inventes un nombre de circuito específico, tipo "Cocina", si no hay ninguna base visual para eso); "identificado" (true si "texto" ' +
        'viene de una etiqueta legible, false si es una descripción visual tuya); "ampNominal" (el amperaje impreso en el interruptor si es ' +
        'legible, ej. "32A" — cadena vacía "" si no se ve o no aplica); "categoriaEquipo" (una de estas, EXACTAMENTE como está escrita entre ' +
        `comillas — elegí la que mejor describa el elemento por su forma/función: ${CATEGORIAS_TEXTO} — usá "otro" solo si de verdad no ` +
        `encaja en ninguna); "tipoCircuito" (una de estas, EXACTAMENTE como está escrita entre comillas: ${TIPOS_CIRCUITO_TEXTO} — para ` +
        "térmicas/disyuntores inferí mono/trifásico por la cantidad de polos y el grosor de cable si no hay etiqueta; para fuentes/UPS/" +
        "baterías/conversores usá el voltaje de salida si es identificable (ej. un conversor a 12V es \"12vdc\"); para cámaras/lectoras/" +
        'cerraduras/bornera/otros que no tengan una tensión relevante para medir, usá "na"). No inventes elementos que no estén en la ' +
        "foto, y no adivines un amperaje o tensión que no puedas justificar por lo que ves. " +
        'Respondé ÚNICAMENTE con un JSON válido: un array de objetos {"numero": number, "texto": string, "ampNominal": string, ' +
        '"categoriaEquipo": string, "tipoCircuito": string, "identificado": boolean}, sin texto antes ni después.',
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: "Listame los circuitos/elementos de esta foto." },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !textBlock) {
      return NextResponse.json({ error: "No se pudo leer la foto." }, { status: 502 });
    }

    let circuitos: CircuitoDetectado[];
    try {
      const match = textBlock.text.match(/\[[\s\S]*\]/);
      circuitos = JSON.parse(match ? match[0] : textBlock.text);
    } catch {
      return NextResponse.json({ error: "La IA no devolvió una lista reconocible — probá con otra foto o cargá los circuitos a mano." }, { status: 502 });
    }
    if (!Array.isArray(circuitos) || circuitos.length === 0) {
      return NextResponse.json({ error: "No se detectó ningún circuito/elemento en la foto." }, { status: 200 });
    }

    const categoriasValidas = new Set<string>(CATEGORIA_EQUIPO_OPCIONES);
    const tiposCircuitoValidos = new Set<string>(TIPO_CIRCUITO_OPCIONES);

    return NextResponse.json({
      circuitos: circuitos
        .filter((c) => c && typeof c.texto === "string" && c.texto.trim())
        .map((c, i) => ({
          numero: Number.isFinite(c.numero) ? c.numero : i + 1,
          texto: String(c.texto).trim().slice(0, 120),
          ampNominal: typeof c.ampNominal === "string" ? c.ampNominal.trim().slice(0, 20) : "",
          categoriaEquipo: (categoriasValidas.has(c.categoriaEquipo) ? c.categoriaEquipo : "otro") as TableroCategoriaEquipo,
          tipoCircuito: (tiposCircuitoValidos.has(c.tipoCircuito) ? c.tipoCircuito : "na") as TableroTipoCircuito,
          identificado: c.identificado === true,
        })),
    });
  } catch {
    return NextResponse.json({ error: "No se pudo contactar al servicio de IA." }, { status: 502 });
  }
}
