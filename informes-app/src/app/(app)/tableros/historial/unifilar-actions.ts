"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import type { RotuloUnifilar, UnifilarCircuito } from "@/lib/tableros/unifilar";

function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}

interface RespuestaMotorUnifilares {
  dxfBase64: string;
  pdfBase64: string;
}

export interface GenerarUnifilarResult {
  success: boolean;
  error?: string;
}

/**
 * Le pide a `motor-unifilares` (servicio aparte, ver /motor-unifilares del
 * repo — llamada HTTP, no un import: así iterar el motor nunca arriesga
 * el deploy de esta app) que arme el plano unifilar a partir de los
 * circuitos ACTUALES del tablero de esta medición, y sube lo que devuelva
 * (DXF + PDF A3) a Supabase Storage. El servicio nunca sube nada — eso es
 * responsabilidad de quien llama, acá mismo.
 *
 * Usa `process.env.ANTHROPIC_API_KEY` de ESTA app, reenviada como header —
 * motor-unifilares no tiene clave propia (ver su README), así se evita
 * sincronizar un secreto nuevo entre dos apps con deploys separados.
 */
export async function generarUnifilarAction(medicionId: string): Promise<GenerarUnifilarResult> {
  const profile = await requireProfile();
  const supabase = await createClient();

  if (!process.env.ANTHROPIC_API_KEY) {
    return { success: false, error: "Falta configurar ANTHROPIC_API_KEY en este entorno." };
  }
  const motorUrl = process.env.MOTOR_UNIFILARES_URL;
  if (!motorUrl) {
    return { success: false, error: "Falta configurar MOTOR_UNIFILARES_URL en este entorno." };
  }

  const { data: medicion, error: medicionErr } = await supabase
    .from("tablero_mediciones")
    .select("id, tablero_id, fecha, numero_generacion, created_by")
    .eq("id", medicionId)
    .single();
  if (medicionErr || !medicion) {
    return { success: false, error: "No se encontró la medición." };
  }

  const { data: tablero, error: tableroErr } = await supabase
    .from("tableros")
    .select("denominacion, cliente, ubicacion_id")
    .eq("id", medicion.tablero_id)
    .single();
  if (tableroErr || !tablero) {
    return { success: false, error: "No se encontró el tablero." };
  }

  const [{ data: ubicacion }, { data: configEmpresa }, { data: autor }, { data: circuitosRes }] = await Promise.all([
    supabase.from("ubicaciones").select("sitio").eq("id", tablero.ubicacion_id).single(),
    supabase.from("config_general").select("nombre_empresa").eq("id", 1).single(),
    supabase.from("profiles").select("nombre_completo").eq("id", medicion.created_by).single(),
    supabase
      .from("tablero_circuitos")
      .select(
        "id, numero, texto, categoria_equipo, tipo_circuito, amp_nominal, cuerpo, alimentado_por_ups, rol_bypass_ups, circuito_padre_id, etiqueta_cable",
      )
      .eq("tablero_id", medicion.tablero_id)
      .eq("estado", "activo")
      .order("numero"),
  ]);

  const circuitosDb = circuitosRes ?? [];
  if (circuitosDb.length === 0) {
    return { success: false, error: "Este tablero no tiene circuitos activos para dibujar." };
  }

  // circuito_padre_id es un id de otro circuito — el unifilar encadena por
  // N°, así que se resuelve una sola vez con un mapa id→N° (mismo patrón
  // que planos/tablero/[id]/page.tsx).
  const numeroPorId = new Map(circuitosDb.map((c) => [c.id, c.numero]));
  const circuitos: UnifilarCircuito[] = circuitosDb.map((c) => ({
    numero: c.numero,
    texto: c.texto,
    categoriaEquipo: c.categoria_equipo,
    tipoCircuito: c.tipo_circuito,
    ampNominal: c.amp_nominal,
    cuerpo: c.cuerpo,
    alimentadoPorUps: c.alimentado_por_ups,
    rolBypassUps: c.rol_bypass_ups,
    padreNumero: c.circuito_padre_id ? (numeroPorId.get(c.circuito_padre_id) ?? null) : null,
    etiquetaCable: c.etiqueta_cable,
  }));

  const rotulo: RotuloUnifilar = {
    sitio: ubicacion?.sitio ?? "—",
    tablero: tablero.denominacion,
    cliente: tablero.cliente,
    contratista: configEmpresa?.nombre_empresa ?? "",
    fecha: fmtFecha(medicion.fecha),
    realizo: autor?.nombre_completo ?? "—",
    numeroGeneracion: medicion.numero_generacion,
  };

  let respuesta: RespuestaMotorUnifilares;
  try {
    const res = await fetch(`${motorUrl.replace(/\/$/, "")}/api/unifilar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Anthropic-Api-Key": process.env.ANTHROPIC_API_KEY },
      body: JSON.stringify({ circuitos, rotulo }),
    });
    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
      return { success: false, error: cuerpo?.error || `El motor de unifilares respondió un error (${res.status}).` };
    }
    respuesta = (await res.json()) as RespuestaMotorUnifilares;
  } catch {
    return { success: false, error: "No se pudo contactar al motor de unifilares — ¿está arriba MOTOR_UNIFILARES_URL?" };
  }

  const dxfPath = `${profile.id}/tableros/${medicionId}/unifilar.dxf`;
  const pdfPath = `${profile.id}/tableros/${medicionId}/unifilar.pdf`;
  const [dxfUp, pdfUp] = await Promise.all([
    supabase.storage
      .from("informes-pdf")
      .upload(dxfPath, Buffer.from(respuesta.dxfBase64, "base64"), { contentType: "application/dxf", upsert: true }),
    supabase.storage
      .from("informes-pdf")
      .upload(pdfPath, Buffer.from(respuesta.pdfBase64, "base64"), { contentType: "application/pdf", upsert: true }),
  ]);
  if (dxfUp.error || pdfUp.error) {
    return { success: false, error: "El plano se generó pero no se pudo guardar en el storage." };
  }

  await supabase.from("tablero_mediciones").update({ dxf_url: dxfPath, unifilar_pdf_url: pdfPath }).eq("id", medicionId);

  revalidatePath("/tableros/historial");
  return { success: true };
}
