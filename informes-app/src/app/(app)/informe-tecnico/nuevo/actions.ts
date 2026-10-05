"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { nuevoNumeroGeneracionInforme } from "@/lib/informe-tecnico/numero-generacion";
import { renderInformeTecnicoPdf } from "@/lib/pdf/render";
import { buildInformeTecnicoFilename } from "@/lib/pdf/filename";
import { resolverUbicacionId, tagGpsSiFalta, type PayloadGps } from "@/lib/ubicaciones/resolver";
import { crearEntregaDepositoLote, type MaterialLoteDeposito } from "@/lib/deposito/crear-lote";
import { CATEGORIA_EQUIPO_LABEL } from "@/components/equipos/types";
import type { EquipoCategoria } from "@/lib/database.types";

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
interface PayloadMaterial {
  categoriaEquipo: EquipoCategoria;
  descripcion: string;
  marcaModelo: string;
  numeroSerie: string;
  etiquetaYpf: string;
  cantidad: number;
  consumoPromedioW: number | null;
  consumoMaxW: number | null;
  comentario: string;
}
interface PayloadRemitoItem {
  descripcion: string;
  cantidadEsperada: number;
  cantidadSobrante: number;
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
  provinciaFiltro: string;
  ubicacionId: string; // "" | "__new" | id
  localidadNueva: string;
  sitioNueva: string;
  plantaNueva: string;
  oficinaNueva: string;
  gps: PayloadGps | null;
  descripcionTrabajo: string;
  tareasPendientes: string;
  tecnicos: PayloadTecnico[];
  vehiculos: PayloadVehiculo[];
  imagenes: PayloadImagenMeta[];
  emailsSeleccionados: string[];
  numeroGeneracionPreferido: string;
  materiales: PayloadMaterial[];
  remitoNumero: string | null;
  remitoItems: PayloadRemitoItem[];
}

/**
 * La Ubicación en Informe Técnico es opcional (a diferencia de Tableros/
 * Racks) — si no se eligió ni se creó ninguna, devuelve todo null sin
 * error. Si se eligió/creó una, la resuelve igual que el resto de los
 * módulos y devuelve también el texto plano que esperan el PDF y el
 * cálculo de mantenimiento predictivo de Estadísticas (que todavía leen
 * `provincia`/`ubicacion` como texto libre — migrarlos a `ubicacion_id`
 * directamente queda para una próxima vuelta).
 */
async function resolverUbicacionInforme(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: Payload,
  userId: string,
): Promise<{ ubicacionId: string | null; provincia: string | null; ubicacionTexto: string | null } | { error: string }> {
  if (!payload.ubicacionId) return { ubicacionId: null, provincia: null, ubicacionTexto: null };

  const resuelta = await resolverUbicacionId(
    supabase,
    {
      ubicacionId: payload.ubicacionId !== "__new" ? payload.ubicacionId : null,
      ubicacionNueva:
        payload.ubicacionId === "__new"
          ? {
              provincia: payload.provinciaFiltro,
              localidad: payload.localidadNueva,
              sitio: payload.sitioNueva,
              planta: payload.plantaNueva,
              oficina: payload.oficinaNueva,
            }
          : null,
    },
    userId,
    "el informe",
  );
  if ("error" in resuelta) return { error: resuelta.error };

  await tagGpsSiFalta(supabase, resuelta.id, payload.gps, userId);

  const { data: ubicacionRow } = await supabase
    .from("ubicaciones")
    .select("provincia, localidad, sitio, planta, oficina")
    .eq("id", resuelta.id)
    .single();
  if (!ubicacionRow) return { error: "No se encontró la ubicación recién resuelta." };

  const ubicacionTexto = [ubicacionRow.oficina, ubicacionRow.planta, ubicacionRow.sitio].filter(Boolean).join(" - ") || null;
  return { ubicacionId: resuelta.id, provincia: ubicacionRow.provincia, ubicacionTexto };
}

export interface CrearInformeResult {
  success: boolean;
  error?: string;
  informeId?: string;
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
  if (payload.materiales.length > 0 && !payload.ubicacionId) {
    return { success: false, error: "Elegí una ubicación para poder agregar materiales/equipos." };
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

  // Cliente al catálogo compartido (alta al vuelo) — mismo criterio que
  // Tipo de Informe/Torre: si ya existe no pasa nada (ignoreDuplicates), y
  // así queda sugerido la próxima vez sin que un Admin lo tenga que cargar
  // a mano en Configuración primero.
  const clienteValue = payload.cliente.trim();
  if (clienteValue) {
    await supabase.from("catalogo_clientes").upsert({ nombre: clienteValue }, { onConflict: "nombre", ignoreDuplicates: true });
  }

  // Torres al catálogo compartido (alta al vuelo). El técnico en sí ya no se
  // da de alta acá — el catálogo de técnicos es la lista de usuarios
  // registrados (Configuración → Usuarios y roles); acá solo se guarda la
  // torre asignada para ESTE informe puntual, que puede diferir de la torre
  // "de base" del técnico en su perfil.
  for (const t of payload.tecnicos) {
    const torre = t.torre?.trim();
    if (torre) {
      await supabase.from("catalogo_torres").upsert({ nombre: torre }, { onConflict: "nombre", ignoreDuplicates: true });
    }
  }

  const ubicacionResuelta = await resolverUbicacionInforme(supabase, payload, profile.id);
  if ("error" in ubicacionResuelta) return { success: false, error: ubicacionResuelta.error };

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
        provincia: ubicacionResuelta.provincia,
        ubicacion: ubicacionResuelta.ubicacionTexto,
        ubicacion_id: ubicacionResuelta.ubicacionId,
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

  // Materiales/equipos (opcional): cada uno se da de alta como equipo real
  // en `equipos` (estado='activo') — `equipos_insert` ya es abierta a
  // cualquier autenticado, no hace falta service-role para esto — y queda
  // vinculado a este informe vía `informe_materiales`.
  const materialesPdf: {
    categoriaLabel: string;
    descripcion: string;
    marcaModelo: string | null;
    numeroSerie: string | null;
    etiquetaYpf: string | null;
    cantidad: number;
    comentario: string | null;
  }[] = [];
  if (payload.materiales.length > 0 && ubicacionResuelta.ubicacionId) {
    const ubicacionIdMateriales = ubicacionResuelta.ubicacionId;
    for (const m of payload.materiales) {
      const { data: nuevoEquipo, error: equipoErr } = await supabase
        .from("equipos")
        .insert({
          ubicacion_id: ubicacionIdMateriales,
          categoria_equipo: m.categoriaEquipo,
          texto: m.descripcion.trim(),
          marca_modelo: m.marcaModelo.trim() || null,
          numero_serie: m.numeroSerie.trim() || null,
          etiqueta_ypf: m.etiquetaYpf.trim() || null,
          cantidad: m.cantidad || 1,
          consumo_promedio_w: m.consumoPromedioW,
          consumo_max_w: m.consumoMaxW,
          created_by: profile.id,
        })
        .select("id")
        .single();
      if (equipoErr || !nuevoEquipo) continue; // un material que falla no debe tirar abajo todo el informe

      await supabase.from("informe_materiales").insert({
        informe_id: informeId,
        categoria_equipo: m.categoriaEquipo,
        descripcion: m.descripcion.trim(),
        marca_modelo: m.marcaModelo.trim() || null,
        numero_serie: m.numeroSerie.trim() || null,
        etiqueta_ypf: m.etiquetaYpf.trim() || null,
        cantidad: m.cantidad || 1,
        consumo_promedio_w: m.consumoPromedioW,
        consumo_max_w: m.consumoMaxW,
        comentario: m.comentario.trim() || null,
        equipo_id: nuevoEquipo.id,
      });
      materialesPdf.push({
        categoriaLabel: CATEGORIA_EQUIPO_LABEL[m.categoriaEquipo],
        descripcion: m.descripcion.trim(),
        marcaModelo: m.marcaModelo.trim() || null,
        numeroSerie: m.numeroSerie.trim() || null,
        etiquetaYpf: m.etiquetaYpf.trim() || null,
        cantidad: m.cantidad || 1,
        comentario: m.comentario.trim() || null,
      });
    }
  }

  // Remito (opcional): foto + N° se guardan en el informe; los sobrantes
  // marcados generan sola una devolución a depósito. `entregas_deposito` es
  // admin/supervisor-only por RLS, así que ese paso puntual usa
  // service-role — cualquier técnico puede cargar materiales en su propio
  // informe, la devolución es un efecto mecánico de eso, no una decisión
  // operativa nueva (mismo criterio que Bajas/"traer de depósito").
  const remitoFotoBuffers: Buffer[] = [];
  const remitoFotoPaths: string[] = [];
  const remitoFotosRecibidas = formData.getAll("remitoFoto").filter((f): f is File => f instanceof File);
  for (let i = 0; i < remitoFotosRecibidas.length; i++) {
    const buffer = Buffer.from(await remitoFotosRecibidas[i].arrayBuffer());
    const path = `${profile.id}/${informeId}/remito-${i + 1}.jpg`;
    const { error: fotoUpErr } = await supabase.storage
      .from("informe-fotos")
      .upload(path, buffer, { contentType: "image/jpeg", upsert: true });
    if (!fotoUpErr) {
      remitoFotoBuffers.push(buffer);
      remitoFotoPaths.push(path);
    }
  }

  const sobrantes = payload.remitoItems.filter((r) => r.cantidadSobrante > 0);
  let entregaDepositoNumeroGeneracion: string | null = null;
  if (sobrantes.length > 0 && ubicacionResuelta.ubicacionId) {
    let service: ReturnType<typeof createServiceRoleClient>;
    try {
      service = createServiceRoleClient();
    } catch {
      return {
        success: false,
        error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor — sin esa variable no se puede generar la devolución de sobrantes.",
      };
    }
    const { data: ubicacionRowDevolucion } = await supabase
      .from("ubicaciones")
      .select("region, provincia, localidad, sitio, planta, oficina")
      .eq("id", ubicacionResuelta.ubicacionId)
      .single();
    if (ubicacionRowDevolucion) {
      const materialesSobrantes: MaterialLoteDeposito[] = sobrantes.map((r) => ({
        descripcion: r.descripcion,
        categoria: "",
        marcaModelo: "",
        numeroSerie: "",
        etiquetaYpf: "",
        cantidad: r.cantidadSobrante,
        condicion: "nuevo",
        motivo: "sobrante_obra",
        comentario: `Sobrante del Informe Técnico ${numeroGeneracion}${payload.remitoNumero ? ` (remito ${payload.remitoNumero})` : ""}.`,
      }));
      const resultadoDevolucion = await crearEntregaDepositoLote({
        supabase: service,
        ubicacionId: ubicacionResuelta.ubicacionId,
        ubicacion: ubicacionRowDevolucion,
        fecha: payload.fecha,
        materiales: materialesSobrantes,
        createdBy: profile.id,
        realizoNombre: profile.nombreCompleto,
        fotosEvidencia: [],
      });
      if (resultadoDevolucion.success) {
        entregaDepositoNumeroGeneracion = resultadoDevolucion.numeroGeneracion ?? null;
      }
    }
  }

  if (remitoFotoPaths.length > 0 || payload.remitoNumero || entregaDepositoNumeroGeneracion) {
    await supabase
      .from("informes_tecnicos")
      .update({
        remito_fotos_urls: remitoFotoPaths.length > 0 ? remitoFotoPaths : null,
        remito_numero: payload.remitoNumero,
        entrega_deposito_numero_generacion: entregaDepositoNumeroGeneracion,
      })
      .eq("id", informeId);
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
    provincia: ubicacionResuelta.provincia,
    ubicacion: ubicacionResuelta.ubicacionTexto,
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
    materiales: materialesPdf,
    remitoNumero: payload.remitoNumero,
    remitoItems: payload.remitoItems,
    remitoFotoBuffers,
    entregaDepositoNumeroGeneracion,
    logoBuffer,
    appName: "Informe Técnico App",
    realizoNombre: profile.nombreCompleto,
  });

  // Nombre de archivo legible (N° de generación, fecha/hora, tarea, provincia,
  // ubicación) en vez del id interno — así se identifica solo al descargarlo.
  const pdfFilename = buildInformeTecnicoFilename({
    numeroGeneracion,
    titulo: payload.titulo.trim(),
    provincia: ubicacionResuelta.provincia,
    ubicacion: ubicacionResuelta.ubicacionTexto,
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

  return { success: true, informeId: informeId!, numeroGeneracion, pdfUrl, emailEnviado };
}
