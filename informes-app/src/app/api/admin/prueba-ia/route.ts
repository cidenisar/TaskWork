import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireProfile } from "@/lib/auth";
import { puedeVerConfiguracion } from "@/lib/types";

/**
 * PRUEBA TEMPORAL (solo administradores): manda la MISMA foto con la MISMA
 * instrucción a varias IAs y devuelve lo que leyó cada una, para comparar
 * calidad antes de decidir si se reemplaza Anthropic por una IA gratuita.
 * No guarda nada en la base ni registra uso — es solo para mirar.
 *
 * Cada proveedor se activa solo si su clave está configurada en Vercel:
 *  - Claude:      ANTHROPIC_API_KEY (la que ya usa la app)
 *  - Cloudflare:  CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_TOKEN   (modelo: CLOUDFLARE_AI_MODEL)
 *  - Groq:        GROQ_API_KEY                                 (modelo: GROQ_MODEL)
 *  - Mistral:     MISTRAL_API_KEY                              (modelo: MISTRAL_MODEL)
 */

const PROMPT =
  "Sos un asistente que lee fotos de tickets, facturas o comprobantes de gastos en Argentina. " +
  "La foto puede tener UNO o VARIOS comprobantes distintos (por ejemplo dos tickets apoyados juntos): devolvé uno por cada " +
  "comprobante distinto. Si la foto muestra el mismo comprobante repetido (ej. ORIGINAL y DUPLICADO de una factura), contalo UNA sola vez.\n\n" +
  "Para cada comprobante devolvé:\n" +
  '- "fecha": "YYYY-MM-DD" o null. Las fechas argentinas son día/mes/año (03/11/2026 = 3 de noviembre).\n' +
  '- "monto": el TOTAL pagado como number (sin separadores de miles), o null. Ojo: algunos tickets usan coma de miles ' +
  '("$13,450.00" = 13450) y otros punto de miles ("$72.000,00" = 72000).\n' +
  '- "comercio": nombre del comercio o emisor, o null.\n' +
  '- "descripcion": concepto corto (ej. "2 almuerzos", "Peaje", "Cenas"), o null.\n\n' +
  'Respondé ÚNICAMENTE con JSON válido: {"comprobantes":[{"fecha":...,"monto":...,"comercio":...,"descripcion":...}]}, sin texto extra ni markdown.';

interface Resultado {
  proveedor: string;
  modelo: string;
  ok: boolean;
  ms: number;
  comprobantes?: unknown[];
  crudo?: string;
  error?: string;
}

function extraerJson(texto: string): unknown[] | null {
  try {
    const m = texto.match(/\{[\s\S]*\}/);
    const p = JSON.parse(m ? m[0] : texto) as { comprobantes?: unknown };
    return Array.isArray(p.comprobantes) ? p.comprobantes : null;
  } catch {
    return null;
  }
}

async function medir(proveedor: string, modelo: string, fn: () => Promise<string>): Promise<Resultado> {
  const t0 = Date.now();
  try {
    const texto = await fn();
    const comprobantes = extraerJson(texto);
    return { proveedor, modelo, ok: comprobantes !== null, ms: Date.now() - t0, comprobantes: comprobantes ?? undefined, crudo: texto.slice(0, 3000) };
  } catch (err) {
    return { proveedor, modelo, ok: false, ms: Date.now() - t0, error: (err instanceof Error ? err.message : String(err)).slice(0, 500) };
  }
}

/** Llamada estilo OpenAI (Groq, Mistral). */
async function openAiCompat(
  url: string,
  key: string,
  modelo: string,
  dataUri: string,
  reintento = true,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      temperature: 0,
      max_tokens: 1500,
      ...extra,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        },
      ],
    }),
  });
  const body = await res.text();
  // Plan gratis con límite por minuto: si pide esperar poco, se espera y se reintenta una vez.
  if (res.status === 429 && reintento) {
    const seg = Number(body.match(/try again in ([\d.]+)s/i)?.[1] ?? res.headers.get("retry-after") ?? NaN);
    if (Number.isFinite(seg) && seg <= 30) {
      await new Promise((r) => setTimeout(r, Math.ceil(seg * 1000) + 500));
      return openAiCompat(url, key, modelo, dataUri, false, extra);
    }
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  const json = JSON.parse(body) as { choices?: { message?: { content?: string | null; reasoning?: string | null } }[] };
  const msg = json.choices?.[0]?.message;
  // Modelos que "piensan": si no llegaron a escribir la respuesta, mostrar al menos lo que razonaron.
  return msg?.content || (msg?.reasoning ? `[sin respuesta final] ${msg.reasoning}` : "");
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile();
  if (!puedeVerConfiguracion(profile.rol)) {
    return NextResponse.json({ error: "Solo para administradores." }, { status: 403 });
  }

  const form = await req.formData();
  const foto = form.get("foto");
  if (!(foto instanceof File)) return NextResponse.json({ error: "Falta la foto." }, { status: 400 });

  const base64 = Buffer.from(await foto.arrayBuffer()).toString("base64");
  const mediaType = foto.type === "image/png" ? "image/png" : "image/jpeg";
  const dataUri = `data:${mediaType};base64,${base64}`;

  const tareas: Promise<Resultado>[] = [];

  if (process.env.ANTHROPIC_API_KEY) {
    const modelo = "claude-opus-5-5";
    tareas.push(
      medir("Claude (actual, pago)", modelo, async () => {
        const client = new Anthropic();
        const r = await client.messages.create({
          model: modelo,
          max_tokens: 1500,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
                { type: "text", text: PROMPT },
              ],
            },
          ],
        });
        const b = r.content.find((x) => x.type === "text");
        return b && b.type === "text" ? b.text : "";
      }),
    );
  }

  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_AI_TOKEN) {
    const modelo = process.env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-4-scout-17b-16e-instruct";
    tareas.push(
      medir("Cloudflare Workers AI (gratis)", modelo, () =>
        openAiCompat(
          `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
          process.env.CLOUDFLARE_AI_TOKEN!,
          modelo,
          dataUri,
        ),
      ),
    );
  }

  if (process.env.GROQ_API_KEY) {
    const modelo = process.env.GROQ_MODEL || "qwen/qwen3.8-27b";
    tareas.push(
      medir("Groq (gratis)", modelo, () => openAiCompat("https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY!, modelo, dataUri)),
    );
  }

  if (process.env.OPENROUTER_API_KEY) {
    const modelo = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-super-vl:free";
    tareas.push(
      medir("OpenRouter (gratis)", modelo, () =>
        openAiCompat("https://openrouter.ai/api/v1/chat/completions", process.env.OPENROUTER_API_KEY!, modelo, dataUri, true, {
          max_tokens: 4000,
          reasoning: { enabled: false },
        }),
      ),
    );
  }

  if (process.env.NVIDIA_API_KEY) {
    const modelo = process.env.NVIDIA_MODEL || "z-ai/glm-5.3-flash";
    tareas.push(
      medir("NVIDIA NIM (gratis)", modelo, () =>
        openAiCompat("https://integrate.api.nvidia.com/v1/chat/completions", process.env.NVIDIA_API_KEY!, modelo, dataUri),
      ),
    );
  }

  if (process.env.MISTRAL_API_KEY) {
    const modelo = process.env.MISTRAL_MODEL || "mistral-small-latest";
    tareas.push(
      medir("Mistral (gratis)", modelo, () => openAiCompat("https://api.mistral.ai/v1/chat/completions", process.env.MISTRAL_API_KEY!, modelo, dataUri)),
    );
  }

  if (tareas.length === 0) {
    return NextResponse.json({ error: "No hay ninguna IA configurada (faltan las claves en Vercel)." }, { status: 503 });
  }

  const resultados = await Promise.all(tareas);
  return NextResponse.json({ resultados });
}
