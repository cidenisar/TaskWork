"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/config/audit";

export interface ResumenEliminarEquipo {
  mantenimientos: number;
  programaciones: number;
  tareasVinculadas: number;
  lecturasRelevamiento: number;
  materialesDeInforme: number;
  bajas: number;
  entregasDeposito: number;
}

export interface ResumenEliminarEquipoResult {
  success: boolean;
  error?: string;
  resumen?: ResumenEliminarEquipo;
}

export interface EliminarEquipoDefinitivoResult {
  success: boolean;
  error?: string;
}

type Service = ReturnType<typeof createServiceRoleClient>;

async function contar(
  service: Service,
  tabla: "mantenimientos_equipamiento" | "mantenimiento_programaciones" | "tareas_pendientes" | "bajas_equipamiento",
  equipoId: string,
  tipoColumna: string,
): Promise<number> {
  const { count } = await service
    .from(tabla)
    .select("id", { count: "exact", head: true })
    .eq("equipo_id", equipoId)
    .eq(tipoColumna, "equipo_individual");
  return count ?? 0;
}

async function armarResumen(service: Service, equipoId: string): Promise<ResumenEliminarEquipo> {
  const [mantenimientos, programaciones, tareasVinculadas, bajas, lecturas, materiales, entregas] = await Promise.all([
    contar(service, "mantenimientos_equipamiento", equipoId, "tipo_equipo"),
    contar(service, "mantenimiento_programaciones", equipoId, "tipo_equipo"),
    contar(service, "tareas_pendientes", equipoId, "equipo_tipo"),
    contar(service, "bajas_equipamiento", equipoId, "tipo_equipo"),
    service.from("equipo_relevamiento_lecturas").select("id", { count: "exact", head: true }).eq("equipo_id", equipoId),
    service.from("informe_materiales").select("id", { count: "exact", head: true }).eq("equipo_id", equipoId),
    service
      .from("entregas_deposito")
      .select("id", { count: "exact", head: true })
      .eq("equipo_id", equipoId)
      .eq("tipo_equipo", "equipo_individual"),
  ]);
  return {
    mantenimientos,
    programaciones,
    tareasVinculadas,
    lecturasRelevamiento: lecturas.count ?? 0,
    materialesDeInforme: materiales.count ?? 0,
    bajas,
    entregasDeposito: entregas.count ?? 0,
  };
}

function getService(): Service | null {
  try {
    return createServiceRoleClient();
  } catch {
    return null;
  }
}

/** Cuenta lo que tiene colgado un equipo, para mostrarlo en el aviso antes de borrarlo. Solo Administrador. */
export async function resumenEliminarEquipoAction(equipoId: string): Promise<ResumenEliminarEquipoResult> {
  const profile = await requireProfile();
  if (profile.rol !== "admin" && profile.rol !== "superusuario") {
    return { success: false, error: "Solo un Administrador puede eliminar un equipo definitivamente." };
  }
  const service = getService();
  if (!service) return { success: false, error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." };
  return { success: true, resumen: await armarResumen(service, equipoId) };
}

/**
 * Borra de verdad un equipo individual (no es una baja: la fila desaparece).
 * Pensado para corregir cargas hechas por error o repetir pruebas.
 *
 * Qué pasa con lo que tenía colgado:
 *  - Se borran: lecturas de relevamiento, mantenimientos registrados (con su
 *    foto y PDF) y la programación de mantenimiento.
 *  - Se desvinculan (quedan, sin equipo): tareas pendientes, líneas de
 *    materiales de informes y equipos que decían "reemplaza a este".
 *  - Se conservan: bajas y entregas a depósito, que son comprobantes
 *    numerados con su propio PDF (el texto del equipo queda guardado en ellos).
 */
export async function eliminarEquipoDefinitivoAction(equipoId: string): Promise<EliminarEquipoDefinitivoResult> {
  const profile = await requireProfile();
  if (profile.rol !== "admin" && profile.rol !== "superusuario") {
    return { success: false, error: "Solo un Administrador puede eliminar un equipo definitivamente." };
  }
  const service = getService();
  if (!service) return { success: false, error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." };

  const { data: equipo } = await service
    .from("equipos")
    .select("id, texto, marca_modelo, numero_serie, etiqueta_ypf, ubicacion_id")
    .eq("id", equipoId)
    .maybeSingle();
  if (!equipo) return { success: false, error: "No se encontró el equipo (quizás ya fue eliminado)." };

  const resumen = await armarResumen(service, equipoId);

  // Archivos de los mantenimientos: se leen antes de borrar las filas.
  const { data: mants } = await service
    .from("mantenimientos_equipamiento")
    .select("foto_url, pdf_url")
    .eq("equipo_id", equipoId)
    .eq("tipo_equipo", "equipo_individual");
  const fotos = (mants ?? []).map((m) => m.foto_url).filter((p): p is string => !!p);
  const pdfs = (mants ?? []).map((m) => m.pdf_url).filter((p): p is string => !!p);

  // 1) Desvincular (nunca bloquean el borrado, pero no queremos dejar punteros colgados).
  const desvincular = await Promise.all([
    service.from("tareas_pendientes").update({ equipo_tipo: null, equipo_id: null }).eq("equipo_id", equipoId).eq("equipo_tipo", "equipo_individual"),
    service.from("informe_materiales").update({ equipo_id: null }).eq("equipo_id", equipoId),
    service.from("equipos").update({ reemplaza_equipo_id: null, reemplaza_tipo: null }).eq("reemplaza_equipo_id", equipoId),
  ]);
  const errDesvincular = desvincular.find((r) => r.error)?.error;
  if (errDesvincular) return { success: false, error: `No se pudo desvincular lo relacionado: ${errDesvincular.message}` };

  // 2) Borrar lo que es propio del equipo (las FK sin cascada tienen que ir antes que la fila).
  const borrados = await Promise.all([
    service.from("equipo_relevamiento_lecturas").delete().eq("equipo_id", equipoId),
    service.from("mantenimientos_equipamiento").delete().eq("equipo_id", equipoId).eq("tipo_equipo", "equipo_individual"),
    service.from("mantenimiento_programaciones").delete().eq("equipo_id", equipoId).eq("tipo_equipo", "equipo_individual"),
  ]);
  const errBorrado = borrados.find((r) => r.error)?.error;
  if (errBorrado) return { success: false, error: `No se pudo borrar lo asociado al equipo: ${errBorrado.message}` };

  // 3) El equipo en sí.
  const { error } = await service.from("equipos").delete().eq("id", equipoId);
  if (error) return { success: false, error: error.message };

  // 4) Archivos (si falla la limpieza no se deshace el borrado: solo quedan huérfanos).
  if (fotos.length > 0) await service.storage.from("informe-fotos").remove(fotos);
  if (pdfs.length > 0) await service.storage.from("informes-pdf").remove(pdfs);

  const identificadores = [equipo.marca_modelo, equipo.numero_serie && `serie ${equipo.numero_serie}`, equipo.etiqueta_ypf && `YPF ${equipo.etiqueta_ypf}`]
    .filter(Boolean)
    .join(", ");
  const supabase = await createClient();
  await logAudit(
    supabase,
    profile,
    `Eliminó definitivamente el equipo "${equipo.texto}"${identificadores ? ` (${identificadores})` : ""} — ` +
      `mantenimientos borrados: ${resumen.mantenimientos}, tareas desvinculadas: ${resumen.tareasVinculadas}, ` +
      `lecturas de relevamiento borradas: ${resumen.lecturasRelevamiento}`,
  );

  revalidatePath("/", "layout");
  return { success: true };
}
