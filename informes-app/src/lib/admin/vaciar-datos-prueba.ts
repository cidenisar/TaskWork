import { createServiceRoleClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type Service = SupabaseClient<Database>;

export interface ResultadoVaciado {
  success: boolean;
  error?: string;
}

// Orden importante por las FK entre tablas (ver migraciones de cada módulo):
// las que tienen RESTRICT hacia su "padre" (tablero_mediciones→tableros,
// rack_relevamientos→racks) van antes que el padre, y equipo_relevamiento_lecturas
// va antes que equipos porque esa FK es NO ACTION (no se resuelve sola en
// cascada). Los hijos con CASCADE (circuitos, mantenimientos, equipamientos,
// gastos, imágenes, asignados) no hace falta listarlos acá — caen solos.
const TABLAS_EN_ORDEN: (keyof Database["public"]["Tables"])[] = [
  "tablero_mediciones",
  "tableros",
  "rack_relevamientos",
  "racks",
  "equipo_relevamiento_lecturas",
  "equipo_relevamientos",
  "equipos",
  "bajas_equipamiento",
  "informes_tecnicos",
  "rendiciones_gastos",
];

const BUCKETS_A_VACIAR = ["informes-pdf", "informe-fotos", "comprobantes", "informes-pdf-archivo"];

async function vaciarBucket(service: Service, bucket: string, prefix = ""): Promise<void> {
  const { data: entradas } = await service.storage.from(bucket).list(prefix, { limit: 1000 });
  if (!entradas || entradas.length === 0) return;
  const archivos: string[] = [];
  for (const entrada of entradas) {
    const path = prefix ? `${prefix}/${entrada.name}` : entrada.name;
    // Una "carpeta" en Storage no tiene id propio — solo los archivos reales lo tienen.
    if (entrada.id === null) {
      await vaciarBucket(service, bucket, path);
    } else {
      archivos.push(path);
    }
  }
  if (archivos.length > 0) await service.storage.from(bucket).remove(archivos);
}

/**
 * Borra TODO lo cargado en los módulos operativos — Informes Técnicos,
 * Rendiciones de Gastos, Tableros (equipo + mediciones + mantenimientos),
 * Racks (equipo + relevamientos), Equipos Individuales (equipo +
 * relevamientos) y Bajas de Equipamiento — y vacía los buckets de PDFs/
 * fotos. Pensado para limpiar datos de prueba antes de ir a producción
 * real, no para uso diario (para eso está el borrado fila por fila en
 * cada Historial). Nunca toca Ubicaciones, catálogos, usuarios ni
 * Configuración — eso no es "dato de prueba", es la base de la app.
 */
export async function ejecutarVaciarDatosPrueba(): Promise<ResultadoVaciado> {
  const service = createServiceRoleClient();

  for (const tabla of TABLAS_EN_ORDEN) {
    const { error } = await service.from(tabla).delete().not("id", "is", null);
    if (error) return { success: false, error: `Falló al borrar ${tabla}: ${error.message}` };
  }

  for (const bucket of BUCKETS_A_VACIAR) {
    await vaciarBucket(service, bucket);
  }

  return { success: true };
}
