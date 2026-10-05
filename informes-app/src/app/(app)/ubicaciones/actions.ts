"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { puedeGestionarBajas, puedeGestionarDeposito } from "@/lib/types";
import { CATEGORIA_EQUIPO_LABEL as RACK_CATEGORIA_LABEL } from "@/components/racks/types";
import { CATEGORIA_EQUIPO_LABEL as EQUIPO_CATEGORIA_LABEL } from "@/components/equipos/types";
import { TIPO_EQUIPO_BAJA_LABEL } from "@/components/bajas/types";
import { TIPO_EQUIPO_LABEL as TIPO_EQUIPO_DEPOSITO_LABEL } from "@/components/deposito/types";
import { nuevoNumeroGeneracionBaja } from "@/lib/bajas/numero-generacion";
import { nuevoNumeroGeneracionEntrega } from "@/lib/deposito/numero-generacion";
import { renderBajaPdf, renderEntregaDepositoPdf } from "@/lib/pdf/render";
import { buildBajaFilename, buildEntregaDepositoFilename } from "@/lib/pdf/filename";
import { resolverEquipo, TABLA_POR_TIPO } from "@/lib/equipamiento/resolver-equipo";
import type { MotivoBaja, MotivoEntregaDeposito, CondicionMaterial, TipoEquipoBaja } from "@/lib/database.types";

export interface EstimarConsumoResult {
  success: boolean;
  error?: string;
  estimados?: number;
  sinDato?: number;
}

interface Watts {
  promedio: number | null;
  max: number | null;
}

/**
 * Backfill de "Consumo estimado (IA)" para equipamiento que ya estaba
 * cargado antes de que existiera este campo (o para el que la IA no pudo
 * estimar en el momento del relevamiento). Un solo pedido a Claude con
 * TODOS los ítems pendientes de un sitio — más barato y rápido que uno por
 * ítem — pide promedio y máximo por cada uno, en el mismo orden. Solo
 * texto (categoría + marca/modelo ya identificados), sin fotos: la
 * estimación es por conocimiento general de ese modelo, no por lo que se
 * ve en una imagen. Pide los dos valores por separado — un solo número
 * confundía el vatiaje nominal de la fuente/cargador del equipo con lo que
 * en los hechos consume en uso normal (ej. una notebook con cargador de
 * 65W consume mucho menos que eso la mayoría del tiempo).
 */
async function estimarWatts(items: { texto: string; marcaModelo: string | null; categoriaLabel: string }[]): Promise<Watts[]> {
  if (items.length === 0) return [];
  if (!process.env.ANTHROPIC_API_KEY) return items.map(() => ({ promedio: null, max: null }));

  const listado = items
    .map((it, i) => `${i + 1}. [${it.categoriaLabel}] ${it.texto}${it.marcaModelo ? ` — marca/modelo: ${it.marcaModelo}` : " — sin marca/modelo legible"}`)
    .join("\n");

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      output_config: { effort: "low" },
      system:
        "Estimás el consumo eléctrico de equipamiento de telecomunicaciones/energía de un sitio técnico, a partir de tu conocimiento " +
        "general de marcas/modelos — nunca a partir de una foto, solo del texto que te paso. Para cada ítem dame DOS números: " +
        '"promedio" (consumo típico en Watts en uso normal) y "max" (consumo pico/máximo en Watts, bajo la carga más alta que pueda ' +
        "darse en operación normal). Importante: el promedio es el consumo REAL típico, NUNCA el vatiaje nominal de la fuente/" +
        "cargador/power supply del equipo si ese número es mayor — una fuente de 65W es lo máximo que PUEDE entregar, no lo que el " +
        "equipo consume la mayoría del tiempo. El máximo sí puede acercarse al vatiaje nominal de la fuente cuando el equipo puede " +
        "llegar a exigirle casi toda su capacidad, pero no lo copies mecánicamente sin pensarlo — siempre \"max\" >= \"promedio\". Es " +
        "una ESTIMACIÓN para planificación energética, no una medición exacta: está bien dar números aproximados si conocés el rango " +
        "típico de ese modelo o de modelos muy similares de la misma familia/fabricante. Devolvé null en los dos campos de un ítem si " +
        "no tiene marca/modelo, o si la marca/modelo no te resulta nada familiar — nunca inventes un número para un equipo que no " +
        "podés justificar de ninguna forma.\n\n" +
        `Respondé ÚNICAMENTE con un JSON válido: un array de ${items.length} objetos {"promedio": number | null, "max": number | ` +
        "null}, en el MISMO ORDEN que la lista (uno por ítem, ninguno de más ni de menos), sin texto antes ni después, sin bloque de " +
        "código markdown.",
      messages: [{ role: "user", content: `Lista de equipamiento:\n${listado}` }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (response.stop_reason === "refusal" || !textBlock) return items.map(() => ({ promedio: null, max: null }));
    const match = textBlock.text.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(match ? match[0] : textBlock.text);
    if (!Array.isArray(parsed)) return items.map(() => ({ promedio: null, max: null }));
    return items.map((_, i) => {
      const v = parsed[i];
      const promedio = v && typeof v.promedio === "number" && Number.isFinite(v.promedio) && v.promedio > 0 ? v.promedio : null;
      const maxCrudo = v && typeof v.max === "number" && Number.isFinite(v.max) && v.max > 0 ? v.max : null;
      const max = maxCrudo !== null && promedio !== null ? Math.max(maxCrudo, promedio) : maxCrudo;
      return { promedio, max };
    });
  } catch {
    return items.map(() => ({ promedio: null, max: null }));
  }
}

/**
 * Solo Administrador: `rack_equipamientos`/`equipos` tienen UPDATE
 * restringido a is_admin() por RLS (a propósito, para no dejar que
 * cualquier técnico edite equipamiento que cargó otro) — así que esto
 * fallaría en silencio (0 filas afectadas) para un técnico, no con un
 * error. Se valida el rol explícitamente para dar un mensaje claro en vez
 * de ese silencio.
 */
export async function estimarConsumoRacksAction(rackIds: string[]): Promise<EstimarConsumoResult> {
  const profile = await requireProfile();
  if (profile.rol !== "admin") return { success: false, error: "Solo un Administrador puede completar esto." };
  if (rackIds.length === 0) return { success: true, estimados: 0, sinDato: 0 };

  const supabase = await createClient();
  const { data: pendientes, error } = await supabase
    .from("rack_equipamientos")
    .select("id, texto, marca_modelo, categoria_equipo")
    .in("rack_id", rackIds)
    .is("consumo_promedio_w", null);
  if (error) return { success: false, error: error.message };
  if (!pendientes || pendientes.length === 0) return { success: true, estimados: 0, sinDato: 0 };

  const watts = await estimarWatts(
    pendientes.map((p) => ({ texto: p.texto, marcaModelo: p.marca_modelo, categoriaLabel: RACK_CATEGORIA_LABEL[p.categoria_equipo] })),
  );

  let estimados = 0;
  let sinDato = 0;
  for (let i = 0; i < pendientes.length; i++) {
    if (watts[i].promedio === null) {
      sinDato++;
      continue;
    }
    const { error: updErr } = await supabase
      .from("rack_equipamientos")
      .update({ consumo_promedio_w: watts[i].promedio, consumo_max_w: watts[i].max })
      .eq("id", pendientes[i].id);
    if (!updErr) estimados++;
  }
  revalidatePath("/ubicaciones/[id]", "page");
  return { success: true, estimados, sinDato };
}

export async function estimarConsumoEquiposAction(ubicacionIds: string[]): Promise<EstimarConsumoResult> {
  const profile = await requireProfile();
  if (profile.rol !== "admin") return { success: false, error: "Solo un Administrador puede completar esto." };
  if (ubicacionIds.length === 0) return { success: true, estimados: 0, sinDato: 0 };

  const supabase = await createClient();
  const { data: pendientes, error } = await supabase
    .from("equipos")
    .select("id, texto, marca_modelo, categoria_equipo")
    .in("ubicacion_id", ubicacionIds)
    .is("consumo_promedio_w", null);
  if (error) return { success: false, error: error.message };
  if (!pendientes || pendientes.length === 0) return { success: true, estimados: 0, sinDato: 0 };

  const watts = await estimarWatts(
    pendientes.map((p) => ({ texto: p.texto, marcaModelo: p.marca_modelo, categoriaLabel: EQUIPO_CATEGORIA_LABEL[p.categoria_equipo] })),
  );

  let estimados = 0;
  let sinDato = 0;
  for (let i = 0; i < pendientes.length; i++) {
    if (watts[i].promedio === null) {
      sinDato++;
      continue;
    }
    const { error: updErr } = await supabase
      .from("equipos")
      .update({ consumo_promedio_w: watts[i].promedio, consumo_max_w: watts[i].max })
      .eq("id", pendientes[i].id);
    if (!updErr) estimados++;
  }
  revalidatePath("/ubicaciones/[id]", "page");
  return { success: true, estimados, sinDato };
}

export interface DarDeBajaPayload {
  tipoEquipo: TipoEquipoBaja;
  equipoId: string;
  motivo: MotivoBaja;
  comentario: string;
  fecha: string;
}

export interface DarDeBajaResult {
  success: boolean;
  error?: string;
  bajaId?: string;
  numeroGeneracion?: string;
}

/**
 * Dar de baja un equipo: lo saca del equipamiento activo del sitio
 * (`estado = 'baja'`, nunca se borra la fila) y genera un comprobante en
 * PDF para entregar junto con el equipo físico a depósito. Solo Admin/
 * Supervisor — mismo gate que Estadísticas — y por eso corre con el
 * cliente de Service Role: `rack_equipamientos`/`equipos` tienen UPDATE
 * restringido a `is_admin()` por RLS (un Supervisor no pasaría ese check
 * directo), y `tablero_circuitos` no tiene ninguna policy de UPDATE
 * todavía — bypasear RLS acá es controlado porque la action en sí ya
 * valida el rol antes de tocar nada.
 */
export async function darDeBajaAction(payload: DarDeBajaPayload): Promise<DarDeBajaResult> {
  const profile = await requireProfile();
  if (!puedeGestionarBajas(profile.rol)) {
    return { success: false, error: "Solo un Administrador o Supervisor puede dar de baja equipamiento." };
  }
  if (!payload.fecha) return { success: false, error: "Falta la fecha." };

  let service: ReturnType<typeof createServiceRoleClient>;
  try {
    service = createServiceRoleClient();
  } catch {
    return {
      success: false,
      error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor — sin esa variable no se puede dar de baja equipamiento.",
    };
  }

  const equipo = await resolverEquipo(service, payload.tipoEquipo, payload.equipoId);
  if (!equipo) return { success: false, error: "No se encontró el equipo." };
  if (equipo.estadoActual === "baja") return { success: false, error: "Este equipo ya estaba dado de baja." };

  const { data: ubicacion } = await service
    .from("ubicaciones")
    .select("region, provincia, localidad, sitio, planta, oficina")
    .eq("id", equipo.ubicacionId)
    .single();
  if (!ubicacion) return { success: false, error: "No se encontró la ubicación del equipo." };

  // N° de generación único (BAJA-{año}-{4 dígitos}), con reintento ante colisión.
  let numeroGeneracion = nuevoNumeroGeneracionBaja();
  let bajaId: string | null = null;
  for (let attempt = 0; attempt < 5 && !bajaId; attempt++) {
    const { data, error } = await service
      .from("bajas_equipamiento")
      .insert({
        numero_generacion: numeroGeneracion,
        tipo_equipo: payload.tipoEquipo,
        equipo_id: payload.equipoId,
        equipo_texto: equipo.texto,
        equipo_categoria: equipo.categoriaLabel,
        equipo_marca_modelo: equipo.marcaModelo,
        equipo_numero_serie: equipo.numeroSerie,
        equipo_etiqueta_ypf: equipo.etiquetaYpf,
        ubicacion_id: equipo.ubicacionId,
        motivo: payload.motivo,
        comentario: payload.comentario.trim() || null,
        fecha: payload.fecha,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        numeroGeneracion = nuevoNumeroGeneracionBaja();
        continue;
      }
      return { success: false, error: `No se pudo registrar la baja: ${error.message}` };
    }
    bajaId = data!.id;
  }
  if (!bajaId) return { success: false, error: "No se pudo asignar un número de generación único. Probá de nuevo." };

  await service.from(TABLA_POR_TIPO[payload.tipoEquipo]).update({ estado: "baja" }).eq("id", payload.equipoId);

  // Logo de la empresa (cabecera del PDF), igual que el resto de los módulos.
  const { data: config } = await service.from("config_general").select("logo_empresa_url").eq("id", 1).single();
  let logoBuffer: Buffer | null = null;
  if (config?.logo_empresa_url) {
    try {
      const res = await fetch(config.logo_empresa_url);
      if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer());
    } catch {
      // seguimos sin logo antes que fallar la generación del PDF
    }
  }

  const pdfBuffer = await renderBajaPdf({
    numeroGeneracion,
    region: ubicacion.region,
    provincia: ubicacion.provincia,
    localidad: ubicacion.localidad,
    sitio: ubicacion.sitio,
    planta: ubicacion.planta,
    oficina: ubicacion.oficina,
    fecha: payload.fecha,
    tipoEquipoLabel: TIPO_EQUIPO_BAJA_LABEL[payload.tipoEquipo],
    categoriaLabel: equipo.categoriaLabel,
    equipoTexto: equipo.texto,
    marcaModelo: equipo.marcaModelo,
    numeroSerie: equipo.numeroSerie,
    etiquetaYpf: equipo.etiquetaYpf,
    motivo: payload.motivo,
    comentario: payload.comentario.trim() || null,
    logoBuffer,
    appName: "Informe Técnico App",
    realizoNombre: profile.nombreCompleto,
  });

  const pdfFilename = buildBajaFilename({ numeroGeneracion, equipoTexto: equipo.texto, sitio: ubicacion.sitio });
  const pdfPath = `${profile.id}/bajas/${bajaId}/${pdfFilename}`;
  const { error: pdfUpErr } = await service.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (!pdfUpErr) {
    await service.from("bajas_equipamiento").update({ pdf_url: pdfPath, pdf_generado_at: new Date().toISOString() }).eq("id", bajaId);
  }

  revalidatePath("/ubicaciones/[id]", "page");
  return { success: true, bajaId, numeroGeneracion };
}

export interface EntregarEquipoADepositoPayload {
  tipoEquipo: TipoEquipoBaja;
  equipoId: string;
  condicion: CondicionMaterial;
  motivo: MotivoEntregaDeposito;
  comentario: string;
  fecha: string;
}

export interface EntregarADepositoResult {
  success: boolean;
  error?: string;
  entregaId?: string;
  numeroGeneracion?: string;
}

/**
 * Entregar a depósito un equipo que YA estaba cargado en un sitio (no es
 * una Baja: el equipo vuelve nuevo/usado-funcional, no roto/obsoleto) —
 * mismo mecanismo de "estado" (`en_deposito` en vez de `baja`) y mismo
 * criterio de Service Role que darDeBajaAction, por la misma razón: ni
 * Supervisor pasa el UPDATE de rack_equipamientos/equipos por RLS directo.
 */
export async function entregarEquipoADepositoAction(payload: EntregarEquipoADepositoPayload): Promise<EntregarADepositoResult> {
  const profile = await requireProfile();
  if (!puedeGestionarDeposito(profile.rol)) {
    return { success: false, error: "Solo un Administrador o Supervisor puede entregar equipamiento a depósito." };
  }
  if (!payload.fecha) return { success: false, error: "Falta la fecha." };

  let service: ReturnType<typeof createServiceRoleClient>;
  try {
    service = createServiceRoleClient();
  } catch {
    return {
      success: false,
      error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor — sin esa variable no se puede entregar a depósito.",
    };
  }

  const equipo = await resolverEquipo(service, payload.tipoEquipo, payload.equipoId);
  if (!equipo) return { success: false, error: "No se encontró el equipo." };
  if (equipo.estadoActual !== "activo") return { success: false, error: "Este equipo ya no está activo en el sitio." };

  const { data: ubicacion } = await service
    .from("ubicaciones")
    .select("region, provincia, localidad, sitio, planta, oficina")
    .eq("id", equipo.ubicacionId)
    .single();
  if (!ubicacion) return { success: false, error: "No se encontró la ubicación del equipo." };

  let numeroGeneracion = nuevoNumeroGeneracionEntrega();
  let entregaId: string | null = null;
  for (let attempt = 0; attempt < 5 && !entregaId; attempt++) {
    const { data, error } = await service
      .from("entregas_deposito")
      .insert({
        numero_generacion: numeroGeneracion,
        origen: "equipo_existente",
        tipo_equipo: payload.tipoEquipo,
        equipo_id: payload.equipoId,
        descripcion: equipo.texto,
        categoria: equipo.categoriaLabel,
        marca_modelo: equipo.marcaModelo,
        numero_serie: equipo.numeroSerie,
        etiqueta_ypf: equipo.etiquetaYpf,
        cantidad: 1,
        condicion: payload.condicion,
        motivo: payload.motivo,
        comentario: payload.comentario.trim() || null,
        ubicacion_id: equipo.ubicacionId,
        fecha: payload.fecha,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        numeroGeneracion = nuevoNumeroGeneracionEntrega();
        continue;
      }
      return { success: false, error: `No se pudo registrar la entrega: ${error.message}` };
    }
    entregaId = data!.id;
  }
  if (!entregaId) return { success: false, error: "No se pudo asignar un número de generación único. Probá de nuevo." };

  await service.from(TABLA_POR_TIPO[payload.tipoEquipo]).update({ estado: "en_deposito" }).eq("id", payload.equipoId);

  const { data: config } = await service.from("config_general").select("logo_empresa_url").eq("id", 1).single();
  let logoBuffer: Buffer | null = null;
  if (config?.logo_empresa_url) {
    try {
      const res = await fetch(config.logo_empresa_url);
      if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer());
    } catch {
      // seguimos sin logo antes que fallar la generación del PDF
    }
  }

  const pdfBuffer = await renderEntregaDepositoPdf({
    numeroGeneracion,
    region: ubicacion.region,
    provincia: ubicacion.provincia,
    localidad: ubicacion.localidad,
    sitio: ubicacion.sitio,
    planta: ubicacion.planta,
    oficina: ubicacion.oficina,
    fecha: payload.fecha,
    items: [
      {
        tipoEquipoLabel: TIPO_EQUIPO_DEPOSITO_LABEL[payload.tipoEquipo],
        descripcion: equipo.texto,
        categoria: equipo.categoriaLabel,
        marcaModelo: equipo.marcaModelo,
        numeroSerie: equipo.numeroSerie,
        etiquetaYpf: equipo.etiquetaYpf,
        cantidad: 1,
        condicion: payload.condicion,
        motivo: payload.motivo,
        comentario: payload.comentario.trim() || null,
      },
    ],
    fotosEvidenciaBuffers: null,
    logoBuffer,
    appName: "Informe Técnico App",
    realizoNombre: profile.nombreCompleto,
  });

  const pdfFilename = buildEntregaDepositoFilename({ numeroGeneracion, descripcion: equipo.texto, sitio: ubicacion.sitio });
  const pdfPath = `${profile.id}/entregas-deposito/${entregaId}/${pdfFilename}`;
  const { error: pdfUpErr } = await service.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (!pdfUpErr) {
    await service.from("entregas_deposito").update({ pdf_url: pdfPath, pdf_generado_at: new Date().toISOString() }).eq("id", entregaId);
  }

  revalidatePath("/ubicaciones/[id]", "page");
  return { success: true, entregaId, numeroGeneracion };
}
