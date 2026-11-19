"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { resolverUbicacionId, tagGpsSiFalta, type PayloadUbicacionNueva, type PayloadGps } from "@/lib/ubicaciones/resolver";
import { buscarEquipoDuplicado } from "@/lib/equipos/duplicados";
import { resolverEquipo } from "@/lib/equipamiento/resolver-equipo";
import { nuevoNumeroGeneracionEntrega } from "@/lib/deposito/numero-generacion";
import { labelUbicacion } from "@/components/ubicaciones/types";
import type { EquipoCategoria, TipoMontajeCamara } from "@/lib/database.types";

export interface PayloadMaterialAlta {
  categoriaEquipo: EquipoCategoria;
  descripcion: string;
  marcaModelo: string;
  numeroSerie: string;
  etiquetaYpf: string;
  cantidad: number;
  consumoPromedioW: number | null;
  consumoMaxW: number | null;
  tipoMontaje: TipoMontajeCamara | null;
  alturaMontajeM: number | null;
}

export interface DarDeAltaMaterialesPayload {
  ubicacionId: string | null;
  ubicacionNueva: PayloadUbicacionNueva | null;
  gps: PayloadGps | null;
  fecha: string;
  materiales: PayloadMaterialAlta[];
}

export interface DarDeAltaMaterialesResult {
  success: boolean;
  error?: string;
  cantidadDadaDeAlta?: number;
  /** Descripciones de los materiales que NO se cargaron porque ya estaban dados de alta en ese sitio (mismo N° de serie o etiqueta YPF). */
  omitidosPorDuplicado?: string[];
}

/**
 * Alta de materiales (criterio de Ivan, 10/11/2026): lo primero que se
 * hace al sacar algo de depósito para instalar, no lo último (cuando ya se
 * escribe el Informe Técnico y es difícil reconstruir marca/modelo/serie
 * de memoria). Liviana a propósito: sin PDF, sin numeración, sin mail — es
 * un trámite de un minuto. Queda `informe_instalacion_id = null`
 * (pendiente) hasta que se adjunte a un Informe Técnico (ver
 * materiales-picker-actions.ts → buscarMaterialesPendientesAction).
 */
export async function darDeAltaMaterialesAction(payload: DarDeAltaMaterialesPayload): Promise<DarDeAltaMaterialesResult> {
  const profile = await requireProfile();
  if (!payload.fecha) return { success: false, error: "Falta la fecha." };
  if (payload.materiales.length === 0) return { success: false, error: "Agregá al menos un material." };

  const supabase = await createClient();

  const ubicacionResult = await resolverUbicacionId(supabase, { ubicacionId: payload.ubicacionId, ubicacionNueva: payload.ubicacionNueva }, profile.id, "el material");
  if ("error" in ubicacionResult) return { success: false, error: ubicacionResult.error };
  const ubicacionId = ubicacionResult.id;
  if (payload.gps) await tagGpsSiFalta(supabase, ubicacionId, payload.gps, profile.id);

  let dadosDeAlta = 0;
  const omitidosPorDuplicado: string[] = [];
  for (const m of payload.materiales) {
    if (!m.descripcion.trim()) continue;
    const marcaModelo = m.marcaModelo.trim() || null;
    const numeroSerie = m.numeroSerie.trim() || null;
    const etiquetaYpf = m.etiquetaYpf.trim() || null;

    const equipoExistente = await buscarEquipoDuplicado(supabase, ubicacionId, numeroSerie ?? "", etiquetaYpf ?? "");
    if (equipoExistente) {
      // ya está dado de alta (con ese mismo N° de serie/etiqueta en este sitio) — no duplicar, pero se avisa cuál
      omitidosPorDuplicado.push(m.descripcion.trim());
      continue;
    }

    const { error } = await supabase.from("equipos").insert({
      ubicacion_id: ubicacionId,
      categoria_equipo: m.categoriaEquipo,
      texto: m.descripcion.trim(),
      marca_modelo: marcaModelo,
      numero_serie: numeroSerie,
      etiqueta_ypf: etiquetaYpf,
      cantidad: m.cantidad || 1,
      consumo_promedio_w: m.consumoPromedioW,
      consumo_max_w: m.consumoMaxW,
      tipo_montaje: m.tipoMontaje,
      altura_montaje_m: m.alturaMontajeM,
      fecha_alta: payload.fecha,
      informe_instalacion_id: null,
      created_by: profile.id,
    });
    if (!error) dadosDeAlta++;
  }

  if (dadosDeAlta === 0) {
    return {
      success: false,
      error:
        omitidosPorDuplicado.length > 0
          ? `Ya estaba dado de alta en este sitio (mismo N° de serie o etiqueta YPF), no se repitió: ${omitidosPorDuplicado.join(", ")}.`
          : "No se dio de alta ningún material — revisá que tengan descripción.",
      omitidosPorDuplicado,
    };
  }

  revalidatePath("/panel/materiales");
  return { success: true, cantidadDadaDeAlta: dadosDeAlta, omitidosPorDuplicado };
}

export interface MaterialPendiente {
  id: string;
  categoriaEquipo: EquipoCategoria;
  descripcion: string;
  marcaModelo: string | null;
  numeroSerie: string | null;
  etiquetaYpf: string | null;
  cantidad: number;
  fechaAlta: string | null;
  ubicacionLabel: string;
}

/**
 * Lo que un técnico dio de alta (ver darDeAltaMaterialesAction) y todavía
 * no adjuntó a ningún Informe Técnico (`informe_instalacion_id is null`).
 * Acotado a lo propio — cada técnico ve y gestiona solo lo que él mismo
 * sacó, no lo de todo el equipo.
 */
export async function buscarMaterialesPendientesAction(): Promise<MaterialPendiente[]> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data } = await supabase
    .from("equipos")
    .select("id, categoria_equipo, texto, marca_modelo, numero_serie, etiqueta_ypf, cantidad, fecha_alta, ubicacion_id")
    .eq("created_by", profile.id)
    .is("informe_instalacion_id", null)
    .eq("estado", "activo")
    .order("fecha_alta", { ascending: false });
  if (!data || data.length === 0) return [];

  const ubicacionIds = [...new Set(data.map((row) => row.ubicacion_id))];
  const { data: ubicacionesData } = await supabase
    .from("ubicaciones")
    .select("id, pais, region, provincia, localidad, sitio, planta, oficina, lat, lng")
    .in("id", ubicacionIds);
  const labelPorUbicacion = new Map((ubicacionesData ?? []).map((u) => [u.id, labelUbicacion(u)]));

  return data.map((row) => ({
    id: row.id,
    categoriaEquipo: row.categoria_equipo,
    descripcion: row.texto,
    marcaModelo: row.marca_modelo,
    numeroSerie: row.numero_serie,
    etiquetaYpf: row.etiqueta_ypf,
    cantidad: row.cantidad,
    fechaAlta: row.fecha_alta,
    ubicacionLabel: labelPorUbicacion.get(row.ubicacion_id) ?? "—",
  }));
}

export interface DevolverMaterialPendienteResult {
  success: boolean;
  error?: string;
}

/**
 * Autocorrección de una alta propia: "lo di de alta pero al final no lo
 * instalé/no me lo pidieron, va de vuelta al depósito". A propósito NO pide
 * puedeGestionarDeposito() como entregarEquipoADepositoAction — el gate real
 * es más angosto y de menor riesgo: `created_by = yo` + `informe_instalacion_id
 * is null` (nunca se instaló, nadie más lo tocó) + `estado = activo`. Liviana
 * a propósito (sin PDF/numeración/mail) — es la reversa de un trámite de un
 * minuto, no una entrega formal a depósito.
 */
export async function devolverMaterialPendienteADepositoAction(equipoId: string): Promise<DevolverMaterialPendienteResult> {
  const profile = await requireProfile();

  let service: ReturnType<typeof createServiceRoleClient>;
  try {
    service = createServiceRoleClient();
  } catch {
    return { success: false, error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." };
  }

  const { data: equipoRaw } = await service
    .from("equipos")
    .select("created_by, informe_instalacion_id, estado")
    .eq("id", equipoId)
    .single();
  if (!equipoRaw) return { success: false, error: "No se encontró el material." };
  if (equipoRaw.created_by !== profile.id || equipoRaw.informe_instalacion_id !== null || equipoRaw.estado !== "activo") {
    return { success: false, error: "Este material ya no se puede devolver desde acá (puede que ya esté adjunto a un informe)." };
  }

  const equipo = await resolverEquipo(service, "equipo_individual", equipoId);
  if (!equipo) return { success: false, error: "No se encontró el material." };

  let numeroGeneracion = nuevoNumeroGeneracionEntrega();
  let entregaId: string | null = null;
  for (let attempt = 0; attempt < 5 && !entregaId; attempt++) {
    const { data, error } = await service
      .from("entregas_deposito")
      .insert({
        numero_generacion: numeroGeneracion,
        origen: "equipo_existente",
        tipo_equipo: "equipo_individual",
        equipo_id: equipoId,
        descripcion: equipo.texto,
        categoria: equipo.categoriaLabel,
        marca_modelo: equipo.marcaModelo,
        numero_serie: equipo.numeroSerie,
        etiqueta_ypf: equipo.etiquetaYpf,
        cantidad: 1,
        condicion: "nuevo",
        motivo: "sobrante_obra",
        comentario: "Alta propia revertida — nunca se instaló.",
        ubicacion_id: equipo.ubicacionId,
        fecha: new Date().toISOString().slice(0, 10),
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        numeroGeneracion = nuevoNumeroGeneracionEntrega();
        continue;
      }
      return { success: false, error: `No se pudo registrar la devolución: ${error.message}` };
    }
    entregaId = data!.id;
  }
  if (!entregaId) return { success: false, error: "No se pudo asignar un número de generación único. Probá de nuevo." };

  await service.from("equipos").update({ estado: "en_deposito" }).eq("id", equipoId);

  revalidatePath("/panel/materiales");
  revalidatePath("/entregas-deposito/historial");
  return { success: true };
}

export interface CompletarIdentificadoresResult {
  success: boolean;
  error?: string;
  numeroSerie?: string | null;
  etiquetaYpf?: string | null;
}

/**
 * Completa DESPUÉS del alta el N° de serie y/o la etiqueta YPF de un material que se cargó sin ellos
 * (la foto no se leía, no tenía a mano la chapa, etc.). Solo llena lo que está en blanco: nunca
 * pisa un dato ya cargado. Lo puede hacer quien dio de alta el material mientras siga pendiente
 * de adjuntar a un informe, o la oficina (Admin/Supervisor) en cualquier momento.
 *
 * Usa el service role porque `equipos` solo se actualiza por RLS desde Admin; el gate real está acá.
 * Avisa si el N° de serie o la etiqueta YPF ya los tiene OTRO equipo activo del mismo sitio (sería el
 * mismo equipo cargado dos veces).
 */
export async function completarIdentificadoresMaterialAction(
  equipoId: string,
  numeroSerie: string,
  etiquetaYpf: string,
): Promise<CompletarIdentificadoresResult> {
  const profile = await requireProfile();
  const serieNueva = numeroSerie.trim().slice(0, 60);
  const ypfNueva = etiquetaYpf.trim().slice(0, 40);
  if (!serieNueva && !ypfNueva) return { success: false, error: "Escribí el N° de serie o la etiqueta YPF." };

  let service: ReturnType<typeof createServiceRoleClient>;
  try {
    service = createServiceRoleClient();
  } catch {
    return { success: false, error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." };
  }

  const { data: equipo } = await service
    .from("equipos")
    .select("id, ubicacion_id, estado, created_by, informe_instalacion_id, numero_serie, etiqueta_ypf")
    .eq("id", equipoId)
    .maybeSingle();
  if (!equipo) return { success: false, error: "No se encontró el material." };

  const esOficina = profile.rol === "admin" || profile.rol === "superusuario" || profile.rol === "supervisor";
  const esDuenoPendiente = equipo.created_by === profile.id && equipo.informe_instalacion_id === null;
  if (!esOficina && !esDuenoPendiente) {
    return { success: false, error: "Este material ya no se puede completar desde acá (puede que ya esté adjunto a un informe) — pedíselo a la oficina." };
  }
  if (equipo.estado !== "activo") return { success: false, error: "Este material ya no está activo." };

  // Solo se llenan los campos que hoy están en blanco.
  const cambios: { numero_serie?: string; etiqueta_ypf?: string } = {};
  if (serieNueva && !equipo.numero_serie) cambios.numero_serie = serieNueva;
  if (ypfNueva && !equipo.etiqueta_ypf) cambios.etiqueta_ypf = ypfNueva;
  if (Object.keys(cambios).length === 0) return { success: false, error: "Ese dato ya estaba cargado: no se pisa." };

  // ¿Otro equipo activo del mismo sitio ya tiene ese identificador?
  for (const [columna, valor, nombre] of [
    ["numero_serie", cambios.numero_serie, "N° de serie"],
    ["etiqueta_ypf", cambios.etiqueta_ypf, "etiqueta YPF"],
  ] as const) {
    if (!valor) continue;
    const { data: otro } = await service
      .from("equipos")
      .select("id")
      .eq("ubicacion_id", equipo.ubicacion_id)
      .eq("estado", "activo")
      .eq(columna, valor)
      .neq("id", equipoId)
      .limit(1)
      .maybeSingle();
    if (otro) return { success: false, error: `Ya hay otro equipo cargado en este sitio con ese ${nombre}: puede ser el mismo equipo dado de alta dos veces.` };
  }

  const { error } = await service.from("equipos").update(cambios).eq("id", equipoId);
  if (error) return { success: false, error: `No se pudo guardar: ${error.message}` };

  revalidatePath("/panel/materiales");
  return {
    success: true,
    numeroSerie: cambios.numero_serie ?? equipo.numero_serie,
    etiquetaYpf: cambios.etiqueta_ypf ?? equipo.etiqueta_ypf,
  };
}
