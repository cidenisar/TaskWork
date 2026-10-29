import { createServiceRoleClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, UmbralAviso } from "@/lib/database.types";

const BUCKET_VIVO = "informes-pdf";
const BUCKET_ARCHIVO = "informes-pdf-archivo";

const SEMANAS_POR_UMBRAL: Record<UmbralAviso, number> = { "20": 4, "50": 8, "100": 12 };

export interface ErrorLiberacion {
  tabla: string;
  id: string;
  error: string;
}

export interface ResultadoLiberacion {
  activa: boolean;
  corte: string | null;
  procesados: number;
  liberados: number;
  errores: ErrorLiberacion[];
}

type Service = SupabaseClient<Database>;

/**
 * Copia el PDF a informes-pdf-archivo (mismo path) y recién después borra el
 * original de informes-pdf — si la copia falla, el original queda intacto;
 * nunca se borra sin haber confirmado el backup primero.
 */
async function archivarPdf(service: Service, path: string): Promise<void> {
  const { error: copyError } = await service.storage.from(BUCKET_VIVO).copy(path, path, { destinationBucket: BUCKET_ARCHIVO });
  if (copyError) throw new Error(`No se pudo copiar al backup: ${copyError.message}`);
  const { error: removeError } = await service.storage.from(BUCKET_VIVO).remove([path]);
  if (removeError) throw new Error(`Se copió al backup pero no se pudo borrar el original: ${removeError.message}`);
}

interface LoteResultado {
  procesados: number;
  liberados: number;
}

async function liberarInformesTecnicos(service: Service, corteIso: string, errores: ErrorLiberacion[]): Promise<LoteResultado> {
  const { data } = await service
    .from("informes_tecnicos")
    .select("id, pdf_url")
    .eq("estado", "generado")
    .not("pdf_url", "is", null)
    .lt("fecha", corteIso);
  let liberados = 0;
  for (const fila of data ?? []) {
    if (!fila.pdf_url) continue;
    try {
      await archivarPdf(service, fila.pdf_url);
      await service.from("informes_tecnicos").update({ pdf_url: null }).eq("id", fila.id);
      liberados++;
    } catch (err) {
      errores.push({ tabla: "informes_tecnicos", id: fila.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { procesados: data?.length ?? 0, liberados };
}

async function liberarRendicionesGastos(service: Service, corteIso: string, errores: ErrorLiberacion[]): Promise<LoteResultado> {
  const { data } = await service
    .from("rendiciones_gastos")
    .select("id, pdf_url")
    .eq("estado", "cerrada")
    .not("pdf_url", "is", null)
    .lt("fecha", corteIso);
  let liberados = 0;
  for (const fila of data ?? []) {
    if (!fila.pdf_url) continue;
    try {
      await archivarPdf(service, fila.pdf_url);
      await service.from("rendiciones_gastos").update({ pdf_url: null }).eq("id", fila.id);
      liberados++;
    } catch (err) {
      errores.push({ tabla: "rendiciones_gastos", id: fila.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { procesados: data?.length ?? 0, liberados };
}

async function liberarTableroMediciones(service: Service, corteIso: string, errores: ErrorLiberacion[]): Promise<LoteResultado> {
  const { data } = await service.from("tablero_mediciones").select("id, pdf_url").not("pdf_url", "is", null).lt("fecha", corteIso);
  let liberados = 0;
  for (const fila of data ?? []) {
    if (!fila.pdf_url) continue;
    try {
      await archivarPdf(service, fila.pdf_url);
      await service.from("tablero_mediciones").update({ pdf_url: null }).eq("id", fila.id);
      liberados++;
    } catch (err) {
      errores.push({ tabla: "tablero_mediciones", id: fila.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { procesados: data?.length ?? 0, liberados };
}

async function liberarRackRelevamientos(service: Service, corteIso: string, errores: ErrorLiberacion[]): Promise<LoteResultado> {
  const { data } = await service.from("rack_relevamientos").select("id, pdf_url").not("pdf_url", "is", null).lt("fecha", corteIso);
  let liberados = 0;
  for (const fila of data ?? []) {
    if (!fila.pdf_url) continue;
    try {
      await archivarPdf(service, fila.pdf_url);
      await service.from("rack_relevamientos").update({ pdf_url: null }).eq("id", fila.id);
      liberados++;
    } catch (err) {
      errores.push({ tabla: "rack_relevamientos", id: fila.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { procesados: data?.length ?? 0, liberados };
}

async function liberarEquipoRelevamientos(service: Service, corteIso: string, errores: ErrorLiberacion[]): Promise<LoteResultado> {
  const { data } = await service.from("equipo_relevamientos").select("id, pdf_url").not("pdf_url", "is", null).lt("fecha", corteIso);
  let liberados = 0;
  for (const fila of data ?? []) {
    if (!fila.pdf_url) continue;
    try {
      await archivarPdf(service, fila.pdf_url);
      await service.from("equipo_relevamientos").update({ pdf_url: null }).eq("id", fila.id);
      liberados++;
    } catch (err) {
      errores.push({ tabla: "equipo_relevamientos", id: fila.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { procesados: data?.length ?? 0, liberados };
}

async function liberarBajasEquipamiento(service: Service, corteIso: string, errores: ErrorLiberacion[]): Promise<LoteResultado> {
  const { data } = await service.from("bajas_equipamiento").select("id, pdf_url").not("pdf_url", "is", null).lt("fecha", corteIso);
  let liberados = 0;
  for (const fila of data ?? []) {
    if (!fila.pdf_url) continue;
    try {
      await archivarPdf(service, fila.pdf_url);
      await service.from("bajas_equipamiento").update({ pdf_url: null }).eq("id", fila.id);
      liberados++;
    } catch (err) {
      errores.push({ tabla: "bajas_equipamiento", id: fila.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { procesados: data?.length ?? 0, liberados };
}

/**
 * Libera del storage "caliente" (bucket informes-pdf) los PDFs más viejos
 * que el umbral configurado en Configuración → Historial y almacenamiento,
 * SOLO si el Administrador activó el switch "Liberar archivos
 * automáticamente" (apagado por default — por eso, sin activar nada, esto
 * sigue siendo un no-op y el comportamiento de la app no cambia).
 *
 * Nunca borra sin backup: cada PDF se copia primero a informes-pdf-archivo
 * (mismo path) y recién si esa copia confirma éxito se borra el original.
 * El registro en la tabla de origen (título, fecha, técnicos, etc.) nunca
 * se toca más que para vaciar `pdf_url` — queda para siempre, como ya
 * establece el modelo dato-vs-archivo del historial (spec 6.5). Las fotos
 * quedan fuera de este incremento: a diferencia del PDF (inmutable una vez
 * generado), varias quedan referenciadas desde flujos de edición
 * (Informe Técnico) que necesitan su propio diseño antes de tocarlas.
 */
export async function ejecutarLiberacionAutomatica(): Promise<ResultadoLiberacion> {
  const service = createServiceRoleClient();

  const { data: config } = await service
    .from("config_general")
    .select("liberacion_automatica_activa, umbral_aviso_historial")
    .eq("id", 1)
    .single();

  if (!config?.liberacion_automatica_activa) {
    return { activa: false, corte: null, procesados: 0, liberados: 0, errores: [] };
  }

  const semanas = SEMANAS_POR_UMBRAL[config.umbral_aviso_historial];
  const corte = new Date();
  corte.setDate(corte.getDate() - semanas * 7);
  const corteIso = corte.toISOString();

  const errores: ErrorLiberacion[] = [];
  const lotes = await Promise.all([
    liberarInformesTecnicos(service, corteIso, errores),
    liberarRendicionesGastos(service, corteIso, errores),
    liberarTableroMediciones(service, corteIso, errores),
    liberarRackRelevamientos(service, corteIso, errores),
    liberarEquipoRelevamientos(service, corteIso, errores),
    liberarBajasEquipamiento(service, corteIso, errores),
  ]);

  return {
    activa: true,
    corte: corteIso,
    procesados: lotes.reduce((acc, l) => acc + l.procesados, 0),
    liberados: lotes.reduce((acc, l) => acc + l.liberados, 0),
    errores,
  };
}
