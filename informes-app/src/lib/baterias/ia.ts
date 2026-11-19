import { DATOS_BATERIA_VACIOS, datosBateriaAColumnas, columnasADatosBateria, rolBateria, type DatosBateria } from "./types";

/**
 * Texto para sumar al prompt de las rutas `leer-foto` (equipos, racks):
 * qué datos de baterías pedir y con qué cuidado. La IA cuenta lo que VE y
 * deduce por modelo solo lo que conoce — y avisa de dónde salió cada número
 * (`bateriaOrigen`) para que nadie tome una estimación como una cuenta.
 */
export const INSTRUCCION_BATERIAS_IA =
  "\n\nBATERÍAS — para los equipos de categoría banco de baterías, UPS y rectificador/fuente completá además estos campos " +
  "(en cualquier otra categoría van vacíos):\n" +
  '- "bateriaDestino": SOLO en bancos de baterías — "rectificador" si el banco alimenta a un rectificador / planta de corriente continua ' +
  '(típico: baterías de 12 V en serie para 48 Vcc, o elementos estacionarios, junto a un gabinete rectificador), "ups" si es el banco de ' +
  'una UPS (gabinete de baterías externo, baterías con la marca de la UPS, cableado hacia una UPS). null si las pistas visibles (cables, ' +
  "gabinete, marca, carteles) no alcanzan — no lo adivines.\n" +
  '- "bateriaCantidad": en un banco, la cantidad de baterías (monoblocks o elementos) que CONTÁS en la foto, uno por uno. Solo si ves el ' +
  "banco completo; si hay baterías tapadas, fuera de cuadro o en otro estante que no se ve, devolvé null (un número parcial es peor que " +
  "ninguno). En una UPS, cuántas baterías internas lleva ESE modelo según su especificación — solo si reconocés el modelo con confianza; " +
  "si no, null.\n" +
  '- "bateriaOrigen": "contadas" si "bateriaCantidad" salió de contar en la foto, "por_modelo" si la dedujiste del modelo; null si ' +
  '"bateriaCantidad" es null.\n' +
  '- "bateriaTipo": tensión y capacidad de cada batería si se lee en su etiqueta (ej. "12 V 150 Ah"), o la conocés con confianza por el ' +
  'modelo. Cadena vacía "" si no.\n' +
  '- "upsBaterias": SOLO en UPS — "internas" si el modelo lleva las baterías dentro de su gabinete (la mayoría de las UPS de torre/rack ' +
  'chicas y medianas), "banco_externo" si trabaja con un banco de baterías externo (gabinete aparte, modelos long-run o de gran potencia ' +
  "sin baterías propias). null si no lo sabés.\n" +
  '- "potenciaNominal": SOLO en UPS y rectificadores — la potencia tal como figura en la chapa/frente o la que corresponde al modelo que ' +
  'reconocés ("3 kVA", "10 kW", "48 Vcc 100 A"). Cadena vacía "" si no se lee ni reconocés el modelo — no inventes una potencia.\n' +
  "Mismo criterio que el resto: lo que no puedas justificar por lo que ves o por un modelo que reconocés, null o vacío.";

/** Fragmento del esquema JSON de respuesta, para pegar dentro del objeto de cada equipo. */
export const CAMPOS_BATERIA_JSON =
  '"bateriaDestino": "rectificador" | "ups" | null, "bateriaCantidad": number | null, "bateriaOrigen": "contadas" | "por_modelo" | null, ' +
  '"bateriaTipo": string, "upsBaterias": "internas" | "banco_externo" | null, "potenciaNominal": string';

type Crudo = Record<string, unknown>;

/**
 * Valida lo que devolvió la IA para un equipo y lo deja listo para el
 * formulario: solo lo que corresponde a su categoría, la cantidad entera y
 * razonable, y un origen coherente (si hay cantidad y la IA no dijo de dónde
 * salió, se toma como estimación por modelo — lo más prudente).
 */
export function parseDatosBateriaIa(crudo: unknown, categoria: string): DatosBateria {
  if (!rolBateria(categoria) || !crudo || typeof crudo !== "object") return { ...DATOS_BATERIA_VACIOS };
  const e = crudo as Crudo;
  const cantidad = typeof e.bateriaCantidad === "number" ? e.bateriaCantidad : null;
  const origenIa = e.bateriaOrigen === "contadas" || e.bateriaOrigen === "por_modelo" ? e.bateriaOrigen : null;
  const destino = e.bateriaDestino === "rectificador" || e.bateriaDestino === "ups" ? e.bateriaDestino : null;
  const upsBaterias = e.upsBaterias === "internas" || e.upsBaterias === "banco_externo" ? e.upsBaterias : null;

  const columnas = datosBateriaAColumnas(categoria, {
    bateriaDestino: destino,
    bateriaCantidad: cantidad,
    bateriaOrigen: origenIa ?? "por_modelo",
    bateriaTipo: typeof e.bateriaTipo === "string" ? e.bateriaTipo : "",
    upsBaterias,
    potenciaNominal: typeof e.potenciaNominal === "string" ? e.potenciaNominal : "",
    alimentadoPorTipo: null,
    alimentadoPorId: null,
  });
  return columnasADatosBateria(columnas);
}
