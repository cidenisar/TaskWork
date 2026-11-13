import Anthropic from "@anthropic-ai/sdk";
import type { createClient } from "@/lib/supabase/server";
import type { ConfigIaRow, ModoIa } from "@/lib/database.types";
import { registrarUsoIa } from "./registrar-uso";

/**
 * "Enchufe" único de IA. Las rutas le pasan el MISMO pedido que antes le
 * mandaban a Claude (`client.beta.messages.create(params)`) y el enchufe
 * decide a qué IA(s) mandarlo según los interruptores de Configuración → IA
 * (tabla `config_ia`, solo Superusuario):
 *
 *  - modo "combinada": votan TODAS las IAs prendidas en paralelo; por cada
 *    campo del JSON se toma el valor en el que coinciden al menos dos. Si no
 *    hay mayoría se toma el de la IA de mayor prioridad y el campo queda
 *    anotado en `ia.dudosos` (para marcarlo en amarillo más adelante).
 *  - modo "en_orden": se usa la primera que responda bien.
 *  - pedidos de texto libre (ej. "Mejorar con IA") siempre van en orden:
 *    no se puede votar un párrafo.
 *
 * Prioridad (desempata y define el orden): Claude → Cloudflare → Groq →
 * OpenRouter → NVIDIA. Devuelve un objeto con la misma forma que usaban las
 * rutas de la respuesta de Anthropic (`content`, `model`, `usage`,
 * `stop_reason`), así cada ruta cambia lo mínimo. El registro de uso
 * (`ia_uso`) lo hace el enchufe, una fila por IA que respondió.
 */

export type ProveedorIa = "claude" | "cloudflare" | "groq" | "openrouter" | "nvidia";

export const PROVEEDORES_IA: { id: ProveedorIa; nombre: string; gratis: boolean; envs: string[] }[] = [
  { id: "claude", nombre: "Claude (Anthropic)", gratis: false, envs: ["ANTHROPIC_API_KEY"] },
  { id: "cloudflare", nombre: "Cloudflare Workers AI", gratis: true, envs: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_AI_TOKEN"] },
  { id: "groq", nombre: "Groq", gratis: true, envs: ["GROQ_API_KEY"] },
  { id: "openrouter", nombre: "OpenRouter", gratis: true, envs: ["OPENROUTER_API_KEY"] },
  { id: "nvidia", nombre: "NVIDIA", gratis: true, envs: ["NVIDIA_API_KEY"] },
];

export function proveedorConfigurado(id: ProveedorIa): boolean {
  const p = PROVEEDORES_IA.find((x) => x.id === id)!;
  return p.envs.every((e) => !!process.env[e]);
}

/** Hay al menos una IA con su clave cargada en el entorno (sin mirar los interruptores). */
export function hayAlgunaIaConfigurada(): boolean {
  return PROVEEDORES_IA.some((p) => proveedorConfigurado(p.id));
}

export interface ConfigIa {
  activos: Record<ProveedorIa, boolean>;
  modo: ModoIa;
}

/** Si la tabla no está o falla la lectura, se comporta como antes: solo Claude. */
const CONFIG_POR_DEFECTO: ConfigIa = {
  activos: { claude: true, cloudflare: false, groq: false, openrouter: false, nvidia: false },
  modo: "combinada",
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

export function filaAConfig(row: ConfigIaRow): ConfigIa {
  return {
    activos: {
      claude: row.claude_activo,
      cloudflare: row.cloudflare_activo,
      groq: row.groq_activo,
      openrouter: row.openrouter_activo,
      nvidia: row.nvidia_activo,
    },
    modo: row.modo,
  };
}

export async function obtenerConfigIa(supabase: Supabase): Promise<ConfigIa> {
  try {
    const { data, error } = await supabase.from("config_ia").select("*").eq("id", 1).single();
    if (error || !data) return CONFIG_POR_DEFECTO;
    return filaAConfig(data);
  } catch {
    return CONFIG_POR_DEFECTO;
  }
}

// ---------------------------------------------------------------------------
// Llamadas a cada proveedor
// ---------------------------------------------------------------------------

type ParamsClaude = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

interface Salida {
  texto: string;
  modelo: string;
  inputTokens: number;
  outputTokens: number;
}

async function llamarClaude(params: ParamsClaude): Promise<Salida> {
  const client = new Anthropic();
  const r = await client.beta.messages.create(params);
  if (r.stop_reason === "refusal") throw new Error("Claude se negó a responder (refusal).");
  const texto = r.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  if (!texto) throw new Error("Claude no devolvió texto.");
  return { texto, modelo: r.model, inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens };
}

/** Pasa el pedido en formato Anthropic al formato OpenAI (el que entienden las gratuitas). */
function aFormatoOpenAi(params: ParamsClaude) {
  const mensajes: { role: string; content: unknown }[] = [];
  if (params.system) {
    const sys = typeof params.system === "string" ? params.system : params.system.map((b) => ("text" in b ? b.text : "")).join("\n");
    mensajes.push({ role: "system", content: sys });
  }
  for (const m of params.messages) {
    if (typeof m.content === "string") {
      mensajes.push({ role: m.role, content: m.content });
      continue;
    }
    const partes: unknown[] = [];
    for (const b of m.content) {
      if (b.type === "text") partes.push({ type: "text", text: b.text });
      else if (b.type === "image" && b.source.type === "base64") {
        partes.push({ type: "image_url", image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } });
      }
    }
    // Las gratuitas suelen leer mejor con la instrucción ANTES de las imágenes.
    partes.sort((a, b) => ((a as { type: string }).type === "text" ? -1 : 0) - ((b as { type: string }).type === "text" ? -1 : 0));
    mensajes.push({ role: m.role, content: partes });
  }
  return mensajes;
}

const ENDPOINTS: Record<Exclude<ProveedorIa, "claude">, { url: () => string; key: () => string; modelo: () => string; extra?: Record<string, unknown> }> = {
  cloudflare: {
    url: () => `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
    key: () => process.env.CLOUDFLARE_AI_TOKEN!,
    modelo: () => process.env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-4-scout-17b-16e-instruct",
  },
  groq: {
    url: () => "https://api.groq.com/openai/v1/chat/completions",
    key: () => process.env.GROQ_API_KEY!,
    modelo: () => process.env.GROQ_MODEL || "qwen/qwen3.8-27b",
  },
  openrouter: {
    url: () => "https://openrouter.ai/api/v1/chat/completions",
    key: () => process.env.OPENROUTER_API_KEY!,
    modelo: () => process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-super-vl:free",
    extra: { reasoning: { enabled: false } },
  },
  nvidia: {
    url: () => "https://integrate.api.nvidia.com/v1/chat/completions",
    key: () => process.env.NVIDIA_API_KEY!,
    modelo: () => process.env.NVIDIA_MODEL || "z-ai/glm-5.3-flash",
  },
};

async function llamarOpenAiCompat(id: Exclude<ProveedorIa, "claude">, params: ParamsClaude, reintento = true): Promise<Salida> {
  const ep = ENDPOINTS[id];
  const modelo = ep.modelo();
  const res = await fetch(ep.url(), {
    method: "POST",
    headers: { Authorization: `Bearer ${ep.key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      temperature: 0,
      max_tokens: Math.min(params.max_tokens, 8192),
      ...ep.extra,
      messages: aFormatoOpenAi(params),
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = await res.text();
  // Planes gratis con límite por minuto: si piden esperar poco, se espera y se reintenta una vez.
  if (res.status === 429 && reintento) {
    const seg = Number(body.match(/try again in ([\d.]+)s/i)?.[1] ?? res.headers.get("retry-after") ?? NaN);
    if (Number.isFinite(seg) && seg <= 30) {
      await new Promise((r) => setTimeout(r, Math.ceil(seg * 1000) + 500));
      return llamarOpenAiCompat(id, params, false);
    }
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  const json = JSON.parse(body) as {
    model?: string;
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const texto = json.choices?.[0]?.message?.content ?? "";
  if (!texto.trim()) throw new Error("Respuesta vacía.");
  return {
    texto,
    modelo: `${id}:${json.model ?? modelo}`,
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}

function llamar(id: ProveedorIa, params: ParamsClaude): Promise<Salida> {
  return id === "claude" ? llamarClaude(params) : llamarOpenAiCompat(id, params);
}

// ---------------------------------------------------------------------------
// Votación
// ---------------------------------------------------------------------------

function extraerJson(texto: string): unknown | undefined {
  // Se corta desde el primer { o [ (el que aparezca antes) hasta su cierre del mismo tipo más lejano.
  const iObj = texto.indexOf("{");
  const iArr = texto.indexOf("[");
  const candidatos: string[] = [texto.trim()];
  if (iArr !== -1 && (iObj === -1 || iArr < iObj)) candidatos.push(texto.slice(iArr, texto.lastIndexOf("]") + 1));
  if (iObj !== -1) candidatos.push(texto.slice(iObj, texto.lastIndexOf("}") + 1));
  for (const c of candidatos) {
    try {
      return JSON.parse(c);
    } catch {
      // probar el siguiente
    }
  }
  return undefined;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function normalizar(v: unknown): string {
  if (typeof v === "string") return v.trim().toLowerCase().replace(/\s+/g, " ");
  if (typeof v === "number") return String(Math.round(v * 100) / 100);
  return JSON.stringify(v ?? null);
}

/**
 * Combina las respuestas (ya ordenadas por prioridad) campo por campo.
 * Exportada para poder probarla aparte.
 */
export function votar(valores: unknown[], ruta: string, dudosos: string[]): unknown {
  const presentes = valores.filter((v) => v !== undefined);
  if (presentes.length === 0) return undefined;

  if (presentes.every(Array.isArray)) {
    const largos = (presentes as unknown[][]).map((a) => a.length);
    const cuenta = (n: number) => largos.filter((x) => x === n).length;
    const largo = [...largos].sort((a, b) => cuenta(b) - cuenta(a))[0];
    if (presentes.length >= 2 && cuenta(largo) < 2) dudosos.push(`${ruta || "raiz"}[cantidad]`);
    const candidatos = valores.map((v) => (Array.isArray(v) && v.length === largo ? v : undefined));
    return Array.from({ length: largo }, (_, i) => votar(candidatos.map((a) => a?.[i]), `${ruta}[${i}]`, dudosos));
  }

  if (presentes.every(esObjeto)) {
    const claves: string[] = [];
    for (const o of presentes as Record<string, unknown>[]) for (const k of Object.keys(o)) if (!claves.includes(k)) claves.push(k);
    const salida: Record<string, unknown> = {};
    for (const k of claves) {
      const v = votar(
        valores.map((o) => (esObjeto(o) ? o[k] : undefined)),
        ruta ? `${ruta}.${k}` : k,
        dudosos,
      );
      if (v !== undefined) salida[k] = v;
    }
    return salida;
  }

  const grupos = new Map<string, unknown[]>();
  for (const v of presentes) {
    const n = normalizar(v);
    grupos.set(n, [...(grupos.get(n) ?? []), v]);
  }
  const mejor = [...grupos.values()].sort((a, b) => b.length - a.length)[0];
  if (mejor.length >= 2) return mejor[0];
  if (presentes.length >= 2) dudosos.push(ruta || "raiz");
  return presentes[0];
}

// ---------------------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------------------

export interface RespuestaIa {
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  stop_reason: "end_turn" | "refusal";
  content: { type: "text"; text: string }[];
  ia: { proveedores: string[]; dudosos: string[]; fallaron: string[] };
}

export async function crearMensajeIa(
  supabase: Supabase,
  ctx: { endpoint: string; modulo: string; userId: string; tipo?: "json" | "texto" },
  params: ParamsClaude,
): Promise<RespuestaIa> {
  const config = await obtenerConfigIa(supabase);
  const disponibles = PROVEEDORES_IA.map((p) => p.id).filter((id) => config.activos[id] && proveedorConfigurado(id));
  if (disponibles.length === 0) {
    throw new Error("No hay ninguna IA prendida y configurada (Configuración → IA)."); // se mapea abajo
  }

  const tipo = ctx.tipo ?? "json";
  const fallaron: string[] = [];
  const exitos: { id: ProveedorIa; salida: Salida; json: unknown }[] = [];
  let ultimoErrorClaude: unknown = null;

  const registrar = (s: Salida) =>
    registrarUsoIa(supabase, {
      endpoint: ctx.endpoint,
      modulo: ctx.modulo,
      modelo: s.modelo,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      userId: ctx.userId,
    });

  if (config.modo === "combinada" && tipo === "json" && disponibles.length > 1) {
    const res = await Promise.allSettled(disponibles.map((id) => llamar(id, params)));
    res.forEach((r, i) => {
      const id = disponibles[i];
      if (r.status === "rejected") {
        fallaron.push(`${id}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
        return;
      }
      void registrar(r.value);
      const json = extraerJson(r.value.texto);
      if (json === undefined) fallaron.push(`${id}: la respuesta no fue JSON`);
      else exitos.push({ id, salida: r.value, json });
    });
  } else {
    for (const id of disponibles) {
      try {
        const salida = await llamar(id, params);
        void registrar(salida);
        if (tipo === "json") {
          const json = extraerJson(salida.texto);
          if (json === undefined) {
            fallaron.push(`${id}: la respuesta no fue JSON`);
            continue;
          }
          exitos.push({ id, salida, json });
        } else {
          exitos.push({ id, salida, json: undefined });
        }
        break;
      } catch (err) {
        if (id === "claude") ultimoErrorClaude = err;
        fallaron.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  if (exitos.length === 0) {
    // Con Claude como única IA, se relanza su error original para conservar
    // los mensajes de siempre (clave inválida, sin crédito, saturado).
    if (disponibles.length === 1 && ultimoErrorClaude) throw ultimoErrorClaude;
    throw new Error(`Ninguna IA respondió. ${fallaron.join(" | ")}`);
  }

  const dudosos: string[] = [];
  let texto: string;
  if (tipo === "texto") {
    texto = exitos[0].salida.texto;
  } else if (exitos.length === 1) {
    // Se devuelve el JSON ya limpio (sin "<think>", bloques markdown, etc. que agregan algunas gratuitas).
    texto = JSON.stringify(exitos[0].json);
    if (config.modo === "combinada" && tipo === "json" && disponibles.length > 1) dudosos.push("*sin-control: respondió una sola IA");
  } else {
    texto = JSON.stringify(votar(exitos.map((e) => e.json), "", dudosos));
  }

  return {
    model: exitos.map((e) => e.salida.modelo).join(" + "),
    usage: {
      input_tokens: exitos.reduce((a, e) => a + e.salida.inputTokens, 0),
      output_tokens: exitos.reduce((a, e) => a + e.salida.outputTokens, 0),
    },
    stop_reason: "end_turn",
    content: [{ type: "text", text: texto }],
    ia: { proveedores: exitos.map((e) => e.id), dudosos, fallaron },
  };
}

/**
 * Traduce cualquier error del enchufe a un mensaje para el técnico. Mantiene
 * los mismos mensajes que ya mostraban las rutas para los errores de la
 * cuenta de Anthropic.
 */
export function mensajeErrorIa(err: unknown): string {
  const detalle = err instanceof Error ? err.message : String(err);
  if (/No hay ninguna IA prendida/.test(detalle)) {
    return "No hay ninguna IA prendida en Configuración → IA — cargalo a mano o pedile a un Superusuario que prenda alguna.";
  }
  if (err instanceof Anthropic.AuthenticationError) return "La clave de IA configurada no es válida — avisá a un Administrador.";
  if (err instanceof Anthropic.PermissionDeniedError) {
    return "La cuenta de IA no tiene permiso o crédito disponible para esta operación — avisá a un Administrador.";
  }
  if (err instanceof Anthropic.RateLimitError) return "El servicio de IA está saturado en este momento — probá de nuevo en un minuto.";
  if (/credit|billing|quota/i.test(detalle) && /claude/i.test(detalle)) {
    return "La cuenta de IA no tiene crédito disponible — avisá a un Administrador para recargarla.";
  }
  if (/Ninguna IA respondió/.test(detalle)) {
    return "Ninguna IA pudo leer esto ahora — probá de nuevo en un minuto o cargalo a mano.";
  }
  return "No se pudo contactar al servicio de IA.";
}
