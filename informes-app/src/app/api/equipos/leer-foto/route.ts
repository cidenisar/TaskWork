import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIA_EQUIPO_OPCIONES, CATEGORIA_EQUIPO_LABEL, EQUIPO_FOTO_IA_MAX } from "@/components/equipos/types";
import type { EquipoCategoria } from "@/lib/database.types";

/**
 * Lee hasta EQUIPO_FOTO_IA_MAX fotos de equipamiento suelto (no dentro de un
 * rack ni de un tablero: UPS standalone, cámaras, control de acceso, etc.)
 * con Claude Vision y devuelve una lista combinada (categoría identificada
 * por la IA, etiqueta/nombre, marca/modelo y número de serie si son
 * legibles) para precargar el formulario — el técnico revisa y corrige
 * antes de guardar, la IA nunca escribe directo a la base. A diferencia de
 * Racks, las fotos acá pueden ser de equipos DISTINTOS (varios aparatos
 * sueltos relevados en la misma visita) o de ángulos distintos del mismo
 * equipo (ej. chapa de serie + vista general) — se le pide al modelo que
 * identifique cada equipo físico distinto sin duplicarlo si aparece en más
 * de una foto.
 */

interface EquipoDetectado {
  texto: string;
  categoriaEquipo: EquipoCategoria;
  marcaModelo: string;
  numeroSerie: string;
  identificado: boolean;
}

const CATEGORIAS_TEXTO = CATEGORIA_EQUIPO_OPCIONES.map((c) => `"${c}" (${CATEGORIA_EQUIPO_LABEL[c]})`).join(", ");

/**
 * Deja un registro en Configuración → Errores del dispositivo cuando la IA
 * no devuelve algo utilizable (lista vacía, JSON no parseable, error de la
 * API) — sin esto, un fallo acá era invisible para el equipo salvo que el
 * técnico lo reportara a mano. Nunca debe cortar la respuesta al usuario.
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
      contexto: "leer-foto-equipo-ia",
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
  if (files.length > EQUIPO_FOTO_IA_MAX) {
    return NextResponse.json({ error: `Máximo ${EQUIPO_FOTO_IA_MAX} fotos por lectura.` }, { status: 400 });
  }

  const imagenes = await Promise.all(
    files.map(async (file) => ({
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      mediaType: (file.type === "image/png" ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg",
    })),
  );

  const contextoFotos =
    imagenes.length > 1
      ? ` Te paso ${imagenes.length} fotos — pueden ser de equipos DISTINTOS relevados en la misma visita (ej. un UPS y un par de ` +
        "cámaras), o de ángulos distintos del MISMO equipo (ej. una foto de la chapa/etiqueta de serie y otra del equipo entero) — " +
        "identificá cada equipo físico distinto sin duplicarlo si aparece en más de una foto (usá la foto donde se vea más claro para " +
        "completar texto/marca/serie)."
      : "";

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 8192,
      output_config: { effort: "medium" },
      system:
        "Sos un asistente que ayuda a un técnico de campo a relevar equipamiento suelto en un sitio — equipos que NO están montados " +
        "dentro de un rack ni de un tablero eléctrico: UPS standalone con sus bancos de batería, cámaras de CCTV, equipos de control de " +
        `acceso, impresoras, telefonía, climatización, etc.${contextoFotos}\n\n` +
        "Identificá cada equipo físico distinto que puedas ver. Devolvé SIEMPRE los equipos que puedas distinguir, aunque no tengan " +
        "etiqueta — describilos por su aspecto en vez de omitirlos; solo dejá la lista vacía si la foto no muestra ningún equipo " +
        "reconocible.\n\n" +
        "Para cada equipo completá estos campos:\n" +
        `- "categoriaEquipo": EXACTAMENTE una de estas cadenas, la que mejor describa qué es el equipo: ${CATEGORIAS_TEXTO}. Usá "otro" ` +
        "solo si de verdad no encaja en ninguna — este es el campo más importante: tu trabajo principal es identificar QUÉ ES el equipo.\n" +
        '- "texto": la etiqueta/nombre tal cual se lee si hay uno legible (impreso en el frente, escrito a mano o en cinta). Si NO hay ' +
        "ninguna etiqueta legible, este campo es OBLIGATORIO igual: describí el equipo por lo que ves físicamente (tipo de gabinete, " +
        'tamaño, color, cantidad de indicadores, etc.). Nunca lo dejes vacío, y nunca inventes un nombre específico que no puedas ' +
        'justificar por lo que ves.\n' +
        '- "identificado": true si "texto" viene de una etiqueta legible, false si es tu descripción visual.\n' +
        '- "marcaModelo": marca y/o modelo impreso en el frente o en la chapa del equipo si es legible (ej. "APC Smart-UPS 3000VA", ' +
        '"Hikvision DS-2CD2143G0"). Cadena vacía "" si no se ve o no es legible — no inventes ni adivines una marca/modelo que no ' +
        'puedas leer.\n' +
        '- "numeroSerie": el número de serie si se ve en una chapa/etiqueta (buscalo especialmente en UPS y bancos de batería, suele ' +
        'estar en una chapa metálica o etiqueta blanca en el costado/parte de atrás). Cadena vacía "" si no es legible — no inventes ni ' +
        "adivines un número de serie que no puedas leer con certeza.\n\n" +
        "No inventes equipos que no estén en la foto, y no adivines una marca/modelo/serie que no puedas justificar por lo que ves — " +
        'pero "texto" y "categoriaEquipo" son obligatorios en todos los casos, con tu mejor estimación visual si hace falta.\n\n' +
        'Respondé ÚNICAMENTE con un JSON válido: un array de objetos {"texto": string, "categoriaEquipo": string, "marcaModelo": ' +
        'string, "numeroSerie": string, "identificado": boolean}, sin texto antes ni después, sin bloque de código markdown.',
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
                  ? `Identificame el equipamiento combinando estas ${imagenes.length} fotos.`
                  : "Identificame el equipo de esta foto.",
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
      return NextResponse.json({ error: "La IA no devolvió una lista reconocible — probá con otra foto o cargá el equipo a mano." }, { status: 502 });
    }
    if (!Array.isArray(equipos) || equipos.length === 0) {
      await logDiagnostico(supabase, profile.id, "leer-foto: la IA devolvió una lista vacía", textBlock.text);
      return NextResponse.json({ error: "No se detectó ningún equipo en la foto." }, { status: 200 });
    }

    const categoriasValidas = new Set<string>(CATEGORIA_EQUIPO_OPCIONES);

    return NextResponse.json({
      equipos: equipos
        .filter((e) => e && typeof e.texto === "string" && e.texto.trim())
        .map((e) => ({
          texto: String(e.texto).trim().slice(0, 120),
          categoriaEquipo: (categoriasValidas.has(e.categoriaEquipo) ? e.categoriaEquipo : "otro") as EquipoCategoria,
          marcaModelo: typeof e.marcaModelo === "string" ? e.marcaModelo.trim().slice(0, 80) : "",
          numeroSerie: typeof e.numeroSerie === "string" ? e.numeroSerie.trim().slice(0, 60) : "",
          identificado: e.identificado === true,
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
