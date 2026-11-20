import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import { calcularCostoUsd } from "@/lib/ai/pricing";
import type { TableroCategoriaEquipo, TableroTipoCircuito } from "@/lib/database.types";

/**
 * Lectura de UN tablero eléctrico desde sus fotos, en una sola llamada a
 * Claude — implementación de referencia: `docs/lectura-fotos/leer_tablero.py`
 * del repo `cidenisar/motor-unifilar` (rama `lectura-fotos`), probada fuera
 * de la app por el usuario con buenos resultados de costo (~USD 0,13 con
 * Opus) y calidad. Portado acá, no copiado tal cual — ver ENCARGO.md Fase 0
 * para la comparación completa contra el modelo de datos de la app.
 *
 * Esto NO dibuja nada ni llama al motor de unifilares — devuelve datos para
 * que el técnico los revise. "El motor" (tablero_circuitos / motor-unifilares)
 * sigue sin cambios.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// Mismo criterio que motor-unifilares/src/anthropic-client.ts con
// REGLAS_UNIFILAR.md: texto editable sin tocar código, nunca mezclado con
// las reglas de dibujo (ENCARGO.md lo pide explícito).
const REGLAS_LECTURA = readFileSync(join(__dirname, "..", "..", "..", "reglas", "REGLAS_LECTURA.md"), "utf-8");

/** Lado máximo en px que Claude aprovecha — mandar más grande solo cuesta más (ver leer_tablero.py). */
const LADO_MAX = 1568;

// ---------- Esquema de la tool (idéntico al de leer_tablero.py — las claves van en snake_case tal cual las espera el prompt, no se traducen acá). ----------

const NULLSTR = { type: ["string", "null"] } as const;

const ESQUEMA_GUARDAR_TABLERO = {
  type: "object",
  properties: {
    tablero: {
      type: "object",
      properties: { nombre: NULLSTR, obra: NULLSTR, alimentacion: NULLSTR },
    },
    general: {
      type: "object",
      properties: {
        calibre: { ...NULLSTR, description: "ej. '63A'" },
        confirmar: { type: "boolean", description: "true si el calibre se dedujo y no se leyó" },
        nota: NULLSTR,
      },
      required: ["calibre", "confirmar"],
    },
    protector: {
      type: "object",
      properties: { calibre: NULLSTR, modelo: NULLSTR },
    },
    circuitos: {
      type: "array",
      description: "Un elemento por par térmica+disyuntor, en orden de lectura",
      items: {
        type: "object",
        properties: {
          destino: { ...NULLSTR, description: "etiqueta negra/original" },
          etiqueta_extra: { ...NULLSTR, description: "etiqueta amarilla/agregada" },
          etiqueta_conflicto: { type: "boolean" },
          dif_in: { ...NULLSTR, description: "ej. '25A'" },
          dif_clase: { type: "string", enum: ["Común", "S.I."] },
          term_in: { ...NULLSTR, description: "ej. '16A'" },
          estado: { type: "string", enum: ["ON", "OFF"] },
          fase: { type: ["string", "null"], enum: ["R", "S", "T", null] },
        },
        required: ["destino", "etiqueta_extra", "dif_in", "term_in", "estado"],
      },
    },
    observaciones: { type: "array", items: { type: "string" } },
  },
  required: ["general", "protector", "circuitos", "observaciones"],
};

// ---------- Tipos de la lectura (camelCase, TS) — se traduce desde/hacia el JSON snake_case solo en los bordes (parseo y armado del prompt). ----------

export interface CircuitoLeido {
  destino: string | null;
  etiquetaExtra: string | null;
  etiquetaConflicto: boolean;
  difIn: string | null;
  difClase: "Común" | "S.I.";
  termIn: string | null;
  estado: "ON" | "OFF";
  fase: "R" | "S" | "T" | null;
}

export interface TableroLeido {
  tablero: { nombre: string | null; obra: string | null; alimentacion: string | null; empresa: string };
  general: { calibre: string | null; confirmar: boolean; nota: string | null };
  protector: { calibre: string | null; modelo: string | null };
  circuitos: CircuitoLeido[];
  observaciones: string[];
}

export interface UsoLecturaTablero {
  modelo: string;
  inputTokens: number;
  outputTokens: number;
  costoUsd: number;
}

export class LecturaTableroError extends Error {}

// ---------- Compresión + recorte de detalle (ver leer_tablero.py#partes_foto) ----------

export interface ParteFotoParaIa {
  /** Para debug/trazabilidad — nunca se persiste, solo identifica la parte en los logs/preview. */
  etiqueta: string;
  buffer: Buffer;
  mediaType: "image/jpeg";
}

async function normalizarOrientacion(buffer: Buffer): Promise<{ buffer: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(buffer).rotate().toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

async function aJpegLimitado(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).resize(LADO_MAX, LADO_MAX, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
}

/**
 * Devuelve la foto entera y, si `detalle`, 2 mitades con 10% de solape —
 * mismo criterio que `partes_foto()` del script de referencia: al achicar
 * la foto entera a LADO_MAX se pierde la letra chica (calibres, "30mA"),
 * así que las mitades se recortan del original ANTES de achicar, para
 * conservar más resolución efectiva sobre esa mitad.
 */
export async function partesDeFoto(fotoOriginal: Buffer, nombreFoto: string, detalle = true): Promise<ParteFotoParaIa[]> {
  const { buffer: orientado, width: w, height: h } = await normalizarOrientacion(fotoOriginal);
  const partes: ParteFotoParaIa[] = [{ etiqueta: `Foto ${nombreFoto} - entera`, buffer: await aJpegLimitado(orientado), mediaType: "image/jpeg" }];

  if (detalle && Math.max(w, h) > LADO_MAX) {
    if (w >= h) {
      const m = Math.floor(w / 2);
      const s = Math.floor(w / 20);
      partes.push({
        etiqueta: `Foto ${nombreFoto} - mitad izquierda`,
        buffer: await aJpegLimitado(await sharp(orientado).extract({ left: 0, top: 0, width: Math.min(m + s, w), height: h }).toBuffer()),
        mediaType: "image/jpeg",
      });
      partes.push({
        etiqueta: `Foto ${nombreFoto} - mitad derecha`,
        buffer: await aJpegLimitado(
          await sharp(orientado)
            .extract({ left: Math.max(m - s, 0), top: 0, width: w - Math.max(m - s, 0), height: h })
            .toBuffer(),
        ),
        mediaType: "image/jpeg",
      });
    } else {
      const m = Math.floor(h / 2);
      const s = Math.floor(h / 20);
      partes.push({
        etiqueta: `Foto ${nombreFoto} - mitad de arriba`,
        buffer: await aJpegLimitado(await sharp(orientado).extract({ left: 0, top: 0, width: w, height: Math.min(m + s, h) }).toBuffer()),
        mediaType: "image/jpeg",
      });
      partes.push({
        etiqueta: `Foto ${nombreFoto} - mitad de abajo`,
        buffer: await aJpegLimitado(
          await sharp(orientado)
            .extract({ left: 0, top: Math.max(m - s, 0), width: w, height: h - Math.max(m - s, 0) })
            .toBuffer(),
        ),
        mediaType: "image/jpeg",
      });
    }
  }
  return partes;
}

// ---------- Llamado a Claude ----------

function snakeACircuito(c: Record<string, unknown>): CircuitoLeido {
  return {
    destino: typeof c.destino === "string" ? c.destino : null,
    etiquetaExtra: typeof c.etiqueta_extra === "string" ? c.etiqueta_extra : null,
    etiquetaConflicto: c.etiqueta_conflicto === true,
    difIn: typeof c.dif_in === "string" ? c.dif_in : null,
    difClase: c.dif_clase === "S.I." ? "S.I." : "Común",
    termIn: typeof c.term_in === "string" ? c.term_in : null,
    estado: c.estado === "OFF" ? "OFF" : "ON",
    fase: c.fase === "R" || c.fase === "S" || c.fase === "T" ? c.fase : null,
  };
}

/**
 * Llama a Claude UNA vez con todas las partes de todas las fotos, y
 * devuelve la lectura ya tipada + el uso real de tokens. `tool_choice:
 * "auto"` a propósito (ver ENCARGO.md "Lo que ya aprendimos" #1):
 * `claude-opus-5-5` devuelve 400 si se fuerza la tool, así que si el
 * modelo responde en texto plano se extrae el JSON de ahí igual.
 */
export async function leerTablero(fotos: { buffer: Buffer; nombre: string }[], modelo: string): Promise<{ json: TableroLeido; uso: UsoLecturaTablero }> {
  if (fotos.length === 0) throw new LecturaTableroError("Hace falta al menos una foto.");

  const partesPorFoto = await Promise.all(fotos.map((f) => partesDeFoto(f.buffer, f.nombre)));
  const content: Anthropic.Messages.ContentBlockParam[] = [];
  for (const partes of partesPorFoto) {
    for (const parte of partes) {
      content.push({ type: "text", text: parte.etiqueta });
      content.push({ type: "image", source: { type: "base64", media_type: parte.mediaType, data: parte.buffer.toString("base64") } });
    }
  }
  content.push({
    type: "text",
    text: "Las mitades son ampliaciones de la misma foto: usalas para leer calibres (C16, 25A, 30mA) y estados, no son equipos distintos.",
  });
  content.push({ type: "text", text: "Leé el tablero de estas fotos y llamá a guardar_tablero." });

  const client = new Anthropic();
  const response = await client.messages.create({
    model: modelo,
    max_tokens: 8000,
    system: REGLAS_LECTURA,
    tools: [
      {
        name: "guardar_tablero",
        description: "Guarda los datos leídos del tablero.",
        input_schema: ESQUEMA_GUARDAR_TABLERO as unknown as Anthropic.Messages.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content }],
  });

  const toolUse = response.content.find((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
  let crudo: Record<string, unknown>;
  if (toolUse) {
    crudo = toolUse.input as Record<string, unknown>;
  } else {
    const texto = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const inicio = texto.indexOf("{");
    const fin = texto.lastIndexOf("}");
    if (inicio === -1 || fin === -1) throw new LecturaTableroError(`Claude no devolvió el JSON (stop_reason=${response.stop_reason}).`);
    try {
      crudo = JSON.parse(texto.slice(inicio, fin + 1));
    } catch {
      throw new LecturaTableroError("La respuesta de Claude no fue JSON parseable.");
    }
  }

  const tableroR = (crudo.tablero ?? {}) as Record<string, unknown>;
  const generalR = (crudo.general ?? {}) as Record<string, unknown>;
  const protectorR = (crudo.protector ?? {}) as Record<string, unknown>;
  const json: TableroLeido = {
    tablero: {
      nombre: typeof tableroR.nombre === "string" ? tableroR.nombre : null,
      obra: typeof tableroR.obra === "string" ? tableroR.obra : null,
      alimentacion: typeof tableroR.alimentacion === "string" ? tableroR.alimentacion : null,
      empresa: typeof tableroR.empresa === "string" ? tableroR.empresa : "TerraLogic",
    },
    general: {
      calibre: typeof generalR.calibre === "string" ? generalR.calibre : null,
      confirmar: generalR.confirmar === true,
      nota: typeof generalR.nota === "string" ? generalR.nota : null,
    },
    protector: {
      calibre: typeof protectorR.calibre === "string" ? protectorR.calibre : null,
      modelo: typeof protectorR.modelo === "string" ? protectorR.modelo : null,
    },
    circuitos: Array.isArray(crudo.circuitos) ? (crudo.circuitos as Record<string, unknown>[]).map(snakeACircuito) : [],
    observaciones: Array.isArray(crudo.observaciones) ? crudo.observaciones.filter((o): o is string => typeof o === "string") : [],
  };

  const uso: UsoLecturaTablero = {
    modelo: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    costoUsd: calcularCostoUsd(response.model, response.usage.input_tokens, response.usage.output_tokens),
  };
  return { json, uso };
}

// ---------- Limpieza (ver leer_tablero.py#limpiar) ----------

/**
 * Deja cada circuito con al menos destino o etiqueta_extra (regla G5) —
 * nunca inventa un nombre, solo marca "SIN ETIQUETA" cuando no hay ninguna
 * base visual, igual que el script de referencia.
 */
export function limpiarLecturaTablero(j: TableroLeido): TableroLeido {
  return {
    ...j,
    circuitos: j.circuitos.map((c) => (!c.destino && !c.etiquetaExtra ? { ...c, etiquetaExtra: "SIN ETIQUETA" } : c)),
  };
}

// ---------- Controles / sospechas (ver leer_tablero.py#controles) ----------

export interface ControlLectura {
  donde: string;
  que: string;
}

function ampNum(s: string | null): number | null {
  if (!s) return null;
  const n = Number(s.toUpperCase().replace("A", "").trim());
  return Number.isFinite(n) ? n : null;
}

export interface ResultadoControles {
  /** Para resaltar en la pantalla de revisión — "esto está vacío o es dudoso, miralo". */
  aConfirmar: ControlLectura[];
  /** Controles que no pasan — se muestran como advertencia, no bloquean. */
  avisos: string[];
}

export function controlarLecturaTablero(j: TableroLeido): ResultadoControles {
  const aConfirmar: ControlLectura[] = [];
  const avisos: string[] = [];

  if (!j.general.calibre || j.general.confirmar) aConfirmar.push({ donde: "Cabecera", que: "Calibre de la térmica general" });
  const gCal = ampNum(j.general.calibre);
  const pCal = ampNum(j.protector.calibre);
  if (gCal != null && pCal != null && gCal !== pCal) avisos.push(`Protector (${j.protector.calibre}) distinto de la general (${j.general.calibre})`);
  for (const [campo, valor] of [
    ["nombre", j.tablero.nombre],
    ["obra", j.tablero.obra],
    ["alimentacion", j.tablero.alimentacion],
  ] as const) {
    if (!valor) aConfirmar.push({ donde: "Tablero", que: campo });
  }

  // Sospecha de calibre "por costumbre" (ENCARGO.md #3): si TODOS los
  // circuitos comparten exactamente el mismo dif_in (o el mismo term_in),
  // es más probable que el modelo haya completado por hábito que que el
  // tablero entero use un único calibre real — se marca para revisar, no
  // se descarta el valor.
  const difs = j.circuitos.map((c) => c.difIn).filter((v): v is string => v != null);
  const terms = j.circuitos.map((c) => c.termIn).filter((v): v is string => v != null);
  const todosIguales = (xs: string[]) => xs.length >= 3 && xs.every((x) => x === xs[0]);
  if (todosIguales(difs)) avisos.push(`Sospechoso: los ${difs.length} disyuntores leídos tienen todos el mismo calibre (${difs[0]}) — confirmar que no sea un valor repetido por costumbre.`);
  if (todosIguales(terms)) avisos.push(`Sospechoso: las ${terms.length} térmicas leídas tienen todas el mismo calibre (${terms[0]}) — confirmar que no sea un valor repetido por costumbre.`);

  j.circuitos.forEach((c, i) => {
    const cod = `C${String(i + 1).padStart(2, "0")}`;
    const faltan = [c.difIn ? null : "disyuntor", c.termIn ? null : "térmica"].filter((x): x is string => x != null);
    if (faltan.length) aConfirmar.push({ donde: cod, que: `Calibre de ${faltan.join(" y ")}` });
    if (c.etiquetaConflicto) aConfirmar.push({ donde: cod, que: `Etiquetas distintas: "${c.destino ?? ""}" / "${c.etiquetaExtra ?? ""}"` });
    if (!c.destino) aConfirmar.push({ donde: cod, que: "Sin etiqueta original" });
    const d = ampNum(c.difIn);
    const t = ampNum(c.termIn);
    if (d != null && t != null && d < t) avisos.push(`${cod}: disyuntor ${c.difIn} menor que la térmica ${c.termIn}`);
  });

  const off = j.circuitos.map((c, i) => (c.estado === "OFF" ? `C${String(i + 1).padStart(2, "0")}` : null)).filter((x): x is string => x != null);
  if (off.length) aConfirmar.push({ donde: "Estado", que: `OFF en foto: ${off.join(", ")}` });
  aConfirmar.push({ donde: "Todos", que: "Fases, borneras y secciones de cable (no visibles en fotos)" });

  return { aConfirmar, avisos };
}

// ---------- Adaptador al formato del motor (tablero_circuitos / UnifilarCircuito) ----------

export interface CircuitoAdaptadoMotor {
  numero: number;
  texto: string;
  categoriaEquipo: TableroCategoriaEquipo;
  tipoCircuito: TableroTipoCircuito;
  ampNominal: string | null;
  cuerpo: string | null;
  alimentadoPorUps: boolean;
  rolBypassUps: null;
  padreNumero: number | null;
  etiquetaCable: string | null;
  /** true cuando el texto no viene de una etiqueta legible (o hay conflicto de etiquetas) — mismo criterio que "identificado" en /api/tableros/leer-foto. */
  revisar: boolean;
  /** Posición de la palanca leída en la foto — null si no aplica (general/protector/descargador) o no se pudo leer. */
  estadoDetectado: "Cerrado" | "Abierto" | null;
}

/**
 * Desdobla cada "circuito" leído (un objeto = térmica+disyuntor combinados,
 * ver Fase 0) en las filas que espera `tablero_circuitos` (una por
 * protección, encadenadas por padreNumero) — nunca dibuja ni guarda nada,
 * solo arma la lista para precargar la pantalla de revisión.
 *
 * Orden disyuntor→térmica (no al revés) y la convención de texto
 * "<destino> - INT. DIFER."/"- INT. TERMOM." confirmados contra
 * FIXTURE_UNIFILAR (circuitos reales de este mismo tablero ya cargados en
 * producción, ver scripts/dev-unifilar-fixture.ts) — no es una elección
 * arbitraria, es lo que esta app ya tiene para Tablero de Prueba 11.
 */
export function adaptarACircuitosDelMotor(j: TableroLeido): CircuitoAdaptadoMotor[] {
  const filas: CircuitoAdaptadoMotor[] = [];

  // 1: térmica general.
  filas.push({
    numero: 1,
    texto: j.tablero.nombre ?? "INTERRUPTOR GRAL.",
    categoriaEquipo: "termica",
    tipoCircuito: "220v_mono",
    ampNominal: j.general.calibre,
    cuerpo: null,
    alimentadoPorUps: false,
    rolBypassUps: null,
    padreNumero: null,
    etiquetaCable: null,
    revisar: !j.general.calibre || j.general.confirmar,
    estadoDetectado: null,
  });

  // 2-3: protector de sobretensión, si se leyó algo — térmica propia (cuelga de la general) + descargador (sin padre, mismo criterio que FIXTURE_UNIFILAR).
  let siguiente = 2;
  if (j.protector.calibre || j.protector.modelo) {
    filas.push({
      numero: siguiente,
      texto: "PROTEC. SOBRETENS. ATMOSF. - INTERRUPTOR",
      categoriaEquipo: "termica",
      tipoCircuito: "220v_mono",
      ampNominal: j.protector.calibre,
      cuerpo: null,
      alimentadoPorUps: false,
      rolBypassUps: null,
      padreNumero: 1,
      etiquetaCable: null,
      revisar: !j.protector.calibre,
      estadoDetectado: null,
    });
    siguiente++;
    filas.push({
      numero: siguiente,
      texto: j.protector.modelo ? `PROTEC. SOBRETENS. ATMOSF. - DESCARGADOR (${j.protector.modelo})` : "PROTEC. SOBRETENS. ATMOSF. - DESCARGADOR",
      categoriaEquipo: "descargador_gaseoso",
      tipoCircuito: "220v_mono",
      ampNominal: null,
      cuerpo: null,
      alimentadoPorUps: false,
      rolBypassUps: null,
      padreNumero: null,
      etiquetaCable: null,
      revisar: false,
      estadoDetectado: null,
    });
    siguiente++;
  }

  for (const c of j.circuitos) {
    const base = c.destino ?? c.etiquetaExtra ?? "SIN ETIQUETA";
    const numDisyuntor = siguiente;
    const numTermica = siguiente + 1;
    const revisar = !c.destino || c.etiquetaConflicto;
    const estadoDetectado: "Cerrado" | "Abierto" = c.estado === "OFF" ? "Abierto" : "Cerrado";
    filas.push({
      numero: numDisyuntor,
      texto: `${base} - INT. DIFER.`,
      categoriaEquipo: "disyuntor",
      tipoCircuito: "220v_mono",
      ampNominal: c.difIn,
      cuerpo: null,
      alimentadoPorUps: false,
      rolBypassUps: null,
      padreNumero: 1,
      etiquetaCable: null,
      revisar,
      estadoDetectado,
    });
    filas.push({
      numero: numTermica,
      texto: `${base} - INT. TERMOM.`,
      categoriaEquipo: "termica",
      tipoCircuito: "220v_mono",
      ampNominal: c.termIn,
      cuerpo: null,
      alimentadoPorUps: false,
      rolBypassUps: null,
      padreNumero: numDisyuntor,
      etiquetaCable: null,
      revisar,
      estadoDetectado,
    });
    siguiente += 2;
  }

  return filas;
}
