import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VEHICULO_EXTERIOR_FOTO_MAX } from "@/components/panel/vehiculos/alta-types";
import { registrarUsoIa } from "@/lib/ai/registrar-uso";
import { verificarLimiteIa } from "@/lib/ai/rate-limit";

/**
 * Control periódico de un vehículo: lee las fotos NUEVAS del exterior y las
 * compara contra la referencia más reciente que haya (las fotos del último
 * control que las tuvo, o si nunca hubo uno, las del alta) — a diferencia de
 * leer-exterior (que solo describe lo que ve), acá además le pide a la IA
 * que señale qué cambió de nuevo respecto de esa referencia. La referencia
 * se actualiza con cada control (no compara siempre contra el alta): un daño
 * ya registrado en un control anterior no se vuelve a marcar como "nuevo"
 * para siempre.
 */

interface ComparacionDetectada {
  estadoGeneral: string;
  tieneDanios: boolean | null;
  inconsistenciasDetectadas: string | null;
}

async function logDiagnostico(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, mensaje: string, extra?: string) {
  try {
    await supabase.from("client_errores").insert({
      user_id: userId,
      contexto: "comparar-estado-vehiculo-ia",
      mensaje: mensaje.slice(0, 2000),
      stack: extra ? extra.slice(0, 4000) : null,
    });
  } catch {
    // el diagnóstico es best-effort, nunca debe romper la respuesta real
  }
}

async function descargarComoBase64(
  supabase: Awaited<ReturnType<typeof createClient>>,
  paths: string[],
): Promise<{ base64: string; mediaType: "image/jpeg" }[]> {
  const resultados = await Promise.all(
    paths.map(async (path) => {
      const { data } = await supabase.storage.from("vehiculo-docs").download(path);
      if (!data) return null;
      const buffer = Buffer.from(await data.arrayBuffer());
      return { base64: buffer.toString("base64"), mediaType: "image/jpeg" as const };
    }),
  );
  return resultados.filter((r): r is { base64: string; mediaType: "image/jpeg" } => r !== null);
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile();
  const supabase = await createClient();

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "La lectura de fotos con IA no está configurada en este entorno (falta ANTHROPIC_API_KEY)." }, { status: 503 });
  }

  const limite = await verificarLimiteIa(supabase, profile.id);
  if (!limite.permitido) {
    return NextResponse.json({ error: limite.error }, { status: 429 });
  }

  const formData = await req.formData();
  const vehiculoId = formData.get("vehiculoId");
  if (typeof vehiculoId !== "string" || !vehiculoId) {
    return NextResponse.json({ error: "Falta el vehículo." }, { status: 400 });
  }
  const files = formData.getAll("fotos").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Falta al menos una foto del exterior." }, { status: 400 });
  }
  if (files.length > VEHICULO_EXTERIOR_FOTO_MAX) {
    return NextResponse.json({ error: `Máximo ${VEHICULO_EXTERIOR_FOTO_MAX} fotos por lectura.` }, { status: 400 });
  }

  const imagenesNuevas = await Promise.all(
    files.map(async (file) => ({
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      mediaType: (file.type === "image/png" ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg",
    })),
  );

  // Referencia: el último control que tenga fotos propias, o si nunca hubo
  // uno, las fotos del alta — nunca las dos cosas mezcladas con todo el
  // historial, siempre el estado "conocido" más reciente.
  const { data: ultimoControlConFotos } = await supabase
    .from("vehiculo_services")
    .select("fotos_exterior_urls")
    .eq("vehiculo_id", vehiculoId)
    .not("fotos_exterior_urls", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let pathsReferencia = ultimoControlConFotos?.fotos_exterior_urls ?? null;
  if (!pathsReferencia || pathsReferencia.length === 0) {
    const { data: vehiculo } = await supabase.from("catalogo_vehiculos").select("fotos_exterior_urls").eq("id", vehiculoId).single();
    pathsReferencia = vehiculo?.fotos_exterior_urls ?? null;
  }

  const imagenesReferencia = pathsReferencia && pathsReferencia.length > 0 ? await descargarComoBase64(supabase, pathsReferencia) : [];
  const tieneReferencia = imagenesReferencia.length > 0;

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      max_tokens: 1024,
      output_config: { effort: "high" },
      system:
        "Sos un asistente que ayuda a controlar periódicamente el estado de un vehículo de una flota de trabajo. Te paso dos grupos " +
        "de fotos del EXTERIOR del mismo vehículo: primero las de REFERENCIA (el último estado conocido, de un control anterior o del " +
        `alta), después las NUEVAS (el control de hoy).${tieneReferencia ? "" : " En este caso no hay fotos de referencia — son las primeras fotos de control que existen para este vehículo, así que no hay nada contra qué comparar."}\n\n` +
        'Completá:\n' +
        '- "estadoGeneral": descripción breve y concreta (1-2 oraciones) de lo que ves en las fotos NUEVAS — rayones, abolladuras, ' +
        'óxido, paragolpes rotos, ópticas dañadas, etc., con ubicación aproximada si se distingue. Si no ves daños, decilo ' +
        'explícitamente. Nunca lo dejes vacío.\n' +
        '- "tieneDanios": true si describiste algún daño visible, false si se ve en buen estado, null si las fotos no permiten evaluarlo.\n' +
        '- "inconsistenciasDetectadas": ' +
        (tieneReferencia
          ? 'comparando contra las fotos de REFERENCIA, describí específicamente qué es NUEVO o distinto (un daño que no estaba antes, ' +
            "algo roto/faltante que antes estaba bien) — string corto y concreto. Si el estado es equivalente al de referencia (mismos " +
            'daños de antes, nada nuevo), devolvé null. Nunca marques como "nuevo" algo que ya se ve en las fotos de referencia.'
          : 'siempre null — no hay fotos de referencia contra qué comparar en este control.') +
        '\n\nRespondé ÚNICAMENTE con un JSON válido: {"estadoGeneral": string, "tieneDanios": boolean | null, ' +
        '"inconsistenciasDetectadas": string | null}, sin texto antes ni después, sin bloque de código markdown.',
      messages: [
        {
          role: "user",
          content: [
            ...(tieneReferencia
              ? [
                  { type: "text" as const, text: "Fotos de REFERENCIA (estado anterior conocido):" },
                  ...imagenesReferencia.map((img) => ({
                    type: "image" as const,
                    source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
                  })),
                ]
              : []),
            { type: "text" as const, text: "Fotos NUEVAS (control de hoy):" },
            ...imagenesNuevas.map((img) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
            })),
          ],
        },
      ],
    });

    await registrarUsoIa(supabase, {
      endpoint: "vehiculos/comparar-estado",
      modulo: "vehiculos",
      modelo: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      userId: profile.id,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !textBlock) {
      await logDiagnostico(supabase, profile.id, `comparar-estado: stop_reason=${response.stop_reason}, sin bloque de texto utilizable`);
      return NextResponse.json({ error: "No se pudo leer las fotos." }, { status: 502 });
    }

    let detectado: Partial<ComparacionDetectada>;
    try {
      const match = textBlock.text.match(/\{[\s\S]*\}/);
      detectado = JSON.parse(match ? match[0] : textBlock.text);
    } catch {
      await logDiagnostico(supabase, profile.id, "comparar-estado: la respuesta no fue JSON parseable", textBlock.text);
      return NextResponse.json({ error: "La IA no devolvió datos reconocibles — probá con otra foto o cargá los datos a mano." }, { status: 502 });
    }

    return NextResponse.json({
      estadoGeneral: typeof detectado.estadoGeneral === "string" ? detectado.estadoGeneral.trim().slice(0, 500) : "",
      tieneDanios: detectado.tieneDanios === true ? true : detectado.tieneDanios === false ? false : null,
      inconsistenciasDetectadas:
        typeof detectado.inconsistenciasDetectadas === "string" && detectado.inconsistenciasDetectadas.trim()
          ? detectado.inconsistenciasDetectadas.trim().slice(0, 400)
          : null,
      tieneReferencia,
    });
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    await logDiagnostico(supabase, profile.id, `comparar-estado: error contactando la API de Anthropic — ${detalle}`);
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
