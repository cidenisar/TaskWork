import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VEHICULO_EXTERIOR_FOTO_MAX } from "@/components/panel/vehiculos/alta-types";

/**
 * Lee fotos del EXTERIOR de un vehículo (patente, marca/modelo, estado
 * general) para precargar el formulario de alta — el Admin revisa y
 * corrige antes de guardar, la IA nunca escribe directo a la base. Mismo
 * criterio de siempre con datos que exigen precisión (la patente, acá):
 * si no se lee con total claridad, se devuelve vacío en vez de adivinar.
 */

interface ExteriorDetectado {
  patente: string;
  marcaModelo: string;
  estadoGeneral: string;
  tieneDanios: boolean | null;
  identificadoPatente: boolean;
  identificadoMarca: boolean;
}

async function logDiagnostico(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, mensaje: string, extra?: string) {
  try {
    await supabase.from("client_errores").insert({
      user_id: userId,
      contexto: "leer-exterior-vehiculo-ia",
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
  if (files.length > VEHICULO_EXTERIOR_FOTO_MAX) {
    return NextResponse.json({ error: `Máximo ${VEHICULO_EXTERIOR_FOTO_MAX} fotos por lectura.` }, { status: 400 });
  }

  const imagenes = await Promise.all(
    files.map(async (file) => ({
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      mediaType: (file.type === "image/png" ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg",
    })),
  );

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      output_config: { effort: "high" },
      system:
        "Sos un asistente que ayuda a dar de alta un vehículo de una flota de trabajo a partir de fotos del EXTERIOR " +
        "(patente, carrocería, uno o más ángulos) sacadas por un Administrador. Te puedo pasar varias fotos del mismo vehículo desde " +
        "distintos ángulos — combinalas en una sola respuesta, no inventes vehículos adicionales.\n\n" +
        "Completá estos campos:\n" +
        '- "patente": la patente EXACTAMENTE como se lee en la chapa, en mayúsculas y sin espacios (formato viejo argentino ' +
        'ej. "ABC123", o formato Mercosur ej. "AB123CD"). Esto es crítico: si la chapa está borrosa, en un ángulo imposible de leer, o ' +
        'no estás 100% seguro de cada caracter, devolvé cadena vacía "" — NUNCA inventes o completés un caracter que no podés leer con ' +
        "certeza, una patente mal leída es peor que una vacía.\n" +
        '- "identificadoPatente": true solo si "patente" viene de una lectura clara y completa de la chapa, false en cualquier otro caso ' +
        "(incluido cuando la dejaste vacía).\n" +
        '- "marcaModelo": marca y modelo del vehículo si los reconocés por la forma/logo/insignias visibles (ej. "Toyota Hilux", ' +
        '"Volkswagen Amarok"). Cadena vacía "" si no estás razonablemente seguro — no adivines por el tipo de carrocería solo.\n' +
        '- "identificadoMarca": true solo si estás razonablemente seguro de "marcaModelo", false si no.\n' +
        '- "estadoGeneral": una descripción breve y concreta (1-2 oraciones) de lo que ves del estado de la carrocería — rayones, ' +
        "abolladuras, óxido, paragolpes rotos o sueltos, faros/ópticas dañados, etc., con su ubicación aproximada si se distingue (ej. " +
        '"Rayón leve en la puerta trasera derecha, resto de la carrocería sin daños visibles"). Si no ves ningún daño, decilo ' +
        'explícitamente (ej. "Sin daños visibles, buen estado general"). Nunca lo dejes vacío — siempre hay algo que describir sobre lo ' +
        "que se ve.\n" +
        '- "tieneDanios": true si describiste algún rayón/abolladura/rotura/daño visible en "estadoGeneral", false si el vehículo se ve ' +
        "en buen estado sin daños visibles, null solo si la foto no muestra la carrocería lo suficientemente clara como para evaluarlo.\n\n" +
        'Respondé ÚNICAMENTE con un JSON válido: un objeto {"patente": string, "marcaModelo": string, "estadoGeneral": string, ' +
        '"tieneDanios": boolean | null, "identificadoPatente": boolean, "identificadoMarca": boolean}, sin texto antes ni después, sin ' +
        "bloque de código markdown.",
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
                  ? `Identificame patente, marca/modelo y estado general de este vehículo combinando estas ${imagenes.length} fotos.`
                  : "Identificame patente, marca/modelo y estado general de este vehículo.",
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !textBlock) {
      await logDiagnostico(supabase, profile.id, `leer-exterior: stop_reason=${response.stop_reason}, sin bloque de texto utilizable`);
      return NextResponse.json({ error: "No se pudo leer la foto." }, { status: 502 });
    }

    let detectado: ExteriorDetectado;
    try {
      const match = textBlock.text.match(/\{[\s\S]*\}/);
      detectado = JSON.parse(match ? match[0] : textBlock.text);
    } catch {
      await logDiagnostico(supabase, profile.id, "leer-exterior: la respuesta no fue JSON parseable", textBlock.text);
      return NextResponse.json({ error: "La IA no devolvió datos reconocibles — probá con otra foto o cargá los datos a mano." }, { status: 502 });
    }

    return NextResponse.json({
      patente: typeof detectado.patente === "string" ? detectado.patente.trim().toUpperCase().slice(0, 12) : "",
      marcaModelo: typeof detectado.marcaModelo === "string" ? detectado.marcaModelo.trim().slice(0, 80) : "",
      estadoGeneral: typeof detectado.estadoGeneral === "string" ? detectado.estadoGeneral.trim().slice(0, 500) : "",
      tieneDanios: detectado.tieneDanios === true ? true : detectado.tieneDanios === false ? false : null,
      identificadoPatente: detectado.identificadoPatente === true,
      identificadoMarca: detectado.identificadoMarca === true,
    });
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    await logDiagnostico(supabase, profile.id, `leer-exterior: error contactando la API de Anthropic — ${detalle}`);
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
