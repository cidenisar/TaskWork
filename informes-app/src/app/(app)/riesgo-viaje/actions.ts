"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireProfile, requireSuperusuario } from "@/lib/auth";
import { filenameDesdeStoragePath } from "@/lib/pdf/filename";
import { eliminarRegistroConArchivos, type EliminarResult } from "@/lib/admin/eliminar-registro";
import { cargarGuardiaGeneralActual } from "@/lib/guardia/datos";
import { notificar } from "@/lib/guardia/notificar";
import type { EstadoViaje } from "@/lib/database.types";

export interface ActualizarEstadoViajeResult {
  success: boolean;
  error?: string;
  /** Solo cuando la acción fue "iniciar" — para que quien inició el viaje pueda avisar por WhatsApp a la guardia general (el aviso garantizado ya es el push). */
  avisoWhatsapp?: { telefono: string | null; texto: string };
}

export interface UrlPdfResult {
  url: string | null;
  filename?: string;
  error?: string;
}

/** RLS (evaluaciones_riesgo_viaje_select_own) ya limita esto a evaluaciones propias, o todas si sos Admin/Supervisor. */
export async function obtenerUrlPdfRiesgoViajeAction(evaluacionId: string): Promise<UrlPdfResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: evaluacion, error } = await supabase.from("evaluaciones_riesgo_viaje").select("pdf_url").eq("id", evaluacionId).single();
  if (error || !evaluacion?.pdf_url) {
    return { url: null, error: "El PDF ya no está disponible." };
  }

  const { data: signed, error: signErr } = await supabase.storage.from("informes-pdf").createSignedUrl(evaluacion.pdf_url, 60 * 15);
  if (signErr || !signed) {
    return { url: null, error: "No se pudo generar el link de descarga." };
  }
  return { url: signed.signedUrl, filename: filenameDesdeStoragePath(evaluacion.pdf_url) };
}

/**
 * Avanza el estado del viaje un paso a la vez — lo hace quien cargó la
 * evaluación, a medida que viaja, o un Admin/Supervisor si hace falta
 * corregirlo. "En punto medio" solo existe en el camino cuando la
 * evaluación tiene un punto medio cargado (viajes largos); si no lo tiene,
 * "iniciado" pasa directo a "finalizado" — no tiene sentido pedir un paso
 * que no aplica a ese viaje. No regenera el PDF ni reenvía el mail: el
 * registro de riesgo ya quedó hecho al crearla, esto es solo el
 * seguimiento en vivo para la "evolución" en el Panel.
 */
export async function actualizarEstadoViajeAction(
  evaluacionId: string,
  accion: "iniciar" | "marcar_punto_medio" | "finalizar",
): Promise<ActualizarEstadoViajeResult> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: evaluacion } = await supabase
    .from("evaluaciones_riesgo_viaje")
    .select("estado_viaje, created_by, punto_medio, origen, destino, conductor_nombre, numero_generacion")
    .eq("id", evaluacionId)
    .single();
  if (!evaluacion) return { success: false, error: "No se encontró la evaluación." };

  const esDueño = evaluacion.created_by === profile.id;
  const esAdmin = profile.rol === "admin" || profile.rol === "supervisor" || profile.rol === "superusuario";
  if (!esDueño && !esAdmin) return { success: false, error: "No podés actualizar este viaje." };

  const tienePuntoMedio = Boolean(evaluacion.punto_medio);
  const siguiente: Partial<Record<EstadoViaje, { estado: EstadoViaje; campoFecha: "iniciado_at" | "punto_medio_at" | "finalizado_at" }>> = {
    pendiente: { estado: "iniciado", campoFecha: "iniciado_at" },
    iniciado: tienePuntoMedio ? { estado: "en_punto_medio", campoFecha: "punto_medio_at" } : { estado: "finalizado", campoFecha: "finalizado_at" },
    en_punto_medio: { estado: "finalizado", campoFecha: "finalizado_at" },
  };
  const paso = siguiente[evaluacion.estado_viaje];
  if (!paso) return { success: false, error: "Este viaje ya está finalizado." };

  const accionDelPaso: Record<EstadoViaje, "iniciar" | "marcar_punto_medio" | "finalizar"> = {
    iniciado: "marcar_punto_medio",
    en_punto_medio: "finalizar",
    finalizado: "finalizar",
    pendiente: "iniciar",
  };
  const accionEsperada = paso.estado === "finalizado" ? "finalizar" : accionDelPaso[evaluacion.estado_viaje];
  if (accionEsperada !== accion) {
    return { success: false, error: "El estado de este viaje ya cambió — refrescá la pantalla." };
  }

  const ahora = new Date().toISOString();
  const campos =
    paso.campoFecha === "iniciado_at"
      ? { estado_viaje: paso.estado, iniciado_at: ahora }
      : paso.campoFecha === "punto_medio_at"
        ? { estado_viaje: paso.estado, punto_medio_at: ahora }
        : { estado_viaje: paso.estado, finalizado_at: ahora };
  const { error } = await supabase.from("evaluaciones_riesgo_viaje").update(campos).eq("id", evaluacionId);
  if (error) return { success: false, error: error.message };

  revalidatePath("/riesgo-viaje/historial");
  revalidatePath("/panel/riesgo-viaje");

  let avisoWhatsapp: ActualizarEstadoViajeResult["avisoWhatsapp"];
  if (accion === "iniciar") {
    const texto = `Inició viaje: ${evaluacion.origen} → ${evaluacion.destino} — ${evaluacion.conductor_nombre} (${evaluacion.numero_generacion})`;
    const guardia = await cargarGuardiaGeneralActual(supabase);
    if (guardia) {
      await notificar(guardia.usuarioId, "viaje_iniciado", "evaluacion_riesgo_viaje", evaluacionId, {
        title: "Inició un viaje",
        body: texto,
        url: "/riesgo-viaje/historial",
      });
    }
    avisoWhatsapp = { telefono: guardia?.telefono ?? null, texto };
  }

  return { success: true, avisoWhatsapp };
}

/** Solo Superusuario — mismo gate que el resto de los "Eliminar" de la app. Borra la evaluación (sus acompañantes caen en cascada por FK) y el PDF del storage. */
export async function eliminarEvaluacionRiesgoViajeAction(evaluacionId: string): Promise<EliminarResult> {
  const profile = await requireSuperusuario();
  const service = createServiceRoleClient();

  const { data: evaluacion } = await service
    .from("evaluaciones_riesgo_viaje")
    .select("pdf_url, numero_generacion, origen, destino")
    .eq("id", evaluacionId)
    .single();

  const resultado = await eliminarRegistroConArchivos(
    service,
    profile,
    "evaluaciones_riesgo_viaje",
    evaluacionId,
    [{ bucket: "informes-pdf", path: evaluacion?.pdf_url ?? null }],
    `Eliminó la evaluación de riesgo de viaje ${evaluacion?.numero_generacion ?? evaluacionId} (${evaluacion?.origen ?? "?"} → ${evaluacion?.destino ?? "?"})`,
  );
  if (resultado.success) {
    revalidatePath("/riesgo-viaje/historial");
    revalidatePath("/panel/riesgo-viaje");
  }
  return resultado;
}
