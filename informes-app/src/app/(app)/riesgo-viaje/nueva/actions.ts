"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { CRITERIOS_RIESGO_VIAJE, calcularRiesgoViaje, type CriterioKey } from "@/lib/riesgo-viaje/criterios";
import { nuevoNumeroGeneracionRiesgoViaje } from "@/lib/riesgo-viaje/numero-generacion";
import { renderRiesgoViajePdf } from "@/lib/pdf/render";
import { buildRiesgoViajeFilename } from "@/lib/pdf/filename";
import { obtenerDestinatariosAutoEnvio } from "@/lib/email/destinatarios-auto-envio";
import { enviarPdfPorEmail } from "@/lib/email/enviar-pdf";
import { geocodificarDireccion, obtenerRutaReal } from "@/lib/riesgo-viaje/ruta";
import { generarMapaEstaticoTrayecto } from "@/lib/riesgo-viaje/mapa-estatico";
import type { NivelRiesgoViaje } from "@/lib/database.types";

export interface CrearEvaluacionRiesgoViajeResult {
  success: boolean;
  error?: string;
  evaluacionId?: string;
  total?: number;
  nivel?: NivelRiesgoViaje;
  mensaje?: string;
}

const CRITERIO_KEYS = Object.keys(CRITERIOS_RIESGO_VIAJE) as CriterioKey[];

/**
 * Evaluación de Riesgo del Viaje (Anexo IV) — se completa antes de salir de
 * viaje. Genera PDF + mail automático como el resto de los módulos; el
 * seguimiento en vivo del viaje (iniciar/punto medio/finalizar) se maneja
 * aparte, con actualizarEstadoViajeAction (ver ../actions.ts), porque sigue
 * pasando después de que este registro ya se guardó.
 */
export async function crearEvaluacionRiesgoViajeAction(formData: FormData): Promise<CrearEvaluacionRiesgoViajeResult> {
  const profile = await requireProfile();

  const vehiculoId = String(formData.get("vehiculoId") || "");
  const conductorNombre = String(formData.get("conductorNombre") || "").trim();
  const empresa = String(formData.get("empresa") || "").trim();
  const fechaHora = String(formData.get("fechaHora") || "");
  const origen = String(formData.get("origen") || "").trim();
  const destino = String(formData.get("destino") || "").trim();
  const puntoMedio = String(formData.get("puntoMedio") || "").trim() || null;
  const acompanantes = formData
    .getAll("acompanantes")
    .map((a) => String(a).trim())
    .filter(Boolean);

  if (!vehiculoId) return { success: false, error: "Falta el vehículo." };
  if (!conductorNombre) return { success: false, error: "Falta el conductor." };
  if (!empresa) return { success: false, error: "Falta la empresa." };
  if (!fechaHora) return { success: false, error: "Falta la fecha y hora del viaje." };
  if (!origen) return { success: false, error: "Falta el origen." };
  if (!destino) return { success: false, error: "Falta el destino." };

  const criterios = {} as Record<CriterioKey, number>;
  for (const key of CRITERIO_KEYS) {
    const raw = formData.get(key);
    const valor = Number(raw);
    const opciones = CRITERIOS_RIESGO_VIAJE[key].opciones;
    if (raw === null || !opciones.some((o) => o.valor === valor)) {
      return { success: false, error: `Falta elegir una opción para "${CRITERIOS_RIESGO_VIAJE[key].label}".` };
    }
    criterios[key] = valor;
  }

  const { total, nivel, mensaje } = calcularRiesgoViaje(criterios);

  const supabase = await createClient();

  const { data: vehiculo } = await supabase.from("catalogo_vehiculos").select("patente, marca_modelo").eq("id", vehiculoId).single();
  if (!vehiculo) return { success: false, error: "No se encontró el vehículo." };

  let numeroGeneracion = nuevoNumeroGeneracionRiesgoViaje();
  let evaluacionId: string | null = null;
  for (let intento = 0; intento < 5; intento++) {
    const { data, error } = await supabase
      .from("evaluaciones_riesgo_viaje")
      .insert({
        numero_generacion: numeroGeneracion,
        vehiculo_id: vehiculoId,
        conductor_nombre: conductorNombre,
        empresa,
        fecha_hora: new Date(fechaHora).toISOString(),
        origen,
        destino,
        punto_medio: puntoMedio,
        criterio_a_distancia: criterios.distancia,
        criterio_b_tiempo_viaje: criterios.tiempoViaje,
        criterio_c_clima: criterios.clima,
        criterio_d_tipo_ruta: criterios.tipoRuta,
        criterio_e_conocimiento: criterios.conocimiento,
        criterio_f_comunicacion: criterios.comunicacion,
        criterio_g_personas_vehiculo: criterios.personasPorVehiculo,
        criterio_h_horas_trabajadas: criterios.horasTrabajadas,
        total,
        nivel_riesgo: nivel,
        mensaje_riesgo: mensaje,
        created_by: profile.id,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        numeroGeneracion = nuevoNumeroGeneracionRiesgoViaje();
        continue;
      }
      return { success: false, error: `No se pudo guardar la evaluación: ${error.message}` };
    }
    evaluacionId = data!.id;
    break;
  }
  if (!evaluacionId) return { success: false, error: "No se pudo asignar un número de generación único. Probá de nuevo." };

  if (acompanantes.length > 0) {
    await supabase
      .from("evaluaciones_riesgo_viaje_acompanantes")
      .insert(acompanantes.map((nombre) => ({ evaluacion_id: evaluacionId!, nombre_completo: nombre })));
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

  // Geocoding + ruteo + captura del mapa son todos best-effort (servicios
  // públicos gratuitos) — si alguno falla, el PDF sale igual sin esos datos.
  let distanciaKm: number | null = null;
  let mapaBuffer: Buffer | null = null;
  const [coordsOrigen, coordsDestino] = await Promise.all([geocodificarDireccion(origen), geocodificarDireccion(destino)]);
  if (coordsOrigen && coordsDestino) {
    const ruta = await obtenerRutaReal(coordsOrigen, coordsDestino);
    if (ruta) {
      distanciaKm = Math.round(ruta.distanciaKm);
      mapaBuffer = await generarMapaEstaticoTrayecto(coordsOrigen, coordsDestino, ruta.geometria);
    }
  }

  const pdfBuffer = await renderRiesgoViajePdf({
    numeroGeneracion,
    conductorNombre,
    acompanantes,
    vehiculoPatente: vehiculo.patente,
    vehiculoMarcaModelo: vehiculo.marca_modelo,
    empresa,
    fechaHora: new Date(fechaHora).toISOString(),
    origen,
    destino,
    puntoMedio,
    criterios,
    total,
    nivel,
    mensaje,
    distanciaKm,
    mapaBuffer,
    logoBuffer,
    appName: "TaskWork",
    realizoNombre: profile.nombreCompleto,
  });
  const pdfFilename = buildRiesgoViajeFilename({ numeroGeneracion, origen, destino });
  const pdfPath = `${profile.id}/riesgo-viaje/${evaluacionId}/${pdfFilename}`;
  const { error: pdfUpErr } = await supabase.storage.from("informes-pdf").upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
  if (!pdfUpErr) {
    await supabase.from("evaluaciones_riesgo_viaje").update({ pdf_url: pdfPath, pdf_generado_at: new Date().toISOString() }).eq("id", evaluacionId);

    const destinatarios = await obtenerDestinatariosAutoEnvio(supabase);
    if (destinatarios.length > 0) {
      await enviarPdfPorEmail({
        to: destinatarios,
        asunto: `${nivel === "alto" ? "⚠ " : ""}Evaluación de Riesgo del Viaje ${numeroGeneracion} — ${origen} → ${destino}`,
        texto: `Se cargó una evaluación de riesgo del viaje de "${origen}" a "${destino}" (${numeroGeneracion}). Resultado: ${mensaje} (total: ${total}). Se adjunta el PDF.`,
        pdfBuffer,
        filename: pdfFilename,
        diagnostico: { supabase, userId: profile.id, contexto: "email-evaluacion-riesgo-viaje" },
      });
    }
  }

  revalidatePath("/riesgo-viaje/historial");
  return { success: true, evaluacionId, total, nivel, mensaje };
}
