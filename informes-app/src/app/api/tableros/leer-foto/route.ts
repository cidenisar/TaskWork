import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  CATEGORIA_EQUIPO_OPCIONES,
  CATEGORIA_EQUIPO_LABEL,
  TIPO_CIRCUITO_OPCIONES,
  TIPO_CIRCUITO_LABEL,
  TABLERO_TIPO_LABEL,
  TABLERO_FOTO_IA_MAX,
} from "@/components/tableros/types";
import type { TableroCategoriaEquipo, TableroTipo, TableroTipoCircuito } from "@/lib/database.types";

/** Solo térmicas/disyuntores tienen una palanca cuya posición física dice el estado. */
const CATEGORIAS_CON_PALANCA: TableroCategoriaEquipo[] = ["termica", "disyuntor"];
const ESTADOS_PALANCA = ["Cerrado", "Abierto", "Disparado"] as const;

/**
 * Lee hasta TABLERO_FOTO_IA_MAX fotos del tablero con Claude Vision (en un
 * solo pedido, todas juntas) y devuelve una lista combinada de
 * circuitos/elementos (número, texto, amperaje si es legible, categoría de
 * equipamiento y tipo de circuito) para precargar el formulario — el
 * técnico revisa y corrige antes de guardar, la IA nunca escribe directo a
 * la base. Varias fotos del mismo tablero (ángulos distintos, o secciones
 * de un tablero grande, o un close-up de una etiqueta ilegible en la foto
 * general) ayudan a identificar mejor el equipamiento — se le pide al
 * modelo que las combine en una sola lista sin duplicar un elemento que
 * aparezca en más de una foto. Un tablero puede ser mixto (energía + CCTV +
 * control de acceso en el mismo gabinete), así que la clasificación es
 * universal: cualquier elemento puede aparecer en cualquier foto, no se
 * restringe por tipo.
 */

interface CircuitoDetectado {
  numero: number;
  texto: string;
  ampNominal: string;
  categoriaEquipo: TableroCategoriaEquipo;
  tipoCircuito: TableroTipoCircuito;
  identificado: boolean;
  estadoDetectado: string | null;
}

const CATEGORIAS_TEXTO = CATEGORIA_EQUIPO_OPCIONES.map((c) => `"${c}" (${CATEGORIA_EQUIPO_LABEL[c]})`).join(", ");
const TIPOS_CIRCUITO_TEXTO = TIPO_CIRCUITO_OPCIONES.map((t) => `"${t}" (${TIPO_CIRCUITO_LABEL[t]})`).join(", ");

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
      contexto: "leer-foto-tablero-ia",
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
  const subsistemasParam = (formData.get("subsistemas") as string | null) ?? "";
  const subsistemas = subsistemasParam
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is TableroTipo => s === "energia" || s === "cctv" || s === "control_acceso");
  if (files.length === 0) {
    return NextResponse.json({ error: "Falta al menos una foto." }, { status: 400 });
  }
  if (files.length > TABLERO_FOTO_IA_MAX) {
    return NextResponse.json({ error: `Máximo ${TABLERO_FOTO_IA_MAX} fotos por lectura.` }, { status: 400 });
  }

  const imagenes = await Promise.all(
    files.map(async (file) => ({
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      mediaType: (file.type === "image/png" ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg",
    })),
  );

  const contextoSubsistemas =
    subsistemas.length > 0
      ? ` Este tablero en particular tiene relevado: ${subsistemas.map((s) => TABLERO_TIPO_LABEL[s]).join(", ")} — pero puede ser mixto, así que igual clasificá cada elemento por lo que ves, no asumas que todo pertenece a esos subsistemas.`
      : "";
  const contextoFotos =
    imagenes.length > 1
      ? ` Te paso ${imagenes.length} fotos del MISMO tablero (pueden ser ángulos distintos, secciones distintas de un tablero grande, o un ` +
        "close-up de una etiqueta que en otra foto se ve borrosa) — combinalas en una sola lista de circuitos/elementos: si el mismo " +
        "elemento físico aparece en más de una foto, contalo una sola vez (usá la foto donde se vea más claro para completar texto/" +
        "amperaje/categoría), y numerá de forma correlativa el conjunto combinado, no cada foto por separado."
      : "";

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 8192,
      output_config: { effort: "medium" },
      system:
        "Sos un asistente que ayuda a un técnico de campo a relevar un tablero eléctrico, que puede ser mixto: interruptores/térmicas " +
        "de energía, fuentes/UPS/baterías/conversores, y también elementos de CCTV o control de acceso (cámaras, lectoras, cerraduras) " +
        `conviviendo en el mismo gabinete.${contextoSubsistemas}${contextoFotos}\n\n` +
        "Listá cada circuito/elemento identificable, en el orden en que aparecen físicamente (de arriba hacia abajo y de izquierda a " +
        "derecha). Devolvé SIEMPRE al menos los elementos que puedas distinguir, aunque no tengan etiqueta — describilos por su aspecto " +
        "en vez de omitirlos; solo dejá la lista vacía si la foto no muestra ningún tablero o elemento reconocible.\n\n" +
        "Para cada elemento completá estos campos:\n" +
        '- "numero": posición secuencial empezando en 1.\n' +
        '- "texto": la etiqueta tal cual la leés si hay una legible (impresa, escrita a mano o en cinta). Si NO hay ninguna etiqueta ' +
        "legible, este campo es OBLIGATORIO igual: describí el elemento por lo que ves físicamente (cantidad de polos, grosor/color de " +
        "cable, contactor/temporizador/fotocélula al lado, tipo de cámara/lectora, cantidad de conectores, etc.). Nunca lo dejes vacío, y " +
        'nunca inventes un nombre de circuito específico (tipo "Cocina") si no hay ninguna base visual para eso.\n' +
        '- "identificado": true si "texto" viene de una etiqueta legible, false si es tu descripción visual.\n' +
        '- "ampNominal": el amperaje impreso en el interruptor si es legible (ej. "32A"). Cadena vacía "" si no se ve o no aplica.\n' +
        `- "categoriaEquipo": EXACTAMENTE una de estas cadenas, la que mejor describa el elemento por su forma/función: ${CATEGORIAS_TEXTO}. ` +
        'Usá "otro" solo si de verdad no encaja en ninguna.\n' +
        `- "tipoCircuito": EXACTAMENTE una de estas cadenas: ${TIPOS_CIRCUITO_TEXTO}. Para térmicas/disyuntores inferí mono/trifásico por ` +
        "la cantidad de polos y el grosor de cable si no hay etiqueta. Para fuentes/UPS/baterías/conversores usá el voltaje de salida si " +
        'es identificable (ej. un conversor a 12V es "12vdc"). Para cámaras/lectoras/cerraduras/bornera/otros sin tensión relevante, usá "na".\n' +
        '- "estadoDetectado": SOLO tiene sentido cuando "categoriaEquipo" es "termica" o "disyuntor". REGLA FIJA sobre la posición física ' +
        "de la palanca/llave del interruptor (mirá SOLO hacia dónde apunta la palanca, no razones sobre si el circuito \"debería\" estar " +
        'energizado): palanca hacia ARRIBA → "Cerrado". Palanca hacia ABAJO → "Abierto". Palanca en una posición intermedia entre arriba y ' +
        'abajo, o el interruptor muestra una marca/bandera/ventana de color (normalmente roja) indicando que saltó → "Disparado". Si no se ' +
        've la palanca con claridad (ángulo, obstruida, foto borrosa) → null (nunca inventes el estado). Para cualquier otra ' +
        "categoriaEquipo, estadoDetectado siempre null.\n\n" +
        "No inventes elementos que no estén en la foto, y no adivines un amperaje, tensión o estado que no puedas justificar por lo que " +
        'ves — pero "texto" y "categoriaEquipo" son obligatorios en todos los casos, con tu mejor estimación visual si hace falta.\n\n' +
        'Respondé ÚNICAMENTE con un JSON válido: un array de objetos {"numero": number, "texto": string, "ampNominal": string, ' +
        '"categoriaEquipo": string, "tipoCircuito": string, "identificado": boolean, "estadoDetectado": string | null}, sin texto antes ' +
        "ni después, sin bloque de código markdown.",
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
                  ? `Listame los circuitos/elementos combinando estas ${imagenes.length} fotos del mismo tablero.`
                  : "Listame los circuitos/elementos de esta foto.",
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

    let circuitos: CircuitoDetectado[];
    try {
      const match = textBlock.text.match(/\[[\s\S]*\]/);
      circuitos = JSON.parse(match ? match[0] : textBlock.text);
    } catch {
      await logDiagnostico(supabase, profile.id, "leer-foto: la respuesta no fue JSON parseable", textBlock.text);
      return NextResponse.json({ error: "La IA no devolvió una lista reconocible — probá con otra foto o cargá los circuitos a mano." }, { status: 502 });
    }
    if (!Array.isArray(circuitos) || circuitos.length === 0) {
      await logDiagnostico(supabase, profile.id, "leer-foto: la IA devolvió una lista vacía", textBlock.text);
      return NextResponse.json({ error: "No se detectó ningún circuito/elemento en la foto." }, { status: 200 });
    }

    const categoriasValidas = new Set<string>(CATEGORIA_EQUIPO_OPCIONES);
    const tiposCircuitoValidos = new Set<string>(TIPO_CIRCUITO_OPCIONES);
    const estadosPalancaValidos = new Set<string>(ESTADOS_PALANCA);

    return NextResponse.json({
      circuitos: circuitos
        .filter((c) => c && typeof c.texto === "string" && c.texto.trim())
        .map((c, i) => {
          const categoriaEquipo = (categoriasValidas.has(c.categoriaEquipo) ? c.categoriaEquipo : "otro") as TableroCategoriaEquipo;
          const estadoDetectado =
            CATEGORIAS_CON_PALANCA.includes(categoriaEquipo) && typeof c.estadoDetectado === "string" && estadosPalancaValidos.has(c.estadoDetectado)
              ? c.estadoDetectado
              : null;
          return {
            numero: Number.isFinite(c.numero) ? c.numero : i + 1,
            texto: String(c.texto).trim().slice(0, 120),
            ampNominal: typeof c.ampNominal === "string" ? c.ampNominal.trim().slice(0, 20) : "",
            categoriaEquipo,
            tipoCircuito: (tiposCircuitoValidos.has(c.tipoCircuito) ? c.tipoCircuito : "na") as TableroTipoCircuito,
            identificado: c.identificado === true,
            estadoDetectado,
          };
        }),
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
