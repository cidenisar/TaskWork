import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { crearMensajeIa, hayAlgunaIaConfigurada, mensajeErrorIa } from "@/lib/ai/motor";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TICKETS_FOTO_MAX } from "@/components/rendicion-gastos/types";
import { verificarLimiteIa } from "@/lib/ai/rate-limit";

/**
 * Lee hasta TICKETS_FOTO_MAX fotos de tickets/comprobantes en una sola
 * llamada a la IA — a diferencia de leer-remito (varias fotos del MISMO
 * documento, combinadas en una lista), acá CADA foto es un gasto DISTINTO:
 * la IA devuelve un objeto por foto, en el mismo orden, para que el
 * frontend pueda emparejar cada resultado con su foto original (que va a
 * terminar como comprobante de ese gasto). El técnico siempre revisa y
 * corrige cada borrador antes de confirmarlo — la IA nunca carga un gasto
 * directo.
 */

interface GastoDetectado {
  fecha: string | null;
  monto: number | null;
  categoria: string | null;
  descripcion: string | null;
}

async function logDiagnostico(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, mensaje: string, extra?: string) {
  try {
    await supabase.from("client_errores").insert({
      user_id: userId,
      contexto: "leer-tickets-rendicion-gastos-ia",
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

  if (!hayAlgunaIaConfigurada()) {
    return NextResponse.json({ error: "La lectura de fotos con IA no está configurada en este entorno (falta la clave de alguna IA)." }, { status: 503 });
  }

  const limite = await verificarLimiteIa(supabase, profile.id);
  if (!limite.permitido) {
    return NextResponse.json({ error: limite.error }, { status: 429 });
  }

  const formData = await req.formData();
  const files = formData.getAll("fotos").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Falta al menos una foto de ticket." }, { status: 400 });
  }
  if (files.length > TICKETS_FOTO_MAX) {
    return NextResponse.json({ error: `Máximo ${TICKETS_FOTO_MAX} fotos por lectura.` }, { status: 400 });
  }

  const imagenes = await Promise.all(
    files.map(async (file) => ({
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
      mediaType: (file.type === "image/png" ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg",
    })),
  );

  const [{ data: categoriasRows }, { data: instruccionesRows }] = await Promise.all([
    supabase.from("catalogo_categorias_gasto").select("nombre").order("nombre"),
    supabase.from("catalogo_lectura_gastos_ia").select("texto").order("orden"),
  ]);
  const categorias = (categoriasRows ?? []).map((c) => c.nombre);
  const instrucciones = (instruccionesRows ?? []).map((i) => i.texto);

  const instruccionCategorias =
    categorias.length > 0
      ? ` Para "categoria", preferí usar alguna de estas categorías ya existentes si aplica: ${categorias.join(", ")}. Si ninguna ` +
        "aplica bien a este ticket, proponé una categoría nueva corta y clara (2-3 palabras)."
      : ' Para "categoria", proponé una categoría corta y clara (2-3 palabras) según el tipo de gasto (ej. "Combustible", "Peajes", "Comida").';

  const instruccionExtra =
    instrucciones.length > 0
      ? "\n\nADEMÁS, seguí estas instrucciones configuradas por un Administrador para esta lectura:\n" +
        instrucciones.map((t) => `- ${t}`).join("\n")
      : "";

  try {
    const response = await crearMensajeIa(supabase, { endpoint: "rendicion-gastos/leer-tickets", modulo: "rendicion-gastos", userId: profile.id }, {
      model: "claude-opus-5-5",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      max_tokens: 4096,
      output_config: { effort: "medium" },
      system:
        "Sos un asistente que ayuda a un empleado a cargar una rendición de gastos a partir de fotos de tickets/comprobantes " +
        `(de compra, peaje, combustible, restaurante, etc.). Te paso ${imagenes.length} foto${imagenes.length === 1 ? "" : "s"}, y CADA ` +
        "UNA es un ticket DISTINTO (no son páginas del mismo documento, como en la lectura de remitos) — nunca combines datos de dos " +
        "fotos en un mismo gasto.\n\n" +
        `Devolvé un array "gastos" de EXACTAMENTE ${imagenes.length} objetos, EN EL MISMO ORDEN que te pasé las fotos (el objeto en ` +
        "la posición N corresponde a la foto N) — nunca te saltees una posición ni cambies el orden, aunque una foto sea ilegible. " +
        "Cada objeto tiene:\n" +
        '- "fecha": la fecha del ticket en formato "YYYY-MM-DD" si es legible, o null si no la encontrás con certeza — no inventes una fecha.\n' +
        '- "monto": el monto TOTAL pagado (el número final, no un subtotal ni el vuelto) como number, o null si no es legible.\n' +
        `- "categoria": string o null si no podés estimarla.${instruccionCategorias}\n` +
        '- "descripcion": una descripción corta (nombre del comercio y/o concepto, ej. "YPF Ruta 9" o "Almuerzo equipo de trabajo"), ' +
        'o null si no se distingue nada útil.\n\n' +
        "Si una foto no muestra ningún ticket/comprobante legible, devolvé igual un objeto en esa posición con todos los campos en " +
        `null — nunca omitas la posición.${instruccionExtra}\n\n` +
        'Respondé ÚNICAMENTE con un JSON válido: {"gastos": [{"fecha": string | null, "monto": number | null, "categoria": string | ' +
        'null, "descripcion": string | null}]}, sin texto antes ni después, sin bloque de código markdown.',
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
                  ? `Leeme estos ${imagenes.length} tickets — cada foto es un gasto distinto, devolveme un objeto por cada una en el mismo orden.`
                  : "Leeme este ticket.",
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !textBlock) {
      await logDiagnostico(supabase, profile.id, `leer-tickets: stop_reason=${response.stop_reason}, sin bloque de texto utilizable`);
      return NextResponse.json({ error: "No se pudieron leer los tickets." }, { status: 502 });
    }

    let parsed: { gastos: unknown };
    try {
      const match = textBlock.text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : textBlock.text);
    } catch {
      await logDiagnostico(supabase, profile.id, "leer-tickets: la respuesta no fue JSON parseable", textBlock.text);
      return NextResponse.json({ error: "La IA no pudo leer los tickets — probá con otras fotos o cargalos a mano." }, { status: 502 });
    }

    const crudos = Array.isArray(parsed.gastos) ? (parsed.gastos as unknown[]) : [];
    // Garantiza que siempre vuelven EXACTAMENTE tantos objetos como fotos
    // mandaste, en la misma posición — el frontend empareja por índice con
    // la foto original (que va a usar como comprobante), así que un
    // desfasaje acá rompería esa relación foto↔gasto en silencio.
    const vacio: GastoDetectado = { fecha: null, monto: null, categoria: null, descripcion: null };
    const gastos: GastoDetectado[] = Array.from({ length: imagenes.length }, (_, i) => {
      const c = crudos[i] as Partial<Record<keyof GastoDetectado, unknown>> | undefined;
      if (!c || typeof c !== "object") return vacio;
      return {
        fecha: typeof c.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.fecha) ? c.fecha : null,
        monto: typeof c.monto === "number" && Number.isFinite(c.monto) && c.monto > 0 ? c.monto : null,
        categoria: typeof c.categoria === "string" && c.categoria.trim() ? c.categoria.trim().slice(0, 80) : null,
        descripcion: typeof c.descripcion === "string" && c.descripcion.trim() ? c.descripcion.trim().slice(0, 160) : null,
      };
    });

    return NextResponse.json({ gastos });
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    await logDiagnostico(supabase, profile.id, `leer-tickets: error contactando la API de Anthropic — ${detalle}`);
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
    return NextResponse.json({ error: mensajeErrorIa(err) }, { status: 502 });
  }
}
