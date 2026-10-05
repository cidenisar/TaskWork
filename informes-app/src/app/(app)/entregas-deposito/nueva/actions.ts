"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { puedeGestionarDeposito } from "@/lib/types";
import { resolverUbicacionId, tagGpsSiFalta, type PayloadUbicacionNueva, type PayloadGps } from "@/lib/ubicaciones/resolver";
import { crearEntregaDepositoLote, type MaterialLoteDeposito } from "@/lib/deposito/crear-lote";

export interface EntregarLoteADepositoPayload {
  ubicacionId: string | null;
  ubicacionNueva: PayloadUbicacionNueva | null;
  gps: PayloadGps | null;
  fecha: string;
  materiales: MaterialLoteDeposito[];
}

export interface EntregarLoteADepositoResult {
  success: boolean;
  error?: string;
  numeroGeneracion?: string;
}

/**
 * Entrega a depósito de material/equipo que NUNCA se registró como
 * equipamiento de un sitio (cables sueltos, repuestos, equipo nuevo sin
 * instalar) — no hay fila de tablero/rack/equipo que tocar, así que no
 * hace falta Service Role: la policy de INSERT/UPDATE de
 * `entregas_deposito` ya exige Admin/Supervisor, igual que el gate de la
 * UI.
 *
 * Una misma carga puede traer VARIOS materiales distintos de la misma
 * visita (ej. sacando fotos de todos juntos) — cada material queda como
 * su propia fila en `entregas_deposito`, pero todas comparten un solo
 * N° de generación y un solo PDF (una tabla con todos los materiales),
 * igual criterio que el relevamiento de Equipos Individuales. La lógica
 * de generar el número/insertar/subir el PDF vive en
 * `crearEntregaDepositoLote` — también la usa la devolución automática de
 * sobrantes de Instalación.
 */
export async function entregarLoteADepositoAction(formData: FormData): Promise<EntregarLoteADepositoResult> {
  const raw = formData.get("payload");
  if (typeof raw !== "string") {
    return { success: false, error: "Faltan datos de la entrega." };
  }
  let payload: EntregarLoteADepositoPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { success: false, error: "Faltan datos de la entrega." };
  }
  const fotosEvidencia = formData.getAll("fotosEvidencia").filter((f): f is File => f instanceof File);

  const profile = await requireProfile();
  if (!puedeGestionarDeposito(profile.rol)) {
    return { success: false, error: "Solo un Administrador o Supervisor puede entregar material a depósito." };
  }
  if (payload.materiales.length === 0) return { success: false, error: "Agregá al menos un material." };
  if (payload.materiales.some((m) => !m.descripcion.trim())) {
    return { success: false, error: "Completá la descripción de todos los materiales cargados." };
  }
  if (!payload.fecha) return { success: false, error: "Falta la fecha." };

  const supabase = await createClient();

  const ubicacionResuelta = await resolverUbicacionId(
    supabase,
    { ubicacionId: payload.ubicacionId, ubicacionNueva: payload.ubicacionNueva },
    profile.id,
    "la entrega a depósito",
  );
  if ("error" in ubicacionResuelta) return { success: false, error: ubicacionResuelta.error };
  await tagGpsSiFalta(supabase, ubicacionResuelta.id, payload.gps, profile.id);

  const { data: ubicacion } = await supabase
    .from("ubicaciones")
    .select("region, provincia, localidad, sitio, planta, oficina")
    .eq("id", ubicacionResuelta.id)
    .single();
  if (!ubicacion) return { success: false, error: "No se encontró la ubicación elegida." };

  const fotosEvidenciaBuffers = await Promise.all(fotosEvidencia.slice(0, 2).map(async (f) => Buffer.from(await f.arrayBuffer())));

  const resultado = await crearEntregaDepositoLote({
    supabase,
    ubicacionId: ubicacionResuelta.id,
    ubicacion,
    fecha: payload.fecha,
    materiales: payload.materiales,
    createdBy: profile.id,
    realizoNombre: profile.nombreCompleto,
    fotosEvidencia: fotosEvidenciaBuffers,
  });
  if (!resultado.success) return resultado;

  revalidatePath("/entregas-deposito/historial");
  return resultado;
}
