import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
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

export async function POST(req: NextRequest) {
  await requireProfile();

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
      max_tokens: 3072,
      output_config: { effort: "low" },
      system:
        "Sos un asistente que ayuda a un técnico de campo a relevar un tablero eléctrico, que puede ser mixto: interruptores/térmicas " +
        "de energía, fuentes/UPS/baterías/conversores, y también elementos de CCTV o control de acceso (cámaras, lectoras, cerraduras) " +
        `conviviendo en el mismo gabinete.${contextoSubsistemas}${contextoFotos} Tenés que listar cada circuito/elemento identificable, ` +
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
        'cerraduras/bornera/otros que no tengan una tensión relevante para medir, usá "na"); "estadoDetectado" (SOLO cuando ' +
        '"categoriaEquipo" es "termica" o "disyuntor": mirá la posición física de la palanca/llave del interruptor — si está hacia ' +
        'arriba/en la posición ON encendida, "Cerrado"; si está hacia abajo/en la posición OFF apagada, "Abierto"; si está en una ' +
        "posición intermedia entre ON y OFF, o el interruptor tiene alguna marca/bandera/ventana de color (normalmente roja) que indique " +
        'que saltó, "Disparado"; si la palanca no se ve con claridad (ángulo, obstruida, foto borrosa) o no estás seguro, null — nunca ' +
        'inventes el estado. Para cualquier otra categoriaEquipo, "estadoDetectado" siempre null: el aspecto de una cámara/lectora/fuente/ ' +
        "UPS/etc. no dice de forma confiable si está funcionando). No inventes elementos que no estén en la foto, y no adivines un " +
        "amperaje, tensión o estado que no puedas justificar por lo que ves. " +
        'Respondé ÚNICAMENTE con un JSON válido: un array de objetos {"numero": number, "texto": string, "ampNominal": string, ' +
        '"categoriaEquipo": string, "tipoCircuito": string, "identificado": boolean, "estadoDetectado": string | null}, sin texto antes ' +
        "ni después.",
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
  } catch {
    return NextResponse.json({ error: "No se pudo contactar al servicio de IA." }, { status: 502 });
  }
}
