"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { renderRendicionGastosPdf } from "@/lib/pdf/render";
import { formatFechaArg } from "@/lib/pdf/common";
import { buildRendicionGastosFilename } from "@/lib/pdf/filename";

export interface GastoActionResult {
  success: boolean;
  error?: string;
}

/**
 * Agrega un gasto a una rendición todavía 'abierta' — a diferencia del resto
 * de la app, acá cada gasto se guarda al toque (no se junta todo para un
 * único submit final), justamente para poder ir cargando de a uno en
 * distintos momentos hasta hacer el cierre.
 */
export async function agregarGastoAction(rendicionId: string, formData: FormData): Promise<GastoActionResult> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: rendicion, error: rendErr } = await supabase
    .from("rendiciones_gastos")
    .select("estado")
    .eq("id", rendicionId)
    .single();
  if (rendErr || !rendicion) return { success: false, error: "No se encontró la rendición." };
  if (rendicion.estado !== "abierta") return { success: false, error: "Esta rendición ya está cerrada." };

  const fecha = String(formData.get("fecha") ?? "");
  const categoria = String(formData.get("categoria") ?? "").trim();
  const monto = Number(String(formData.get("monto") ?? "").replace(",", "."));
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  let tecnicos: { nombre: string; torre: string }[] = [];
  try {
    tecnicos = JSON.parse(String(formData.get("tecnicos") ?? "[]"));
  } catch {
    tecnicos = [];
  }

  if (!fecha || !categoria || !Number.isFinite(monto) || monto <= 0) {
    return { success: false, error: "Completá fecha, categoría y un monto válido." };
  }

  await supabase.from("catalogo_categorias_gasto").upsert({ nombre: categoria }, { onConflict: "nombre", ignoreDuplicates: true });
  for (const t of tecnicos) {
    const torre = t.torre?.trim();
    if (torre) await supabase.from("catalogo_torres").upsert({ nombre: torre }, { onConflict: "nombre", ignoreDuplicates: true });
  }

  const { data: gastoRow, error: gastoErr } = await supabase
    .from("gastos")
    .insert({ rendicion_id: rendicionId, fecha, categoria, monto, descripcion: descripcion || null })
    .select("id")
    .single();
  if (gastoErr || !gastoRow) return { success: false, error: `No se pudo guardar el gasto: ${gastoErr?.message}` };

  if (tecnicos.length) {
    await supabase
      .from("gasto_tecnicos")
      .insert(tecnicos.map((t) => ({ gasto_id: gastoRow.id, tecnico_nombre: t.nombre.trim(), torre: t.torre?.trim() || null })));
  }

  const comprobante = formData.get("comprobante");
  if (comprobante instanceof File && comprobante.size > 0) {
    const buffer = Buffer.from(await comprobante.arrayBuffer());
    const path = `${profile.id}/${rendicionId}/${gastoRow.id}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("comprobantes")
      .upload(path, buffer, { contentType: comprobante.type || "image/jpeg", upsert: true });
    if (!upErr) await supabase.from("gastos").update({ comprobante_url: path }).eq("id", gastoRow.id);
  }

  revalidatePath(`/rendicion-gastos/${rendicionId}`);
  return { success: true };
}

export async function eliminarGastoAction(rendicionId: string, gastoId: string): Promise<GastoActionResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: rendicion } = await supabase.from("rendiciones_gastos").select("estado").eq("id", rendicionId).single();
  if (!rendicion || rendicion.estado !== "abierta") return { success: false, error: "Esta rendición ya está cerrada." };

  const { data: gasto } = await supabase.from("gastos").select("comprobante_url").eq("id", gastoId).single();
  const { error } = await supabase.from("gastos").delete().eq("id", gastoId);
  if (error) return { success: false, error: error.message };
  if (gasto?.comprobante_url) {
    await supabase.storage.from("comprobantes").remove([gasto.comprobante_url]);
  }

  revalidatePath(`/rendicion-gastos/${rendicionId}`);
  return { success: true };
}

export interface CerrarRendicionResult {
  success: boolean;
  error?: string;
  pdfUrl?: string | null;
}

/** Cierra la rendición: junta todos los gastos ya cargados, genera el PDF y marca estado='cerrada'. */
export async function cerrarRendicionAction(rendicionId: string): Promise<CerrarRendicionResult> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: rendicion, error: rendErr } = await supabase
    .from("rendiciones_gastos")
    .select("numero_generacion, motivo, fecha, proyecto_cliente, provincia, viatico_recibido, moneda, estado")
    .eq("id", rendicionId)
    .single();
  if (rendErr || !rendicion) return { success: false, error: "No se encontró la rendición." };
  if (rendicion.estado !== "abierta") return { success: false, error: "Esta rendición ya está cerrada." };

  const { data: gastosRows } = await supabase
    .from("gastos")
    .select("id, fecha, categoria, monto, descripcion, comprobante_url")
    .eq("rendicion_id", rendicionId)
    .order("fecha");

  const gastoIds = (gastosRows ?? []).map((g) => g.id);
  const { data: gastoTecnicosRows } = gastoIds.length
    ? await supabase.from("gasto_tecnicos").select("gasto_id, tecnico_nombre, torre").in("gasto_id", gastoIds)
    : { data: [] as { gasto_id: string; tecnico_nombre: string; torre: string | null }[] };

  const tecnicosPorGasto = new Map<string, string[]>();
  const tecnicosInvolucradosMap = new Map<string, string | null>();
  for (const gt of gastoTecnicosRows ?? []) {
    const list = tecnicosPorGasto.get(gt.gasto_id) ?? [];
    list.push(gt.tecnico_nombre);
    tecnicosPorGasto.set(gt.gasto_id, list);
    tecnicosInvolucradosMap.set(gt.tecnico_nombre, gt.torre);
  }

  let totalGastado = 0;
  const gastosPdf: { fechaLabel: string; categoria: string; tecnicos: string; descripcion: string; monto: number; comprobanteBuffer: Buffer | null }[] = [];
  for (const g of gastosRows ?? []) {
    totalGastado += Number(g.monto);
    let comprobanteBuffer: Buffer | null = null;
    if (g.comprobante_url) {
      const { data: blob } = await supabase.storage.from("comprobantes").download(g.comprobante_url);
      if (blob) comprobanteBuffer = Buffer.from(await blob.arrayBuffer());
    }
    gastosPdf.push({
      fechaLabel: formatFechaArg(g.fecha),
      categoria: g.categoria,
      tecnicos: (tecnicosPorGasto.get(g.id) ?? []).join(", "),
      descripcion: g.descripcion ?? "",
      monto: Number(g.monto),
      comprobanteBuffer,
    });
  }

  const { data: config } = await supabase.from("config_general").select("logo_empresa_url").eq("id", 1).single();
  let logoBuffer: Buffer | null = null;
  if (config?.logo_empresa_url) {
    try {
      const res = await fetch(config.logo_empresa_url);
      if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer());
    } catch {
      // seguimos sin logo antes que fallar la generación del PDF
    }
  }

  const viatico = Number(rendicion.viatico_recibido);
  const saldo = viatico - totalGastado;
  const pdfBuffer = await renderRendicionGastosPdf({
    numeroGeneracion: rendicion.numero_generacion,
    motivo: rendicion.motivo,
    fechaLabel: formatFechaArg(rendicion.fecha),
    proyectoCliente: rendicion.proyecto_cliente,
    provincia: rendicion.provincia,
    tecnicosInvolucrados: Array.from(tecnicosInvolucradosMap.entries()).map(([nombre, torre]) => ({ nombre, torre })),
    viaticoRecibido: viatico,
    moneda: rendicion.moneda,
    gastos: gastosPdf,
    totalGastado,
    saldo,
    logoBuffer,
    appName: "Rendición de Gastos App",
    realizoNombre: profile.nombreCompleto,
  });

  const pdfFilename = buildRendicionGastosFilename({
    numeroGeneracion: rendicion.numero_generacion,
    motivo: rendicion.motivo,
    provincia: rendicion.provincia,
  });
  const pdfPath = `${profile.id}/${rendicionId}/${pdfFilename}`;
  const { error: pdfUpErr } = await supabase.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (pdfUpErr) return { success: false, error: `No se pudo generar el PDF: ${pdfUpErr.message}` };

  await supabase.from("rendiciones_gastos").update({ pdf_url: pdfPath, estado: "cerrada" }).eq("id", rendicionId);
  const { data: signed } = await supabase.storage.from("informes-pdf").createSignedUrl(pdfPath, 60 * 60);

  revalidatePath(`/rendicion-gastos/${rendicionId}`);
  revalidatePath("/rendicion-gastos/historial");
  return { success: true, pdfUrl: signed?.signedUrl ?? null };
}
