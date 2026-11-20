import type { ItemInspeccionIa } from "./types";

/**
 * Bloque de instrucción para sumar al system prompt de cualquier
 * /api/<modulo>/leer-foto — le pide a la IA que, ADEMÁS de lo que ese
 * endpoint ya identifica (circuitos, equipamiento, tramos de torre, etc.),
 * evalúe el catálogo de Inspección IA configurado por un Admin para ese
 * módulo contra las mismas fotos. Devuelve "" si el módulo no tiene ítems
 * cargados (no se le pide nada de más a la IA en ese caso).
 */
export function instruccionInspeccionIa(items: ItemInspeccionIa[]): string {
  if (items.length === 0) return "";
  return (
    "\n\nADEMÁS de lo anterior, revisá estas mismas fotos buscando específicamente estos puntos de inspección (catálogo configurado " +
    "por un Administrador):\n" +
    items.map((h) => `- id "${h.id}": ${h.texto}`).join("\n") +
    '\n\nPara CADA ítem de esa lista (sin excepción, incluilos todos aunque no encuentres nada) devolvé un objeto {"itemId": string, ' +
    '"estado": string, "comentario": string} donde:\n' +
    '- "itemId": el id EXACTO del ítem tal cual te lo pasé.\n' +
    '- "estado": "no_ok" si lo que describe el ítem SE VE en la foto (se detectó — hay un problema o una condición presente), "ok" si ' +
    'se puede ver la zona relevante y NO está presente, "no_aplica" si la foto no permite evaluarlo (ángulo, obstruido, borroso, o esa ' +
    "parte no aparece en ninguna foto). Nunca inventes un \"no_ok\" que no puedas justificar por lo que ves.\n" +
    '- "comentario": una frase corta justificando el estado (qué viste, o por qué no se pudo evaluar). Nunca vacío.'
  );
}

/** Texto a embeber en la instrucción de formato de respuesta JSON de cada endpoint, describiendo el campo "hallazgos". */
export const INSTRUCCION_RESPUESTA_HALLAZGOS =
  '"hallazgos" es un array de objetos {"itemId": string, "estado": string, "comentario": string} (array VACÍO [] si no te pasé ' +
  "ningún ítem de inspección para evaluar)";

interface HallazgoDetectadoCrudo {
  itemId?: unknown;
  estado?: unknown;
  comentario?: unknown;
}

export interface HallazgoDetectadoValidado {
  itemId: string;
  texto: string;
  estado: "ok" | "no_ok" | "no_aplica";
  comentario: string;
}

const ESTADOS_VALIDOS = new Set(["ok", "no_ok", "no_aplica"]);

/**
 * Valida la respuesta cruda de la IA contra el catálogo real — solo deja
 * pasar ítems que REALMENTE estén en el catálogo (nunca un id inventado) y
 * con un estado válido; un ítem del catálogo sin veredicto utilizable de la
 * IA directamente no aparece (el form lo deja en blanco para que el
 * técnico lo complete a mano).
 */
export function parseHallazgosDetectados(raw: unknown, items: ItemInspeccionIa[]): HallazgoDetectadoValidado[] {
  const textoPorId = new Map(items.map((h) => [h.id, h.texto]));
  const lista = Array.isArray(raw) ? (raw as HallazgoDetectadoCrudo[]) : [];
  return lista
    .filter(
      (h): h is Required<HallazgoDetectadoCrudo> & { itemId: string; estado: string } =>
        !!h && typeof h.itemId === "string" && textoPorId.has(h.itemId) && typeof h.estado === "string" && ESTADOS_VALIDOS.has(h.estado),
    )
    .map((h) => ({
      itemId: h.itemId,
      texto: textoPorId.get(h.itemId)!,
      estado: h.estado as "ok" | "no_ok" | "no_aplica",
      comentario: typeof h.comentario === "string" ? h.comentario.trim().slice(0, 300) : "",
    }));
}
