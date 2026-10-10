import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, CondicionMaterial, MotivoEntregaDeposito } from "@/lib/database.types";
import { nuevoNumeroGeneracionEntrega } from "@/lib/deposito/numero-generacion";
import { renderEntregaDepositoPdf } from "@/lib/pdf/render";
import { buildEntregaDepositoFilename } from "@/lib/pdf/filename";

export interface MaterialLoteDeposito {
  descripcion: string;
  categoria: string;
  marcaModelo: string;
  numeroSerie: string;
  etiquetaYpf: string;
  cantidad: number;
  condicion: CondicionMaterial;
  motivo: MotivoEntregaDeposito;
  comentario: string;
}

export interface CrearEntregaDepositoLoteParams {
  /** Cliente normal (RLS exige Admin/Supervisor) o de service-role (para bypassear esa policy en un flujo puntual ya auditado en código — ver Instalación). */
  supabase: SupabaseClient<Database>;
  ubicacionId: string;
  ubicacion: { region: string; provincia: string; localidad: string | null; sitio: string; planta: string | null; oficina: string | null };
  fecha: string;
  materiales: MaterialLoteDeposito[];
  createdBy: string;
  realizoNombre: string;
  /** Fotos ya redimensionadas a JPEG — máximo 2, las de más se ignoran. */
  fotosEvidencia: Buffer[];
}

export interface CrearEntregaDepositoLoteResult {
  success: boolean;
  error?: string;
  numeroGeneracion?: string;
}

/**
 * Lógica compartida de "cargar un lote de materiales a Entregas a Depósito"
 * (N° de generación único por SELECT+reintento, insert en bloque, fotos de
 * evidencia, PDF, upload) — extraída de `entregarLoteADepositoAction` para
 * que también la use la devolución automática de sobrantes de Instalación,
 * sin duplicar el render del PDF ni el manejo de colisión del número.
 */
export async function crearEntregaDepositoLote(params: CrearEntregaDepositoLoteParams): Promise<CrearEntregaDepositoLoteResult> {
  const { supabase, ubicacionId, ubicacion, fecha, materiales, createdBy, realizoNombre, fotosEvidencia } = params;

  let numeroGeneracion = nuevoNumeroGeneracionEntrega();
  for (let intento = 0; intento < 5; intento++) {
    const { data: existente } = await supabase
      .from("entregas_deposito")
      .select("id")
      .eq("numero_generacion", numeroGeneracion)
      .limit(1)
      .maybeSingle();
    if (!existente) break;
    numeroGeneracion = nuevoNumeroGeneracionEntrega();
  }

  const { data: filasInsertadas, error: insertError } = await supabase
    .from("entregas_deposito")
    .insert(
      materiales.map((m) => ({
        numero_generacion: numeroGeneracion,
        origen: "material_libre" as const,
        descripcion: m.descripcion.trim(),
        categoria: m.categoria.trim() || null,
        marca_modelo: m.marcaModelo.trim() || null,
        numero_serie: m.numeroSerie.trim() || null,
        etiqueta_ypf: m.etiquetaYpf.trim() || null,
        cantidad: m.cantidad || 1,
        condicion: m.condicion,
        motivo: m.motivo,
        comentario: m.comentario.trim() || null,
        ubicacion_id: ubicacionId,
        fecha,
        created_by: createdBy,
      })),
    )
    .select("id");
  if (insertError || !filasInsertadas || filasInsertadas.length === 0) {
    return { success: false, error: `No se pudo registrar la entrega: ${insertError?.message ?? "error desconocido"}` };
  }
  const idsInsertados = filasInsertadas.map((f) => f.id);

  const fotosEvidenciaBuffers: Buffer[] = [];
  const fotosEvidenciaPaths: string[] = [];
  for (const [i, buf] of fotosEvidencia.slice(0, 2).entries()) {
    const fotoPath = `${createdBy}/entregas-deposito/${numeroGeneracion}/evidencia-${i + 1}.jpg`;
    const { error: fotoUpErr } = await supabase.storage
      .from("informe-fotos")
      .upload(fotoPath, buf, { contentType: "image/jpeg", upsert: true });
    if (!fotoUpErr) {
      fotosEvidenciaBuffers.push(buf);
      fotosEvidenciaPaths.push(fotoPath);
    }
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

  const pdfBuffer = await renderEntregaDepositoPdf({
    numeroGeneracion,
    region: ubicacion.region,
    provincia: ubicacion.provincia,
    localidad: ubicacion.localidad,
    sitio: ubicacion.sitio,
    planta: ubicacion.planta,
    oficina: ubicacion.oficina,
    fecha,
    items: materiales.map((m) => ({
      tipoEquipoLabel: null,
      descripcion: m.descripcion.trim(),
      categoria: m.categoria.trim() || null,
      marcaModelo: m.marcaModelo.trim() || null,
      numeroSerie: m.numeroSerie.trim() || null,
      etiquetaYpf: m.etiquetaYpf.trim() || null,
      cantidad: m.cantidad || 1,
      condicion: m.condicion,
      motivo: m.motivo,
      comentario: m.comentario.trim() || null,
    })),
    fotosEvidenciaBuffers: fotosEvidenciaBuffers.length > 0 ? fotosEvidenciaBuffers : null,
    logoBuffer,
    appName: "Informe Técnico App",
    realizoNombre,
  });

  const detalleArchivo = materiales.length === 1 ? materiales[0].descripcion : `${materiales.length}-materiales`;
  const pdfFilename = buildEntregaDepositoFilename({ numeroGeneracion, descripcion: detalleArchivo, sitio: ubicacion.sitio });
  const pdfPath = `${createdBy}/entregas-deposito/${numeroGeneracion}/${pdfFilename}`;
  const { error: pdfUpErr } = await supabase.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (!pdfUpErr) {
    await supabase
      .from("entregas_deposito")
      .update({
        pdf_url: pdfPath,
        pdf_generado_at: new Date().toISOString(),
        fotos_evidencia_urls: fotosEvidenciaPaths.length > 0 ? fotosEvidenciaPaths : null,
      })
      .in("id", idsInsertados);
  }

  return { success: true, numeroGeneracion };
}
