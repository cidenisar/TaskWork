"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { nuevoNumeroGeneracionInforme } from "@/lib/informe-tecnico/numero-generacion";
import { renderInformeTecnicoPdf } from "@/lib/pdf/render";
import { buildInformeTecnicoFilename } from "@/lib/pdf/filename";
import { resolverUbicacionId, tagGpsSiFalta, type PayloadGps } from "@/lib/ubicaciones/resolver";
import { crearEntregaDepositoLote, type MaterialLoteDeposito } from "@/lib/deposito/crear-lote";
import { CATEGORIA_EQUIPO_LABEL } from "@/components/equipos/types";
import { ejecutarBaja } from "@/lib/equipamiento/dar-de-baja";
import type { EquipoCategoria, EstadoChecklist, RackCategoriaEquipo, TipoEquipoBaja } from "@/lib/database.types";

/**
 * Antes de dar de alta un equipo nuevo suelto, chequea si ya existe uno
 * ACTIVO con el mismo N° de serie o etiqueta YPF en el mismo sitio — evita
 * duplicar el mismo equipo físico si quedó cargado dos veces (dos informes
 * distintos, o un olvido). No es búsqueda difusa: solo coincidencia exacta
 * de un dato identificador real.
 */
async function buscarEquipoDuplicado(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ubicacionId: string,
  numeroSerie: string,
  etiquetaYpf: string,
): Promise<string | null> {
  if (numeroSerie) {
    const { data } = await supabase.from("equipos").select("id").eq("ubicacion_id", ubicacionId).eq("estado", "activo").eq("numero_serie", numeroSerie).limit(1).maybeSingle();
    if (data) return data.id;
  }
  if (etiquetaYpf) {
    const { data } = await supabase.from("equipos").select("id").eq("ubicacion_id", ubicacionId).eq("estado", "activo").eq("etiqueta_ypf", etiquetaYpf).limit(1).maybeSingle();
    if (data) return data.id;
  }
  return null;
}

/** Mismo chequeo que buscarEquipoDuplicado, pero para un componente dentro de un rack puntual. */
async function buscarRackEquipamientoDuplicado(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rackId: string,
  numeroSerie: string,
  etiquetaYpf: string,
): Promise<string | null> {
  if (numeroSerie) {
    const { data } = await supabase.from("rack_equipamientos").select("id").eq("rack_id", rackId).eq("estado", "activo").eq("numero_serie", numeroSerie).limit(1).maybeSingle();
    if (data) return data.id;
  }
  if (etiquetaYpf) {
    const { data } = await supabase.from("rack_equipamientos").select("id").eq("rack_id", rackId).eq("estado", "activo").eq("etiqueta_ypf", etiquetaYpf).limit(1).maybeSingle();
    if (data) return data.id;
  }
  return null;
}

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
  /** Si está elegido, el alta va a `rack_equipamientos` (en ese rack) en vez de a `equipos`. */
  rackId: string | null;
  reemplazaEquipoId: string | null;
  reemplazaTipo: TipoEquipoBaja | null;
}
interface PayloadRemitoItem {
  descripcion: string;
  cantidadEsperada: number;
  cantidadSobrante: number;
}
interface PayloadHallazgo {
  itemId: string;
  estado: EstadoChecklist;
  comentario: string;
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
  hallazgos?: PayloadHallazgo[];
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

  // Inspección IA (opcional): solo los ítems que el técnico confirmó/corrigió
  // (estado no nulo) — ver catalogo_inspeccion_ia (modulo="informe_tecnico").
  if (payload.hallazgos && payload.hallazgos.length > 0) {
    await supabase.from("inspeccion_ia_hallazgos").insert(
      payload.hallazgos.map((h) => ({
        modulo: "informe_tecnico" as const,
        registro_id: informeId!,
        item_id: h.itemId,
        estado: h.estado,
        comentario: h.comentario.trim() || null,
      })),
    );
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
  // — en `equipos` (suelto, estado='activo') o, si el técnico marcó que va
  // dentro de un rack ya registrado, en `rack_equipamientos` — y queda
  // vinculado a este informe vía `informe_materiales`. Ambas tablas tienen
  // INSERT abierto a cualquier autenticado, no hace falta service-role para
  // esto. Si coincide N° de serie/etiqueta YPF con un equipo ya activo en
  // el mismo ámbito, no se duplica: se linkea al existente. Si el técnico
  // marcó "reemplaza a", la baja automática del viejo sí necesita Service
  // Role (RLS de UPDATE en esas tablas es admin-only) — mismo criterio que
  // la devolución a depósito del sobrante del remito: es un efecto
  // mecánico de una decisión que el técnico ya tomó en el campo, no una
  // habilitación nueva de rol.
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
    let serviceParaBajas: ReturnType<typeof createServiceRoleClient> | null = null;
    for (let indiceMaterial = 0; indiceMaterial < payload.materiales.length; indiceMaterial++) {
      const m = payload.materiales[indiceMaterial];
      const marcaModelo = m.marcaModelo.trim() || null;
      const numeroSerie = m.numeroSerie.trim() || null;
      const etiquetaYpf = m.etiquetaYpf.trim() || null;

      let equipoId: string | null = null;
      let rackEquipamientoId: string | null = null;

      if (m.rackId) {
        rackEquipamientoId = await buscarRackEquipamientoDuplicado(supabase, m.rackId, numeroSerie ?? "", etiquetaYpf ?? "");
        if (!rackEquipamientoId) {
          const { data: existentesDelRack } = await supabase.from("rack_equipamientos").select("numero").eq("rack_id", m.rackId);
          const siguienteNumero = (existentesDelRack ?? []).reduce((max, e) => Math.max(max, e.numero), 0) + 1;
          const { data: nuevoEquipoRack, error: rackErr } = await supabase
            .from("rack_equipamientos")
            .insert({
              rack_id: m.rackId,
              // Las únicas categorías que ofrece el selector "¿va a un rack?" (switch/ups/banco_baterias)
              // son literales válidos en los dos enums — ver CATEGORIAS_POSIBLES_EN_RACK.
              categoria_equipo: m.categoriaEquipo as unknown as RackCategoriaEquipo,
              numero: siguienteNumero,
              texto: m.descripcion.trim(),
              marca_modelo: marcaModelo,
              numero_serie: numeroSerie,
              etiqueta_ypf: etiquetaYpf,
              cantidad: m.cantidad || 1,
              consumo_promedio_w: m.consumoPromedioW,
              consumo_max_w: m.consumoMaxW,
            })
            .select("id")
            .single();
          if (rackErr || !nuevoEquipoRack) continue; // un material que falla no debe tirar abajo todo el informe
          rackEquipamientoId = nuevoEquipoRack.id;
        }
      } else {
        equipoId = await buscarEquipoDuplicado(supabase, ubicacionIdMateriales, numeroSerie ?? "", etiquetaYpf ?? "");
        if (!equipoId) {
          const { data: nuevoEquipo, error: equipoErr } = await supabase
            .from("equipos")
            .insert({
              ubicacion_id: ubicacionIdMateriales,
              categoria_equipo: m.categoriaEquipo,
              texto: m.descripcion.trim(),
              marca_modelo: marcaModelo,
              numero_serie: numeroSerie,
              etiqueta_ypf: etiquetaYpf,
              cantidad: m.cantidad || 1,
              consumo_promedio_w: m.consumoPromedioW,
              consumo_max_w: m.consumoMaxW,
              created_by: profile.id,
            })
            .select("id")
            .single();
          if (equipoErr || !nuevoEquipo) continue;
          equipoId = nuevoEquipo.id;
        }
      }

      if (m.reemplazaEquipoId && m.reemplazaTipo) {
        try {
          if (!serviceParaBajas) serviceParaBajas = createServiceRoleClient();
          const resultadoBaja = await ejecutarBaja(serviceParaBajas, {
            tipoEquipo: m.reemplazaTipo,
            equipoId: m.reemplazaEquipoId,
            motivo: "reemplazo",
            comentario: `Reemplazado por "${m.descripcion.trim()}" cargado en el informe ${payload.numeroGeneracionPreferido || informeId}.`,
            fecha: payload.fecha,
            realizadoPorProfileId: profile.id,
            realizoNombre: profile.nombreCompleto,
          });
          if (resultadoBaja.success) {
            const tablaNueva = rackEquipamientoId ? "rack_equipamientos" : "equipos";
            await supabase
              .from(tablaNueva)
              .update({ reemplaza_equipo_id: m.reemplazaEquipoId, reemplaza_tipo: m.reemplazaTipo })
              .eq("id", rackEquipamientoId ?? equipoId!);
          }
        } catch {
          // Sin SUPABASE_SERVICE_ROLE_KEY, o el equipo viejo ya no se pudo dar de baja — el alta del material
          // nuevo ya se hizo, no se revierte por esto; el vínculo de reemplazo queda sin cerrar.
        }
      }

      // Foto puntual de respaldo ("Verificar instalación" no lo encontró en las fotos generales) — opcional, una por índice de material.
      let fotoConfirmacionUrl: string | null = null;
      const fotoConfirmacionMaterial = formData.get(`materialFotoConfirmacion_${indiceMaterial}`);
      if (fotoConfirmacionMaterial instanceof File) {
        const path = `${profile.id}/${informeId}/material-confirmacion-${indiceMaterial}.jpg`;
        const { error: fotoErr } = await supabase.storage
          .from("informe-fotos")
          .upload(path, Buffer.from(await fotoConfirmacionMaterial.arrayBuffer()), { contentType: "image/jpeg", upsert: true });
        if (!fotoErr) fotoConfirmacionUrl = path;
      }

      await supabase.from("informe_materiales").insert({
        informe_id: informeId,
        categoria_equipo: m.categoriaEquipo,
        descripcion: m.descripcion.trim(),
        marca_modelo: marcaModelo,
        numero_serie: numeroSerie,
        etiqueta_ypf: etiquetaYpf,
        cantidad: m.cantidad || 1,
        consumo_promedio_w: m.consumoPromedioW,
        consumo_max_w: m.consumoMaxW,
        comentario: m.comentario.trim() || null,
        equipo_id: equipoId,
        rack_equipamiento_id: rackEquipamientoId,
        foto_confirmacion_url: fotoConfirmacionUrl,
      });
      materialesPdf.push({
        categoriaLabel: CATEGORIA_EQUIPO_LABEL[m.categoriaEquipo],
        descripcion: m.descripcion.trim(),
        marcaModelo,
        numeroSerie,
        etiquetaYpf,
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

  // Trazabilidad de materiales a granel (cañería, bulonería, cable — lo que
  // no se da de alta como equipo individual): cada línea del remito queda
  // como fila real, no solo impresa en el PDF, para poder buscarla después
  // (ver /materiales/buscar) — incluye lo que se usó (cantidadSobrante=0),
  // no solo lo que volvió a depósito.
  for (let indiceRemito = 0; indiceRemito < payload.remitoItems.length; indiceRemito++) {
    const r = payload.remitoItems[indiceRemito];
    if (!r.descripcion.trim()) continue;

    let fotoConfirmacionUrl: string | null = null;
    const fotoConfirmacionRemito = formData.get(`remitoItemFotoConfirmacion_${indiceRemito}`);
    if (fotoConfirmacionRemito instanceof File) {
      const path = `${profile.id}/${informeId}/remito-item-confirmacion-${indiceRemito}.jpg`;
      const { error: fotoErr } = await supabase.storage
        .from("informe-fotos")
        .upload(path, Buffer.from(await fotoConfirmacionRemito.arrayBuffer()), { contentType: "image/jpeg", upsert: true });
      if (!fotoErr) fotoConfirmacionUrl = path;
    }

    await supabase.from("informe_remito_items").insert({
      informe_id: informeId,
      descripcion: r.descripcion.trim(),
      cantidad_esperada: r.cantidadEsperada,
      cantidad_sobrante: r.cantidadSobrante,
      foto_confirmacion_url: fotoConfirmacionUrl,
    });
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

  const hallazgosConfirmados = (payload.hallazgos ?? []).filter((h) => h.estado);
  let hallazgosPdf: { texto: string; estado: EstadoChecklist; comentario: string | null }[] = [];
  if (hallazgosConfirmados.length > 0) {
    const { data: hallazgosCatalogo } = await supabase
      .from("catalogo_inspeccion_ia")
      .select("id, texto")
      .in(
        "id",
        hallazgosConfirmados.map((h) => h.itemId),
      );
    const textoPorId = new Map((hallazgosCatalogo ?? []).map((h) => [h.id, h.texto]));
    hallazgosPdf = hallazgosConfirmados
      .map((h) => ({ texto: textoPorId.get(h.itemId), estado: h.estado, comentario: h.comentario.trim() || null }))
      .filter((h): h is { texto: string; estado: EstadoChecklist; comentario: string | null } => !!h.texto);
  }

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
    hallazgos: hallazgosPdf,
    entregaDepositoNumeroGeneracion,
    logoBuffer,
    appName: "TaskWork",
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
