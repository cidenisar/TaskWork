"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { renderInformeTecnicoPdf } from "@/lib/pdf/render";
import { buildInformeTecnicoFilename } from "@/lib/pdf/filename";

interface PayloadTecnico {
  nombre: string;
  torre: string;
  esSeguridad: boolean;
}
interface PayloadVehiculo {
  patente: string;
  marcaModelo: string;
}
interface Payload {
  titulo: string;
  fecha: string;
  cliente: string;
  proyecto: string;
  ticketNumero: string;
  tipoInforme: string;
  tipoInformeNuevo: string;
  permisoTrabajo: string;
  provincia: string;
  ubicacion: string;
  descripcionTrabajo: string;
  tareasPendientes: string;
  tecnicos: PayloadTecnico[];
  vehiculos: PayloadVehiculo[];
}

export interface ActualizarInformeResult {
  success: boolean;
  error?: string;
  pdfUrl?: string | null;
}

function formatFechaArg(fecha: string): string {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

/**
 * Edita un informe ya generado — spec: "solo datos, las fotos quedan como
 * están" (no se agregan/sacan fotos acá, ver Step3Imagenes solo en creación).
 * Reemplaza técnicos/vehículos asignados, actualiza los campos de texto, y
 * regenera el PDF con los mismos datos de fotos que ya tenía guardados.
 */
export async function actualizarInformeTecnicoAction(
  informeId: string,
  formData: FormData,
): Promise<ActualizarInformeResult> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const raw = formData.get("payload");
  if (typeof raw !== "string") return { success: false, error: "Datos inválidos." };
  let payload: Payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { success: false, error: "Datos inválidos." };
  }
  if (!payload.titulo?.trim() || !payload.fecha || !payload.cliente?.trim() || !payload.proyecto?.trim()) {
    return { success: false, error: "Faltan campos obligatorios (título, fecha, cliente, proyecto)." };
  }

  // RLS (informes_tecnicos_select_own) ya filtra esto a informes propios —
  // si no es el dueño, esto devuelve null y cortamos acá.
  const { data: informeActual, error: fetchErr } = await supabase
    .from("informes_tecnicos")
    .select("numero_generacion")
    .eq("id", informeId)
    .single();
  if (fetchErr || !informeActual) {
    return { success: false, error: "No se encontró el informe, o no tenés permiso para editarlo." };
  }
  const numeroGeneracion = informeActual.numero_generacion;

  const tipoInformeFinal =
    payload.tipoInforme === "__new" ? payload.tipoInformeNuevo.trim() : payload.tipoInforme.trim();
  if (tipoInformeFinal) {
    await supabase
      .from("catalogo_tipos_informe")
      .upsert({ nombre: tipoInformeFinal }, { onConflict: "nombre", ignoreDuplicates: true });
  }
  for (const t of payload.tecnicos) {
    const torre = t.torre?.trim();
    if (torre) {
      await supabase.from("catalogo_torres").upsert({ nombre: torre }, { onConflict: "nombre", ignoreDuplicates: true });
    }
  }

  const { error: updErr } = await supabase
    .from("informes_tecnicos")
    .update({
      titulo: payload.titulo.trim(),
      fecha: payload.fecha,
      cliente: payload.cliente.trim(),
      proyecto: payload.proyecto.trim(),
      ticket_numero: payload.ticketNumero.trim() || null,
      permiso_trabajo: payload.permisoTrabajo.trim() || null,
      tipo_informe: tipoInformeFinal || null,
      provincia: payload.provincia || null,
      ubicacion: payload.ubicacion.trim() || null,
      descripcion_trabajo: payload.descripcionTrabajo.trim() || null,
      tareas_pendientes: payload.tareasPendientes.trim() || null,
    })
    .eq("id", informeId);
  if (updErr) return { success: false, error: `No se pudo actualizar el informe: ${updErr.message}` };

  // Técnicos y vehículos asignados: se reemplazan enteros (borrar + volver a
  // insertar) en vez de tratar de diffear — mucho más simple y el volumen es
  // chico (unos pocos por informe).
  await supabase.from("informe_tecnicos_asignados").delete().eq("informe_id", informeId);
  if (payload.tecnicos.length) {
    const { error } = await supabase.from("informe_tecnicos_asignados").insert(
      payload.tecnicos.map((t) => ({
        informe_id: informeId,
        tecnico_nombre: t.nombre.trim(),
        torre: t.torre?.trim() || null,
        es_tecnico_seguridad: t.esSeguridad,
      })),
    );
    if (error) return { success: false, error: `No se pudieron guardar los técnicos: ${error.message}` };
  }

  await supabase.from("informe_vehiculos").delete().eq("informe_id", informeId);
  if (payload.vehiculos.length) {
    const { error } = await supabase.from("informe_vehiculos").insert(
      payload.vehiculos.map((v) => ({
        informe_id: informeId,
        patente: v.patente.trim(),
        marca_modelo: v.marcaModelo?.trim() || null,
      })),
    );
    if (error) return { success: false, error: `No se pudieron guardar los vehículos: ${error.message}` };
  }

  // Fotos: se quedan como estaban — las traemos de vuelta desde Storage para
  // regenerar el PDF con los datos de texto ya corregidos.
  const { data: imagenesRows } = await supabase
    .from("informe_imagenes")
    .select("url, lat, lon, accuracy_m")
    .eq("informe_id", informeId)
    .order("orden");

  const imagenesPdf: { buffer: Buffer; lat: number | null; lon: number | null; accuracyM: number | null }[] = [];
  for (const img of imagenesRows ?? []) {
    const { data: blob } = await supabase.storage.from("informe-fotos").download(img.url);
    if (!blob) continue; // una foto que ya no está disponible no debe tirar abajo la edición
    imagenesPdf.push({
      buffer: Buffer.from(await blob.arrayBuffer()),
      lat: img.lat,
      lon: img.lon,
      accuracyM: img.accuracy_m,
    });
  }

  const { data: config } = await supabase.from("config_general").select("logo_empresa_url").eq("id", 1).single();
  let logoBuffer: Buffer | null = null;
  if (config?.logo_empresa_url) {
    try {
      const res = await fetch(config.logo_empresa_url);
      if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer());
    } catch {
      // seguimos sin logo antes que fallar la regeneración del PDF
    }
  }

  const tareasPendientes = payload.tareasPendientes
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const pdfBuffer = await renderInformeTecnicoPdf({
    numeroGeneracion,
    titulo: payload.titulo.trim(),
    fechaLabel: formatFechaArg(payload.fecha),
    cliente: payload.cliente.trim(),
    proyecto: payload.proyecto.trim(),
    ticketNumero: payload.ticketNumero.trim() || null,
    tipoInforme: tipoInformeFinal || null,
    permisoTrabajo: payload.permisoTrabajo.trim() || null,
    provincia: payload.provincia || null,
    ubicacion: payload.ubicacion.trim() || null,
    descripcionTrabajo: payload.descripcionTrabajo.trim() || null,
    tareasPendientes,
    tecnicos: payload.tecnicos.map((t) => ({
      nombre: t.nombre.trim(),
      torre: t.torre?.trim() || null,
      esSeguridad: t.esSeguridad,
    })),
    vehiculos: payload.vehiculos.map((v) => ({
      patente: v.patente.trim(),
      marcaModelo: v.marcaModelo?.trim() || null,
    })),
    imagenes: imagenesPdf,
    logoBuffer,
    appName: "Informe Técnico App",
    realizoNombre: profile.nombreCompleto,
  });

  const pdfFilename = buildInformeTecnicoFilename({
    numeroGeneracion,
    titulo: payload.titulo.trim(),
    provincia: payload.provincia || null,
    ubicacion: payload.ubicacion.trim() || null,
  });
  const pdfPath = `${profile.id}/${informeId}/${pdfFilename}`;
  const { error: pdfUpErr } = await supabase.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

  let pdfUrl: string | null = null;
  if (!pdfUpErr) {
    await supabase
      .from("informes_tecnicos")
      .update({ pdf_url: pdfPath, pdf_generado_at: new Date().toISOString(), estado: "generado" })
      .eq("id", informeId);
    const { data: signed } = await supabase.storage.from("informes-pdf").createSignedUrl(pdfPath, 60 * 60);
    pdfUrl = signed?.signedUrl ?? null;
  }

  return { success: true, pdfUrl };
}
