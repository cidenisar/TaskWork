"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { nuevoNumeroGeneracionRendicion } from "@/lib/rendicion-gastos/numero-generacion";
import { renderRendicionGastosPdf } from "@/lib/pdf/render";
import { formatFechaArg } from "@/lib/pdf/common";
import { buildRendicionGastosFilename } from "@/lib/pdf/filename";

interface PayloadGastoTecnico {
  nombre: string;
  torre: string;
}
interface PayloadGasto {
  fecha: string;
  categoria: string;
  monto: number;
  descripcion: string;
  tecnicos: PayloadGastoTecnico[];
}
interface Payload {
  motivo: string;
  fecha: string;
  proyectoCliente: string;
  provincia: string;
  viaticoRecibido: string;
  moneda: "ARS" | "USD";
  gastos: PayloadGasto[];
  numeroGeneracionPreferido: string;
}

export interface CrearRendicionResult {
  success: boolean;
  error?: string;
  rendicionId?: string;
  numeroGeneracion?: string;
  pdfUrl?: string | null;
}

export async function crearRendicionGastosAction(formData: FormData): Promise<CrearRendicionResult> {
  const profile = await requireProfile();

  const raw = formData.get("payload");
  if (typeof raw !== "string") return { success: false, error: "Datos inválidos." };
  let payload: Payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { success: false, error: "Datos inválidos." };
  }

  const viatico = Number(payload.viaticoRecibido.replace(",", "."));
  if (!payload.motivo?.trim() || !payload.fecha || !Number.isFinite(viatico) || viatico < 0) {
    return { success: false, error: "Faltan campos obligatorios (motivo, fecha, viático recibido)." };
  }

  const supabase = await createClient();

  // Categorías y torres al catálogo compartido (alta al vuelo). El técnico en
  // sí ya no se da de alta acá — ver el mismo comentario en Informe Técnico.
  const categoriasVistas = new Set<string>();
  for (const g of payload.gastos) {
    const cat = g.categoria.trim();
    if (cat && !categoriasVistas.has(cat)) {
      categoriasVistas.add(cat);
      await supabase.from("catalogo_categorias_gasto").upsert({ nombre: cat }, { onConflict: "nombre", ignoreDuplicates: true });
    }
    for (const t of g.tecnicos) {
      const torre = t.torre?.trim();
      if (torre) {
        await supabase.from("catalogo_torres").upsert({ nombre: torre }, { onConflict: "nombre", ignoreDuplicates: true });
      }
    }
  }

  // Número de generación único (REND-{año}-{4 dígitos}), con reintento ante colisión.
  let numeroGeneracion = payload.numeroGeneracionPreferido || nuevoNumeroGeneracionRendicion();
  let rendicionId: string | null = null;
  for (let attempt = 0; attempt < 5 && !rendicionId; attempt++) {
    const { data, error } = await supabase
      .from("rendiciones_gastos")
      .insert({
        numero_generacion: numeroGeneracion,
        motivo: payload.motivo.trim(),
        fecha: payload.fecha,
        proyecto_cliente: payload.proyectoCliente.trim() || null,
        provincia: payload.provincia || null,
        viatico_recibido: viatico,
        moneda: payload.moneda,
        created_by: profile.id,
        estado: "abierta",
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        numeroGeneracion = nuevoNumeroGeneracionRendicion();
        continue;
      }
      return { success: false, error: `No se pudo guardar la rendición: ${error.message}` };
    }
    rendicionId = data!.id;
  }
  if (!rendicionId) {
    return { success: false, error: "No se pudo asignar un número de generación único. Probá de nuevo." };
  }

  // Gastos: se insertan uno por uno (necesitamos el id de cada uno para el
  // comprobante y para gasto_tecnicos).
  const gastosPdf: { fechaLabel: string; categoria: string; tecnicos: string; descripcion: string; monto: number; comprobanteBuffer: Buffer | null }[] = [];
  let totalGastado = 0;
  const tecnicosInvolucradosMap = new Map<string, string | null>();

  for (let i = 0; i < payload.gastos.length; i++) {
    const g = payload.gastos[i];
    const { data: gastoRow, error: gastoErr } = await supabase
      .from("gastos")
      .insert({
        rendicion_id: rendicionId,
        fecha: g.fecha,
        categoria: g.categoria.trim(),
        monto: g.monto,
        descripcion: g.descripcion.trim() || null,
      })
      .select("id")
      .single();
    if (gastoErr || !gastoRow) continue;

    if (g.tecnicos.length) {
      await supabase.from("gasto_tecnicos").insert(
        g.tecnicos.map((t) => ({ gasto_id: gastoRow.id, tecnico_nombre: t.nombre.trim(), torre: t.torre?.trim() || null })),
      );
      for (const t of g.tecnicos) tecnicosInvolucradosMap.set(t.nombre.trim(), t.torre?.trim() || null);
    }

    let comprobanteBuffer: Buffer | null = null;
    const file = formData.get(`comprobante_${i}`);
    if (file instanceof File) {
      comprobanteBuffer = Buffer.from(await file.arrayBuffer());
      const path = `${profile.id}/${rendicionId}/${i}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("comprobantes")
        .upload(path, comprobanteBuffer, { contentType: "image/jpeg", upsert: true });
      if (!upErr) {
        await supabase.from("gastos").update({ comprobante_url: path }).eq("id", gastoRow.id);
      }
    }

    totalGastado += g.monto;
    gastosPdf.push({
      fechaLabel: formatFechaArg(g.fecha),
      categoria: g.categoria.trim(),
      tecnicos: g.tecnicos.map((t) => t.nombre.trim()).join(", "),
      descripcion: g.descripcion.trim(),
      monto: g.monto,
      comprobanteBuffer,
    });
  }

  // Logo de la empresa para la cabecera del PDF.
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

  const saldo = viatico - totalGastado;
  const pdfBuffer = await renderRendicionGastosPdf({
    numeroGeneracion,
    motivo: payload.motivo.trim(),
    fechaLabel: formatFechaArg(payload.fecha),
    proyectoCliente: payload.proyectoCliente.trim() || null,
    provincia: payload.provincia || null,
    tecnicosInvolucrados: Array.from(tecnicosInvolucradosMap.entries()).map(([nombre, torre]) => ({ nombre, torre })),
    viaticoRecibido: viatico,
    moneda: payload.moneda,
    gastos: gastosPdf,
    totalGastado,
    saldo,
    logoBuffer,
    appName: "Rendición de Gastos App",
    realizoNombre: profile.nombreCompleto,
  });

  const pdfFilename = buildRendicionGastosFilename({
    numeroGeneracion,
    motivo: payload.motivo.trim(),
    provincia: payload.provincia || null,
  });
  const pdfPath = `${profile.id}/${rendicionId}/${pdfFilename}`;
  const { error: pdfUpErr } = await supabase.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

  let pdfUrl: string | null = null;
  if (!pdfUpErr) {
    await supabase.from("rendiciones_gastos").update({ pdf_url: pdfPath, estado: "cerrada" }).eq("id", rendicionId);
    const { data: signed } = await supabase.storage.from("informes-pdf").createSignedUrl(pdfPath, 60 * 60);
    pdfUrl = signed?.signedUrl ?? null;
  }

  return { success: true, rendicionId, numeroGeneracion, pdfUrl };
}
