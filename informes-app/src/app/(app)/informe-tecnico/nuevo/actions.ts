"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { nuevoNumeroGeneracionInforme } from "@/lib/informe-tecnico/numero-generacion";
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
interface PayloadImagenMeta {
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
  tomadaEn: string;
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
  imagenes: PayloadImagenMeta[];
  emailsSeleccionados: string[];
  numeroGeneracionPreferido: string;
}

export interface CrearInformeResult {
  success: boolean;
  error?: string;
  numeroGeneracion?: string;
  pdfUrl?: string | null;
  emailEnviado?: boolean;
}

function formatFechaArg(fecha: string): string {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

async function enviarEmailInforme(opts: {
  to: string[];
  numeroGeneracion: string;
  titulo: string;
  pdfBuffer: Buffer;
  filename: string;
}): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "informes@resend.dev",
        to: opts.to,
        subject: `Informe Técnico ${opts.numeroGeneracion} — ${opts.titulo}`,
        text: `Se generó el informe técnico ${opts.numeroGeneracion} (${opts.titulo}). Se adjunta el PDF.`,
        attachments: [{ filename: opts.filename, content: opts.pdfBuffer.toString("base64") }],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function crearInformeTecnicoAction(formData: FormData): Promise<CrearInformeResult> {
  const profile = await requireProfile();

  const raw = formData.get("payload");
  if (typeof raw !== "string") {
    return { success: false, error: "Datos inválidos." };
  }
  let payload: Payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { success: false, error: "Datos inválidos." };
  }

  if (!payload.titulo?.trim() || !payload.fecha || !payload.cliente?.trim() || !payload.proyecto?.trim()) {
    return { success: false, error: "Faltan campos obligatorios (título, fecha, cliente, proyecto)." };
  }

  const supabase = await createClient();

  // Tipo de informe: alta al vuelo si es nuevo (spec sección 6.1 / 9.3).
  const tipoInformeFinal =
    payload.tipoInforme === "__new" ? payload.tipoInformeNuevo.trim() : payload.tipoInforme.trim();
  if (tipoInformeFinal) {
    await supabase
      .from("catalogo_tipos_informe")
      .upsert({ nombre: tipoInformeFinal }, { onConflict: "nombre", ignoreDuplicates: true });
  }

  // Técnicos y torres al catálogo compartido (alta al vuelo).
  for (const t of payload.tecnicos) {
    const torre = t.torre?.trim();
    if (torre) {
      await supabase.from("catalogo_torres").upsert({ nombre: torre }, { onConflict: "nombre", ignoreDuplicates: true });
    }
    const nombre = t.nombre?.trim();
    if (nombre) {
      await supabase
        .from("catalogo_tecnicos")
        .upsert(
          { nombre_completo: nombre, torre: torre || null, created_by: profile.id },
          { onConflict: "nombre_completo", ignoreDuplicates: true },
        );
    }
  }

  // Número de generación único (INF-{año}-{4 dígitos}), con reintento ante colisión.
  let numeroGeneracion = payload.numeroGeneracionPreferido || nuevoNumeroGeneracionInforme();
  let informeId: string | null = null;
  for (let attempt = 0; attempt < 5 && !informeId; attempt++) {
    const { data, error } = await supabase
      .from("informes_tecnicos")
      .insert({
        numero_generacion: numeroGeneracion,
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
        created_by: profile.id,
        estado: "borrador",
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        numeroGeneracion = nuevoNumeroGeneracionInforme();
        continue;
      }
      return { success: false, error: `No se pudo guardar el informe: ${error.message}` };
    }
    informeId = data!.id;
  }
  if (!informeId) {
    return { success: false, error: "No se pudo asignar un número de generación único. Probá de nuevo." };
  }

  if (payload.tecnicos.length) {
    const { error } = await supabase.from("informe_tecnicos_asignados").insert(
      payload.tecnicos.map((t) => ({
        informe_id: informeId!,
        tecnico_nombre: t.nombre.trim(),
        torre: t.torre?.trim() || null,
        es_tecnico_seguridad: t.esSeguridad,
      })),
    );
    if (error) return { success: false, error: `No se pudieron guardar los técnicos: ${error.message}` };
  }

  if (payload.vehiculos.length) {
    const { error } = await supabase.from("informe_vehiculos").insert(
      payload.vehiculos.map((v) => ({
        informe_id: informeId!,
        patente: v.patente.trim(),
        marca_modelo: v.marcaModelo?.trim() || null,
      })),
    );
    if (error) return { success: false, error: `No se pudieron guardar los vehículos: ${error.message}` };
  }

  // Imágenes: subir a Storage, insertar la fila y guardar el buffer para el PDF.
  const imagenesPdf: { buffer: Buffer; lat: number | null; lon: number | null; accuracyM: number | null }[] = [];
  for (let i = 0; i < payload.imagenes.length; i++) {
    const file = formData.get(`imagen_${i}`);
    if (!(file instanceof File)) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    const path = `${profile.id}/${informeId}/${i}.jpg`;
    const { error: upErr } = await supabase.storage
      .from("informe-fotos")
      .upload(path, buffer, { contentType: "image/jpeg", upsert: true });
    if (upErr) continue; // una foto que falla no debe tirar abajo todo el informe

    const meta = payload.imagenes[i];
    await supabase.from("informe_imagenes").insert({
      informe_id: informeId,
      url: path,
      lat: meta.lat,
      lon: meta.lon,
      accuracy_m: meta.accuracyM,
      tomada_en: meta.tomadaEn,
      orden: i,
    });
    imagenesPdf.push({ buffer, lat: meta.lat, lon: meta.lon, accuracyM: meta.accuracyM });
  }

  // Config general: logo de la empresa (cabecera del PDF) + envío automático.
  const { data: config } = await supabase
    .from("config_general")
    .select("logo_empresa_url, auto_enviar_email")
    .eq("id", 1)
    .single();

  let logoBuffer: Buffer | null = null;
  if (config?.logo_empresa_url) {
    try {
      const res = await fetch(config.logo_empresa_url);
      if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer());
    } catch {
      // seguimos sin logo antes que fallar la generación del PDF
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

  // Nombre de archivo legible (N° de generación, fecha/hora, tarea, provincia,
  // ubicación) en vez del id interno — así se identifica solo al descargarlo.
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

  let emailEnviado = false;
  if (config?.auto_enviar_email && payload.emailsSeleccionados.length && process.env.RESEND_API_KEY) {
    emailEnviado = await enviarEmailInforme({
      to: payload.emailsSeleccionados,
      numeroGeneracion,
      titulo: payload.titulo.trim(),
      pdfBuffer,
      filename: pdfFilename,
    });
  }

  return { success: true, numeroGeneracion, pdfUrl, emailEnviado };
}
