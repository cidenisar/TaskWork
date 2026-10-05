import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIA_EQUIPO_OPCIONES, CATEGORIA_EQUIPO_LABEL, TORRE_FOTO_IA_MAX } from "@/components/torres-comunicacion/types";
import type { TorreComunicacionCategoriaEquipo } from "@/lib/database.types";

/**
 * Lee hasta TORRE_FOTO_IA_MAX fotos de una torre de comunicaciones con
 * Claude Vision (en un solo pedido, todas juntas) y devuelve una lista
 * combinada de equipamiento (número, etiqueta/nombre, categoría, marca/
 * modelo y altura si son legibles) para precargar el formulario — el
 * técnico revisa y corrige antes de guardar, la IA nunca escribe directo a
 * la base. Mismo criterio que /api/racks/leer-foto, adaptado a lo que se
 * monta en una torre (antenas, radioenlaces, baliza, etc.) en vez de un
 * rack de sala técnica.
 */

interface EquipoDetectado {
  numero: number;
  texto: string;
  categoriaEquipo: TorreComunicacionCategoriaEquipo;
  marcaModelo: string;
  alturaM: string;
  etiquetaYpf: string;
  identificado: boolean;
  consumoPromedioW: number | null;
  consumoMaxW: number | null;
}

const CATEGORIAS_TEXTO = CATEGORIA_EQUIPO_OPCIONES.map((c) => `"${c}" (${CATEGORIA_EQUIPO_LABEL[c]})`).join(", ");

/**
 * Deja un registro en Configuración → Errores del dispositivo cuando la IA
 * no devuelve algo utilizable — mismo criterio que leer-foto-rack-ia.
 */
async function logDiagnostico(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  mensaje: string,
  extra?: string,
) {
  try {
    await supabase.from("client_errores").insert({
      user_id: userId,
      contexto: "leer-foto-torre-comunicacion-ia",
      mensaje: mensaje.slice(0, 2000),
      stack: extra ? extra.slice(0, 4000) : null,
    });
  } catch {
    // el diagnóstico es best-effort, nunca debe romper la respuesta real
  }
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile();
  const supabase = await createClient();

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "La lectura de fotos con IA no está configurada en este entorno (falta ANTHROPIC_API_KEY)." }, { status: 503 });
  }

  const formData = await req.formData();
  const files = formData.getAll("fotos").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Falta al menos una foto." }, { status: 400 });
  }
  if (files.length > TORRE_FOTO_IA_MAX) {
    return NextResponse.json({ error: `Máximo ${TORRE_FOTO_IA_MAX} fotos por lectura.` }, { status: 400 });
  }

  const imagenes = await Promise.all(
    files.map(async (file) => ({
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      mediaType: (file.type === "image/png" ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg",
    })),
  );

  const contextoFotos =
    imagenes.length > 1
      ? ` Te paso ${imagenes.length} fotos de la MISMA torre (pueden ser ángulos distintos, alturas distintas, fotos tomadas desde ` +
        "lados opuestos de la torre, o un close-up de una etiqueta que en otra foto se ve borrosa) — combinalas en una sola lista de " +
        "equipamiento: si el mismo equipo físico aparece en más de una foto, contalo una sola vez (usá la foto donde se vea más claro " +
        "para completar texto/marca/altura), y numerá de forma correlativa el conjunto combinado, no cada foto por separado."
      : "";

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 16000,
      output_config: { effort: "high" },
      system:
        "Sos un asistente que ayuda a un técnico de campo a relevar el equipamiento montado en una torre de comunicaciones (antenas, " +
        `radioenlaces/microondas, antenas celulares/trunking, balizas de obstrucción, pararrayos, cableado/feeder, etc.).${contextoFotos}\n\n` +
        "Listá cada equipo identificable, en el orden en que aparecen físicamente montados en la torre (de arriba hacia abajo). Devolvé " +
        "SIEMPRE al menos los equipos que puedas distinguir, aunque no tengan etiqueta — describilos por su aspecto en vez de omitirlos; " +
        "solo dejá la lista vacía si la foto no muestra ninguna torre o equipo reconocible.\n\n" +
        "Para cada equipo completá estos campos:\n" +
        '- "numero": posición secuencial empezando en 1 (de arriba hacia abajo de la torre).\n' +
        '- "texto": la etiqueta/nombre tal cual se lee si hay uno legible — NUNCA el número de una etiqueta de inventario de YPF, que ' +
        'va aparte en "etiquetaYpf". Si NO hay ninguna etiqueta/nombre legible, este campo es OBLIGATORIO igual: describí el equipo ' +
        'por lo que ves físicamente (tipo de antena, cantidad de paneles/dishes, tamaño, color, etc.). Nunca lo dejes vacío, y nunca ' +
        'inventes un nombre de equipo específico que no puedas justificar por lo que ves.\n' +
        '- "identificado": true si "texto" viene de una etiqueta legible, false si es tu descripción visual.\n' +
        `- "categoriaEquipo": EXACTAMENTE una de estas cadenas, la que mejor describa el equipo por su forma/función: ${CATEGORIAS_TEXTO}. ` +
        'Usá "otro" solo si de verdad no encaja en ninguna.\n' +
        '- "marcaModelo": marca y/o modelo impreso en el equipo si es legible. Cadena vacía "" si no se ve o no es legible — no inventes ' +
        "ni adivines una marca/modelo que no puedas leer.\n" +
        '- "alturaM": la altura aproximada en metros si se puede estimar por referencias visuales en la foto (ej. "24m"). Cadena vacía ' +
        '"" si no se puede estimar con ningún nivel de confianza — nunca inventes un número.\n' +
        '- "etiquetaYpf": el número de una etiqueta/chapa de INVENTARIO DE YPF si hay una pegada en el equipo. Cadena vacía "" si no ' +
        "hay una etiqueta de inventario así, o no es legible — no la confundas con marcaModelo.\n" +
        '- "consumoPromedioW": SOLO para equipamiento ACTIVO (radioenlaces, baliza) y solo si identificaste una marca/modelo específica ' +
        "que reconocés con confianza por tu conocimiento general de ese producto (no por la foto) — tu mejor estimación del consumo " +
        'REAL típico en Watts en uso normal. Para equipamiento PASIVO (antenas, pararrayos, cableado) siempre null: no consumen energía.\n' +
        '- "consumoMaxW": igual criterio que consumoPromedioW pero para el consumo PICO/MÁXIMO — siempre mayor o igual a ' +
        "consumoPromedioW, null si consumoPromedioW también es null.\n" +
        'Para ambos campos de consumo: es una ESTIMACIÓN para planificación energética, no una medición — nunca inventes un número ' +
        "para un equipo que no podés justificar de ninguna forma.\n\n" +
        "No inventes equipos que no estén en la foto, y no adivines una marca/modelo/altura/etiqueta que no puedas justificar por lo " +
        'que ves — pero "texto" y "categoriaEquipo" son obligatorios en todos los casos, con tu mejor estimación visual si hace falta.\n\n' +
        'Respondé ÚNICAMENTE con un JSON válido: un array de objetos {"numero": number, "texto": string, "categoriaEquipo": string, ' +
        '"marcaModelo": string, "alturaM": string, "etiquetaYpf": string, "identificado": boolean, "consumoPromedioW": number | null, ' +
        '"consumoMaxW": number | null}, sin texto antes ni después, sin bloque de código markdown.',
      messages: [
        {
          role: "user",
          content: [
            ...imagenes.map((img) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
            })),
            {
              type: "text",
              text:
                imagenes.length > 1
                  ? `Listame el equipamiento combinando estas ${imagenes.length} fotos de la misma torre.`
                  : "Listame el equipamiento de esta foto.",
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !textBlock) {
      await logDiagnostico(supabase, profile.id, `leer-foto: stop_reason=${response.stop_reason}, sin bloque de texto utilizable`);
      return NextResponse.json({ error: "No se pudo leer la foto." }, { status: 502 });
    }

    let equipos: EquipoDetectado[];
    try {
      const match = textBlock.text.match(/\[[\s\S]*\]/);
      equipos = JSON.parse(match ? match[0] : textBlock.text);
    } catch {
      await logDiagnostico(supabase, profile.id, "leer-foto: la respuesta no fue JSON parseable", textBlock.text);
      return NextResponse.json({ error: "La IA no devolvió una lista reconocible — probá con otra foto o cargá el equipamiento a mano." }, { status: 502 });
    }
    if (!Array.isArray(equipos) || equipos.length === 0) {
      await logDiagnostico(supabase, profile.id, "leer-foto: la IA devolvió una lista vacía", textBlock.text);
      return NextResponse.json({ error: "No se detectó ningún equipo en la foto." }, { status: 200 });
    }

    const categoriasValidas = new Set<string>(CATEGORIA_EQUIPO_OPCIONES);

    return NextResponse.json({
      equipos: equipos
        .filter((e) => e && typeof e.texto === "string" && e.texto.trim())
        .map((e, i) => ({
          numero: Number.isFinite(e.numero) ? e.numero : i + 1,
          texto: String(e.texto).trim().slice(0, 120),
          categoriaEquipo: (categoriasValidas.has(e.categoriaEquipo) ? e.categoriaEquipo : "otro") as TorreComunicacionCategoriaEquipo,
          marcaModelo: typeof e.marcaModelo === "string" ? e.marcaModelo.trim().slice(0, 80) : "",
          alturaM: typeof e.alturaM === "string" ? e.alturaM.trim().slice(0, 20) : "",
          etiquetaYpf: typeof e.etiquetaYpf === "string" ? e.etiquetaYpf.trim().slice(0, 40) : "",
          identificado: e.identificado === true,
          consumoPromedioW: Number.isFinite(e.consumoPromedioW) && (e.consumoPromedioW as number) > 0 ? (e.consumoPromedioW as number) : null,
          consumoMaxW: Number.isFinite(e.consumoMaxW) && (e.consumoMaxW as number) > 0 ? (e.consumoMaxW as number) : null,
        })),
    });
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    await logDiagnostico(supabase, profile.id, `leer-foto: error contactando la API de Anthropic — ${detalle}`);
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "La clave de IA configurada no es válida — avisá a un Administrador." }, { status: 502 });
    }
    if (err instanceof Anthropic.PermissionDeniedError) {
      return NextResponse.json(
        { error: "La cuenta de IA no tiene permiso o crédito disponible para esta operación — avisá a un Administrador." },
        { status: 502 },
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "El servicio de IA está saturado en este momento — probá de nuevo en un minuto." }, { status: 502 });
    }
    if (err instanceof Anthropic.APIError && (err.status === 400 || err.status === 402) && /credit|billing|quota/i.test(detalle)) {
      return NextResponse.json(
        { error: "La cuenta de IA no tiene crédito disponible — avisá a un Administrador para recargarla." },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: "No se pudo contactar al servicio de IA." }, { status: 502 });
  }
}
