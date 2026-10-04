"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/config/audit";
import { ejecutarVaciarDatosPrueba, type ResultadoVaciado } from "@/lib/admin/vaciar-datos-prueba";

/**
 * Solo Administrador. Pensado para limpiar datos de prueba antes de ir a
 * producción real — borra TODO lo cargado en Informes, Rendiciones,
 * Tableros, Racks, Equipos y Bajas (equipo + historial), y vacía los
 * buckets de PDFs/fotos. Nunca toca Ubicaciones, catálogos, usuarios ni
 * el resto de Configuración.
 */
export async function vaciarDatosPruebaAction(): Promise<ResultadoVaciado> {
  const profile = await requireAdmin();
  const resultado = await ejecutarVaciarDatosPrueba();

  if (resultado.success) {
    const supabase = await createClient();
    await logAudit(supabase, profile, "Vació los datos de prueba (Informes, Rendiciones, Tableros, Racks, Equipos y Bajas)");
    revalidatePath("/", "layout");
  }

  return resultado;
}
