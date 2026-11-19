import Anthropic from "@anthropic-ai/sdk";

/**
 * Qué se averiguó en internet sobre un modelo de UPS / banco / rectificador.
 * Todo es opcional: si la búsqueda no encontró un dato con respaldo, queda null.
 */
export interface DatosModeloBateria {
  /** Baterías que lleva el equipo (internas en una UPS; las del gabinete/módulo en un banco armado de fábrica). */
  bateriaCantidad: number | null;
  /** Tensión y capacidad de cada batería ("12 V 9 Ah"). */
  bateriaTipo: string;
  upsBaterias: "internas" | "banco_externo" | null;
  potenciaNominal: string;
  /** Página de donde salió el dato, para que quien lo revisa pueda verla. */
  fuenteUrl: string | null;
  /** Una línea con lo que encontró, o por qué no pudo dar el número. */
  nota: string;
}

const INSTRUCCION = (categoriaLabel: string, modelo: string) =>
  `Necesito datos de baterías de este equipo de campo: categoría "${categoriaLabel}", marca/modelo "${modelo}".\n\n` +
  "Buscá en internet la hoja de datos (datasheet) o la ficha oficial del fabricante, y respondé SOLO con lo que esa fuente diga:\n" +
  '- "bateriaCantidad": cuántas baterías lleva ese modelo (en una UPS, las internas; en un banco/gabinete armado de fábrica, las que trae). ' +
  "Si el modelo es una batería suelta (un monoblock) o un banco que se arma a medida en cada instalación, la cantidad depende de la instalación: devolvé null.\n" +
  '- "bateriaTipo": tensión y capacidad de cada batería ("12 V 9 Ah"), o "".\n' +
  '- "upsBaterias": en una UPS, "internas" si lleva las baterías adentro, "banco_externo" si trabaja con un banco externo; si no es una UPS o no lo dice, null.\n' +
  '- "potenciaNominal": potencia del equipo tal como la da el fabricante ("3 kVA / 2,7 kW", "48 Vcc 100 A"), o "".\n' +
  '- "fuenteUrl": la dirección de la página de donde sacaste los datos, o null.\n' +
  '- "nota": una sola línea: qué encontraste, o por qué no pudiste dar la cantidad.\n\n' +
  "No adivines: si no encontraste una fuente que hable de ESE modelo exacto, devolvé null/vacío en lo que no esté respaldado y explicalo en la nota. " +
  'Respondé ÚNICAMENTE con un JSON válido {"bateriaCantidad": number | null, "bateriaTipo": string, "upsBaterias": string | null, ' +
  '"potenciaNominal": string, "fuenteUrl": string | null, "nota": string}, sin texto antes ni después ni bloque de código.';

function parsear(texto: string): DatosModeloBateria | null {
  const match = texto.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let crudo: Record<string, unknown>;
  try {
    crudo = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const cantidad = typeof crudo.bateriaCantidad === "number" && Number.isFinite(crudo.bateriaCantidad) ? Math.round(crudo.bateriaCantidad) : null;
  const url = typeof crudo.fuenteUrl === "string" && /^https?:\/\//i.test(crudo.fuenteUrl.trim()) ? crudo.fuenteUrl.trim().slice(0, 500) : null;
  return {
    bateriaCantidad: cantidad !== null && cantidad >= 1 && cantidad <= 1000 ? cantidad : null,
    bateriaTipo: typeof crudo.bateriaTipo === "string" ? crudo.bateriaTipo.trim().slice(0, 60) : "",
    upsBaterias: crudo.upsBaterias === "internas" || crudo.upsBaterias === "banco_externo" ? crudo.upsBaterias : null,
    potenciaNominal: typeof crudo.potenciaNominal === "string" ? crudo.potenciaNominal.trim().slice(0, 60) : "",
    fuenteUrl: url,
    nota: typeof crudo.nota === "string" ? crudo.nota.trim().slice(0, 300) : "",
  };
}

export interface ResultadoBusquedaModelo {
  datos: DatosModeloBateria;
  modelo: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Busca en internet (herramienta de búsqueda web de Claude) cuántas baterías
 * y de qué tipo lleva un modelo de UPS/banco/rectificador. Solo Claude puede
 * hacerlo — las IAs gratuitas no tienen búsqueda web — por eso va aparte del
 * enchufe multi-IA, y es a pedido (un botón), no en cada lectura de foto.
 */
export async function buscarDatosModeloEnInternet(categoriaLabel: string, marcaModelo: string): Promise<ResultadoBusquedaModelo> {
  const client = new Anthropic();
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: INSTRUCCION(categoriaLabel, marcaModelo) }];
  let inputTokens = 0;
  let outputTokens = 0;
  let modelo = "claude-opus-5-5";

  // La búsqueda web corre del lado de Anthropic y a veces pausa el turno (pause_turn): se continúa hasta 3 veces.
  for (let intento = 0; intento < 4; intento++) {
    const r = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4096,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
      messages,
    });
    inputTokens += r.usage.input_tokens;
    outputTokens += r.usage.output_tokens;
    modelo = r.model;
    if (r.stop_reason === "refusal") throw new Error("Claude se negó a responder (refusal).");
    if (r.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: r.content });
      continue;
    }
    const texto = r.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const datos = parsear(texto);
    if (!datos) throw new Error("La búsqueda no devolvió una respuesta reconocible.");
    return { datos, modelo, inputTokens, outputTokens };
  }
  throw new Error("La búsqueda tardó demasiado — probá de nuevo.");
}
