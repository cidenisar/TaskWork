import { createServiceRoleClient } from "@/lib/supabase/server";
import { TIPO_EQUIPO_BAJA_LABEL } from "@/components/bajas/types";
import { nuevoNumeroGeneracionBaja } from "@/lib/bajas/numero-generacion";
import { renderBajaPdf } from "@/lib/pdf/render";
import { buildBajaFilename } from "@/lib/pdf/filename";
import { resolverEquipo, TABLA_POR_TIPO } from "./resolver-equipo";
import type { MotivoBaja, TipoEquipoBaja } from "@/lib/database.types";

export interface EjecutarBajaPayload {
  tipoEquipo: TipoEquipoBaja;
  equipoId: string;
  motivo: MotivoBaja;
  comentario: string;
  fecha: string;
  realizadoPorProfileId: string;
  realizoNombre: string;
}

export interface EjecutarBajaResult {
  success: boolean;
  error?: string;
  bajaId?: string;
  numeroGeneracion?: string;
}

/**
 * Núcleo de "dar de baja" (resolver equipo, insertar bajas_equipamiento,
 * marcar estado='baja', generar+subir el PDF comprobante) — factorizado
 * para compartirlo entre `darDeBajaAction` (Admin/Supervisor, manual,
 * gateado por rol) y el alta de un material que marca "reemplaza a un
 * equipo existente" (técnico, automática): ahí el técnico ya decidió el
 * reemplazo en el campo en el mismo momento de instalar el nuevo, es un
 * efecto mecánico de esa decisión, no una habilitación nueva de rol —
 * mismo criterio que la devolución a depósito del sobrante del remito.
 */
export async function ejecutarBaja(
  service: ReturnType<typeof createServiceRoleClient>,
  payload: EjecutarBajaPayload,
): Promise<EjecutarBajaResult> {
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
        created_by: payload.realizadoPorProfileId,
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
    appName: "TaskWork",
    realizoNombre: payload.realizoNombre,
  });

  const pdfFilename = buildBajaFilename({ numeroGeneracion, equipoTexto: equipo.texto, sitio: ubicacion.sitio });
  const pdfPath = `${payload.realizadoPorProfileId}/bajas/${bajaId}/${pdfFilename}`;
  const { error: pdfUpErr } = await service.storage
    .from("informes-pdf")
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (!pdfUpErr) {
    await service.from("bajas_equipamiento").update({ pdf_url: pdfPath, pdf_generado_at: new Date().toISOString() }).eq("id", bajaId);
  }

  return { success: true, bajaId, numeroGeneracion };
}
