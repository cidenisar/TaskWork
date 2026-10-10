import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CATEGORIA_EQUIPO_OPCIONES, CATEGORIA_EQUIPO_LABEL } from "@/components/equipos/types";
import { ENTREGA_FOTO_IA_MAX } from "@/components/deposito/types";
import type { EquipoCategoria } from "@/lib/database.types";

/**
 * Lee hasta ENTREGA_FOTO_IA_MAX fotos de material/equipo que se entrega a
 * depósito (mismas categorías que ya usa Equipos Individuales — es el
 * mismo universo de cosas, solo que acá puede no estar registrado como
 * equipamiento de ningún sitio) y devuelve una lista combinada para
 * precargar "Nueva Entrega" — el técnico revisa y corrige antes de
 * guardar, la IA nunca escribe directo a la base. Igual criterio que
 * leer-foto de Equipos Individuales: las fotos pueden ser de materiales
 * DISTINTOS (varias cosas devueltas de la misma visita) o de ángulos
 * distintos del MISMO material — se le pide al modelo que identifique cada
 * material físico distinto sin duplicarlo si aparece en más de una foto.
 * A diferencia de Equipos Individuales, nunca se pide cantidad ni consumo:
 * la cantidad siempre se completa a mano (puede ser "3 conectores" de una
 * sola foto) y el consumo no aplica a algo que está en depósito, no
 * instalado.
 */

interface ItemDetectado {
  descripcion: string;
  categoriaEquipo: EquipoCategoria;
  marcaModelo: string;
  numeroSerie: string;
  etiquetaYpf: string;
  identificado: boolean;
}

const CATEGORIAS_TEXTO = CATEGORIA_EQUIPO_OPCIONES.map((c) => `"${c}" (${CATEGORIA_EQUIPO_LABEL[c]})`).join(", ");

/** Mismo criterio que leer-foto-equipo-ia: deja registro en Configuración → Errores del dispositivo, nunca corta la respuesta. */
async function logDiagnostico(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  mensaje: string,
  extra?: string,
) {
  try {
    await supabase.from("client_errores").insert({
      user_id: userId,
      contexto: "leer-foto-entrega-deposito-ia",
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
  if (files.length > ENTREGA_FOTO_IA_MAX) {
    return NextResponse.json({ error: `Máximo ${ENTREGA_FOTO_IA_MAX} fotos por lectura.` }, { status: 400 });
  }

  const imagenes = await Promise.all(
    files.map(async (file) => ({
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      mediaType: (file.type === "image/png" ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg",
    })),
  );

  const contextoFotos =
    imagenes.length > 1
      ? ` Te paso ${imagenes.length} fotos — pueden ser de materiales/equipos DISTINTOS devueltos en la misma visita (ej. una UPS y ` +
        "unos conectores sueltos), o de ángulos distintos del MISMO material (ej. una foto de la chapa/etiqueta de serie y otra del " +
        "equipo entero) — identificá cada material físico distinto sin duplicarlo si aparece en más de una foto (usá la foto donde se " +
        "vea más claro para completar descripción/marca/serie)."
      : "";

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 8192,
      output_config: { effort: "medium" },
      system:
        "Sos un asistente que ayuda a un técnico a registrar la entrega a depósito de material/equipo — puede ser algo nuevo sin " +
        "usar (sobrante de una obra) o usado pero todavía funcional (se reemplazó por otro, o vuelve de mantenimiento). No está " +
        `instalado en ningún sitio, está físicamente en el depósito o a punto de entrar.${contextoFotos}\n\n` +
        "Identificá cada material/equipo físico distinto que puedas ver. Si hay varias unidades IDÉNTICAS (ej. varios conectores " +
        "sueltos iguales), describilas como UN solo ítem — nunca repitas el mismo ítem ni le pongas una cantidad, eso lo completa el " +
        "técnico a mano. Devolvé SIEMPRE los materiales que puedas distinguir, aunque no tengan etiqueta — describilos por su aspecto " +
        "en vez de omitirlos; solo dejá la lista vacía si la foto no muestra ningún material reconocible.\n\n" +
        "Para cada material completá estos campos:\n" +
        `- "categoriaEquipo": EXACTAMENTE una de estas cadenas, la que mejor describa qué es: ${CATEGORIAS_TEXTO}. Usá "otro" solo si ` +
        "de verdad no encaja en ninguna.\n" +
        '- "descripcion": qué es, en pocas palabras — usá la etiqueta/nombre si hay uno legible (impreso, escrito a mano o en cinta), ' +
        'NUNCA el número de una etiqueta de inventario de YPF (va aparte en "etiquetaYpf"). Si no hay etiqueta legible, describilo ' +
        "por lo que ves físicamente (tipo, tamaño, color, cantidad de puertos/indicadores, etc.) — este campo es obligatorio siempre, " +
        "con tu mejor estimación visual si hace falta, pero nunca inventes un nombre específico que no puedas justificar por lo que " +
        "ves.\n" +
        '- "identificado": true si "descripcion" viene de una etiqueta legible, false si es tu descripción visual.\n' +
        '- "marcaModelo": marca y/o modelo impreso o en una chapa si es legible. Cadena vacía "" si no se ve o no es legible — no ' +
        "inventes ni adivines.\n" +
        '- "numeroSerie": el número de serie del FABRICANTE si se ve en una chapa/etiqueta. Cadena vacía "" si no es legible — no ' +
        "inventes ni adivines.\n" +
        '- "etiquetaYpf": el número de una etiqueta/chapa de INVENTARIO DE YPF si hay una pegada (sticker o chapa con código numérico ' +
        'propio de la empresa, distinta de la chapa de serie del fabricante). Cadena vacía "" si no hay una así, o no es legible — ' +
        "no la confundas con numeroSerie ni con marcaModelo.\n\n" +
        "No inventes un material que no esté en las fotos, y no adivines marca/modelo/serie/etiqueta que no puedas justificar por " +
        'lo que ves — pero "descripcion" y "categoriaEquipo" son obligatorios siempre, con tu mejor estimación visual si hace ' +
        "falta.\n\n" +
        'Respondé ÚNICAMENTE con un JSON válido: un array de objetos {"descripcion": string, "categoriaEquipo": string, ' +
        '"marcaModelo": string, "numeroSerie": string, "etiquetaYpf": string, "identificado": boolean}, sin texto antes ni después, ' +
        "sin bloque de código markdown.",
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
                  ? `Identificame los materiales/equipos combinando estas ${imagenes.length} fotos.`
                  : "Identificame el material/equipo de esta foto.",
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

    let items: ItemDetectado[];
    try {
      const match = textBlock.text.match(/\[[\s\S]*\]/);
      items = JSON.parse(match ? match[0] : textBlock.text);
    } catch {
      await logDiagnostico(supabase, profile.id, "leer-foto: la respuesta no fue JSON parseable", textBlock.text);
      return NextResponse.json({ error: "La IA no devolvió una lista reconocible — probá con otra foto o cargá el material a mano." }, { status: 502 });
    }
    if (!Array.isArray(items) || items.length === 0) {
      await logDiagnostico(supabase, profile.id, "leer-foto: la IA devolvió una lista vacía", textBlock.text);
      return NextResponse.json({ error: "No se detectó ningún material/equipo en la foto." }, { status: 200 });
    }

    const categoriasValidas = new Set<string>(CATEGORIA_EQUIPO_OPCIONES);

    return NextResponse.json({
      items: items
        .filter((it) => it && typeof it.descripcion === "string" && it.descripcion.trim())
        .map((it) => ({
          descripcion: String(it.descripcion).trim().slice(0, 120),
          categoriaLabel: CATEGORIA_EQUIPO_LABEL[categoriasValidas.has(it.categoriaEquipo) ? it.categoriaEquipo : "otro"],
          marcaModelo: typeof it.marcaModelo === "string" ? it.marcaModelo.trim().slice(0, 80) : "",
          numeroSerie: typeof it.numeroSerie === "string" ? it.numeroSerie.trim().slice(0, 60) : "",
          etiquetaYpf: typeof it.etiquetaYpf === "string" ? it.etiquetaYpf.trim().slice(0, 40) : "",
          identificado: it.identificado === true,
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
