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
  for (const m of payload.materiales) {
    if (!m.descripcion.trim()) continue;
    const marcaModelo = m.marcaModelo.trim() || null;
    const numeroSerie = m.numeroSerie.trim() || null;
    const etiquetaYpf = m.etiquetaYpf.trim() || null;

    const equipoExistente = await buscarEquipoDuplicado(supabase, ubicacionId, numeroSerie ?? "", etiquetaYpf ?? "");
    if (equipoExistente) continue; // ya está dado de alta (con ese mismo N° de serie/etiqueta en este sitio) — no duplicar

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

  if (dadosDeAlta === 0) return { success: false, error: "No se dio de alta ningún material — ¿ya estaban todos cargados?" };

  revalidatePath("/panel/materiales");
  return { success: true, cantidadDadaDeAlta: dadosDeAlta };
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
