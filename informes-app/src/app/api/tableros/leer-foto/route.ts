import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import type { TableroTipo } from "@/lib/database.types";

/**
 * Lee una foto del tablero con Claude Vision y devuelve una lista de
 * circuitos/elementos (número, texto, amperaje si es legible en el
 * interruptor) para precargar el formulario — el técnico revisa y corrige
 * antes de guardar, la IA nunca escribe directo a la base.
 */

interface CircuitoDetectado {
  numero: number;
  texto: string;
  ampNominal: string;
  identificado: boolean;
}

export async function POST(req: NextRequest) {
  await requireProfile();

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "La lectura de fotos con IA no está configurada en este entorno (falta ANTHROPIC_API_KEY)." }, { status: 503 });
  }

  const formData = await req.formData();
  const file = formData.get("foto");
  const tipo = (formData.get("tipo") as TableroTipo | null) ?? "energia";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta la foto." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const mediaType = file.type === "image/png" ? "image/png" : "image/jpeg";

  const energia = tipo === "energia";
  const contexto = energia
    ? "un tablero eléctrico, con una fila de interruptores/térmicas, cada uno con una etiqueta (impresa, escrita a mano o en una cinta) al lado indicando qué circuito alimenta, y muchas veces el amperaje impreso en el propio interruptor (ej. \"32A\", \"C16\")"
    : `un tablero de ${tipo === "cctv" ? "CCTV" : "control de acceso"}, con elementos identificados por etiqueta (cámaras, lectoras, zonas, etc.)`;
  const pistasVisuales = energia
    ? "cantidad de polos (mono/bi/trifásico — un interruptor trifásico suele alimentar un motor, AC o carga trifásica, uno monofásico suele ser iluminación o tomas), " +
      "grosor y color de los cables que salen, si hay un contactor/temporizador/fotocélula al lado (sugiere iluminación exterior o control automático), " +
      "si hay una llave diferencial/disyuntor agrupando varios interruptores, y la posición relativa a otros circuitos ya identificados (los agrupados o contiguos suelen ser del mismo tablero/zona)"
    : "tipo de elemento por su forma (cámara domo vs. bullet, lectora de proximidad, cerradura eléctrica, fuente/UPS, switch PoE), cantidad de conectores o cables que le llegan, y su posición dentro del gabinete";

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1536,
      output_config: { effort: "low" },
      system:
        `Sos un asistente que ayuda a un técnico de campo a relevar ${contexto}. Te paso una foto y tenés que listar ` +
        "cada circuito/elemento identificable, en el orden en que aparecen físicamente (de arriba hacia abajo y de " +
        "izquierda a derecha). Para cada uno: \"numero\" (posición secuencial empezando en 1), \"texto\" y \"ampNominal\" " +
        "(el amperaje impreso en el interruptor si es legible, ej. \"32A\"; dejalo como cadena vacía \"\" si no se ve o " +
        `no aplica${energia ? "" : " — para CCTV/control de acceso normalmente no aplica, dejalo vacío"}). ` +
        "Muchos tableros de campo NO tienen ninguna etiqueta en los circuitos — eso no es un motivo para omitirlos. " +
        "Para cada elemento fijate primero si hay una etiqueta legible (impresa, escrita a mano o en cinta): si la hay, " +
        "\"texto\" es esa etiqueta tal cual y \"identificado\" es true. Si NO hay ninguna etiqueta legible, igual " +
        `describí el elemento usando lo que se ve físicamente (${pistasVisuales}) — ej. "Interruptor trifásico 3P — ` +
        "posible motor/AC (sin etiqueta)\", o \"Cámara domo sin etiqueta\" — y poné \"identificado\" en false. " +
        "Nunca inventes un nombre de circuito específico que no puedas justificar por lo que ves (no digas \"Cocina\" " +
        "si no hay ninguna pista de que sea la cocina); en ese caso describí el elemento en términos físicos/técnicos, " +
        "no adivines su función si no hay ninguna base visual, y no adivines un amperaje que no puedas leer con claridad. " +
        'Respondé ÚNICAMENTE con un JSON válido: un array de objetos {"numero": number, "texto": string, ' +
        '"ampNominal": string, "identificado": boolean}, sin texto antes ni después.',
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

    return NextResponse.json({
      circuitos: circuitos
        .filter((c) => c && typeof c.texto === "string" && c.texto.trim())
        .map((c, i) => ({
          numero: Number.isFinite(c.numero) ? c.numero : i + 1,
          texto: String(c.texto).trim().slice(0, 120),
          ampNominal: typeof c.ampNominal === "string" ? c.ampNominal.trim().slice(0, 20) : "",
          identificado: c.identificado === true,
        })),
    });
  } catch {
    return NextResponse.json({ error: "No se pudo contactar al servicio de IA." }, { status: 502 });
  }
}
