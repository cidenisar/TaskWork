"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { horaGuardiaIso } from "@/lib/guardia/reloj";
import { guardiaDe, type AreaGuardia } from "@/lib/guardia/cronograma";
import { cargarCronograma, cargarCambiosAceptados, cargarParametros, cargarAreaDe } from "@/lib/guardia/datos";
import { esGuardiaGeneral } from "@/lib/guardia/permisos";
import { notificar } from "@/lib/guardia/notificar";
import type {
  RolParticipacionGuardia,
  ModalidadParticipacionGuardia,
  PedidoParticipacionGuardia,
  ScadaGuardia,
  TicketTipoGuardia,
} from "@/lib/database.types";

export interface AccionResult {
  success: boolean;
  error?: string;
}

const ROL_POR_AREA: Record<AreaGuardia, RolParticipacionGuardia> = {
  General: "GUARDIA_GENERAL",
  Infraestructura: "INFRAESTRUCTURA",
  Datos: "DATOS",
  Enlaces: "ENLACES",
};
const AREA_POR_ROL: Record<RolParticipacionGuardia, AreaGuardia> = {
  GUARDIA_GENERAL: "General",
  INFRAESTRUCTURA: "Infraestructura",
  DATOS: "Datos",
  ENLACES: "Enlaces",
};

/** Es un error de "ya existe" (unique violation) — la fila de idempotencia que ya se procesó antes. */
function esViolacionDeUnicidad(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

async function cargarCronogramaYCambios(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [cronograma, cambios, parametros] = await Promise.all([
    cargarCronograma(supabase),
    cargarCambiosAceptados(supabase),
    cargarParametros(supabase),
  ]);
  return { cronograma, cambios, cambioMin: parametros.cambioMin };
}

export interface ActivarGuardiaTecnicaResult extends AccionResult {
  /** Áreas donde no había nadie asignado — no se activó nada para esas, el resto sí. */
  sinAsignar?: AreaGuardia[];
}

/**
 * Activar guardia técnica (HANDOFF §5, paso 5): a cada área se le resuelve
 * quién está de guardia EN ESTE INSTANTE (guardiaDe — cronograma + cambios
 * aceptados vigentes) y se crea su participación. Si un área no tiene a
 * nadie asignado ahora mismo, no se activa nada para esa área (no rompe) y
 * se avisa en el resultado.
 */
export async function activarGuardiaTecnicaAction(
  eventoId: string,
  areas: AreaGuardia[],
  pedido: PedidoParticipacionGuardia,
): Promise<ActivarGuardiaTecnicaResult> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { cronograma, cambios, cambioMin } = await cargarCronogramaYCambios(supabase);
  const ahora = horaGuardiaIso();

  const sinAsignar: AreaGuardia[] = [];
  const activaciones: { area: AreaGuardia; usuarioId: string }[] = [];
  for (const area of areas) {
    const usuarioId = guardiaDe(cronograma, cambios, area, ahora, cambioMin);
    if (!usuarioId) {
      sinAsignar.push(area);
      continue;
    }
    activaciones.push({ area, usuarioId });
  }

  for (const { area, usuarioId } of activaciones) {
    // Si ya hay una participación sin terminar de esa persona/área en este
    // evento, no duplicar (ej. doble toque de "Activar y avisar").
    const { data: existente } = await supabase
      .from("guardia_participacion")
      .select("id")
      .eq("evento_id", eventoId)
      .eq("usuario_id", usuarioId)
      .eq("rol", ROL_POR_AREA[area])
      .neq("estado", "no_contesto")
      .maybeSingle();
    if (existente) continue;

    const nowIso = new Date().toISOString();
    const { data: participacion, error: errInsert } = await supabase
      .from("guardia_participacion")
      .insert({ evento_id: eventoId, usuario_id: usuarioId, rol: ROL_POR_AREA[area], pedido, inicio_at: nowIso })
      .select("id")
      .single();
    if (errInsert) return { success: false, error: errInsert.message };

    const { data: persona } = await supabase.from("profiles").select("nombre_completo").eq("id", usuarioId).single();
    const queHacer = pedido === "REVISAR" ? "revisar" : "asistir al sitio";
    await supabase.from("guardia_novedad").insert({
      evento_id: eventoId,
      texto: `Se activa la guardia de ${area} (${persona?.nombre_completo ?? "—"}) para ${queHacer}.`,
      por: profile.id,
    });

    await notificar(usuarioId, "activacion", "guardia_participacion", participacion.id, {
      title: `Te activaron en la guardia de ${area}`,
      body: `Te piden ${queHacer}. Abrí la app para aceptar.`,
      url: `/guardia/evento/${eventoId}`,
    });
  }

  revalidatePath("/guardia/evento/[id]", "page");
  revalidatePath("/panel/guardia");
  return { success: true, sinAsignar: sinAsignar.length > 0 ? sinAsignar : undefined };
}

/** El técnico activado elige "Voy remoto" o "Voy al sitio" (HANDOFF §5, paso 6). */
export async function aceptarActivacionAction(
  participacionId: string,
  modalidad: ModalidadParticipacionGuardia,
): Promise<AccionResult> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: participacion, error: errSelect } = await supabase
    .from("guardia_participacion")
    .select("id, evento_id, usuario_id, rol, version")
    .eq("id", participacionId)
    .single();
  if (errSelect || !participacion) return { success: false, error: "No se encontró la activación." };
  if (participacion.usuario_id !== profile.id) return { success: false, error: "Esta activación no es tuya." };

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("guardia_participacion")
    .update({ modalidad, acepto_at: nowIso, version: participacion.version + 1 })
    .eq("id", participacionId)
    .eq("version", participacion.version);
  if (error) return { success: false, error: error.message };

  await supabase.from("guardia_novedad").insert({
    evento_id: participacion.evento_id,
    texto: `${profile.nombreCompleto} acepta (${modalidad === "REMOTO" ? "remoto" : "va al sitio"}).`,
    por: profile.id,
  });

  revalidatePath("/guardia/evento/[id]", "page");
  return { success: true };
}

/**
 * "No contesta → Llamar a otro" (HANDOFF §5, paso 6): la participación
 * original queda marcada `no_contesto` (fuera del cálculo de
 * activaciones) y se crea una nueva para la persona elegida, mismo rol y
 * mismo pedido. Solo la guardia general del evento puede hacerlo (RLS).
 */
export async function noContestaAction(participacionId: string, nuevoUsuarioId: string): Promise<AccionResult> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: original, error: errSelect } = await supabase
    .from("guardia_participacion")
    .select("id, evento_id, rol, pedido, version")
    .eq("id", participacionId)
    .single();
  if (errSelect || !original) return { success: false, error: "No se encontró la activación." };

  const nowIso = new Date().toISOString();
  const { error: errUpdate } = await supabase
    .from("guardia_participacion")
    .update({ fin_at: nowIso, estado: "no_contesto", version: original.version + 1 })
    .eq("id", participacionId)
    .eq("version", original.version);
  if (errUpdate) return { success: false, error: errUpdate.message };

  const { error: errInsert } = await supabase.from("guardia_participacion").insert({
    evento_id: original.evento_id,
    usuario_id: nuevoUsuarioId,
    rol: original.rol,
    pedido: original.pedido,
    inicio_at: nowIso,
  });
  if (errInsert) return { success: false, error: errInsert.message };

  const [{ data: anterior }, { data: nuevo }] = await Promise.all([
    supabase.from("guardia_participacion").select("usuario_id").eq("id", participacionId).single(),
    supabase.from("profiles").select("nombre_completo").eq("id", nuevoUsuarioId).single(),
  ]);
  const { data: anteriorProfile } = anterior
    ? await supabase.from("profiles").select("nombre_completo").eq("id", anterior.usuario_id).single()
    : { data: null };

  await supabase.from("guardia_novedad").insert({
    evento_id: original.evento_id,
    texto: `${anteriorProfile?.nombre_completo ?? "—"} no contesta. Se activa a ${nuevo?.nombre_completo ?? "—"} (${AREA_POR_ROL[original.rol as RolParticipacionGuardia]}) para ${original.pedido === "REVISAR" ? "revisar" : "asistir al sitio"}.`,
    por: profile.id,
  });

  revalidatePath("/guardia/evento/[id]", "page");
  return { success: true };
}

/** Agregar una novedad — cualquier participante del evento, o la guardia general (RLS). `idempotenciaKey` evita duplicarla si el pedido se repite por mala señal. */
export async function agregarNovedadAction(eventoId: string, texto: string, idempotenciaKey?: string): Promise<AccionResult> {
  const profile = await requireProfile();
  if (!texto.trim()) return { success: false, error: "Falta el texto de la novedad." };
  const supabase = await createClient();

  const { error } = await supabase.from("guardia_novedad").insert({
    evento_id: eventoId,
    texto: texto.trim(),
    por: profile.id,
    idempotencia_key: idempotenciaKey ?? null,
  });
  if (error && !esViolacionDeUnicidad(error)) return { success: false, error: error.message };

  revalidatePath("/guardia/evento/[id]", "page");
  return { success: true };
}

/** Marcar "Terminó" — fija el fin de ESA participación (la propia, o la de otro si quien marca es la guardia general del evento — RLS lo permite en los dos casos). */
export async function terminarParticipacionAction(participacionId: string): Promise<AccionResult> {
  await requireProfile();
  const supabase = await createClient();

  const { data: participacion, error: errSelect } = await supabase
    .from("guardia_participacion")
    .select("id, inicio_at, estado, version")
    .eq("id", participacionId)
    .single();
  if (errSelect || !participacion) return { success: false, error: "No se encontró la participación." };
  if (participacion.estado !== "en_curso") return { success: true }; // ya estaba terminada — idempotente

  const nowIso = new Date().toISOString();
  if (new Date(nowIso) < new Date(participacion.inicio_at)) {
    return { success: false, error: "El reloj no puede estar antes del inicio." };
  }

  const { error } = await supabase
    .from("guardia_participacion")
    .update({ fin_at: nowIso, estado: "terminada", version: participacion.version + 1 })
    .eq("id", participacionId)
    .eq("version", participacion.version);
  if (error) return { success: false, error: error.message };

  revalidatePath("/guardia/evento/[id]", "page");
  return { success: true };
}

/**
 * Revisión en SCADA (HANDOFF §5, paso 4 — ajustado: no es un botón binario,
 * la guardia general escribe qué vio y eso queda como novedad). NO cierra
 * el evento: el cierre siempre es una acción manual aparte
 * (`cerrarEventoAction`), aunque el SCADA haya salido sin novedad.
 */
export async function revisarScadaAction(eventoId: string, resultado: ScadaGuardia, detalle: string): Promise<AccionResult> {
  const profile = await requireProfile();
  if (resultado === "CON_NOVEDAD" && !detalle.trim()) return { success: false, error: "Contá qué encontraste en el SCADA." };
  const supabase = await createClient();

  const { data: evento, error: errSelect } = await supabase.from("guardia_evento").select("id, version").eq("id", eventoId).single();
  if (errSelect || !evento) return { success: false, error: "No se encontró el evento." };

  const { error } = await supabase
    .from("guardia_evento")
    .update({ scada: resultado, version: evento.version + 1 })
    .eq("id", eventoId)
    .eq("version", evento.version);
  if (error) return { success: false, error: error.message };

  const detalleTexto = detalle.trim();
  const texto =
    resultado === "SIN_NOVEDAD"
      ? `Revisado en el SCADA: sin novedad.${detalleTexto ? ` ${detalleTexto}` : ""}`
      : `Revisado en el SCADA: hay novedad. ${detalleTexto}`;
  await supabase.from("guardia_novedad").insert({ evento_id: eventoId, texto, por: profile.id });

  revalidatePath("/guardia/evento/[id]", "page");
  return { success: true };
}

/**
 * Cerrar el evento (HANDOFF §5, paso 8) — solo la guardia general (RLS). A
 * quien no haya terminado se le pone fin = ahora. El cierre siempre lleva
 * un texto que cuenta cómo quedó (ej. "quedó sin novedad" / "normalizado")
 * — es lo que después se comparte al grupo de WhatsApp, nunca un cierre
 * mudo.
 */
export async function cerrarEventoAction(eventoId: string, textoCierre: string): Promise<AccionResult> {
  const profile = await requireProfile();
  if (!textoCierre.trim()) return { success: false, error: "Contá cómo quedó para poder cerrar." };
  const supabase = await createClient();

  const { data: evento, error: errSelect } = await supabase
    .from("guardia_evento")
    .select("id, version, estado")
    .eq("id", eventoId)
    .single();
  if (errSelect || !evento) return { success: false, error: "No se encontró el evento." };
  if (evento.estado === "cerrado") return { success: true }; // ya estaba cerrado — idempotente

  const nowIso = new Date().toISOString();
  const { data: abiertas } = await supabase
    .from("guardia_participacion")
    .select("id, version")
    .eq("evento_id", eventoId)
    .eq("estado", "en_curso");
  for (const p of abiertas ?? []) {
    await supabase
      .from("guardia_participacion")
      .update({ fin_at: nowIso, estado: "terminada", version: p.version + 1 })
      .eq("id", p.id)
      .eq("version", p.version);
  }

  const { error } = await supabase
    .from("guardia_evento")
    .update({ estado: "cerrado", cerrado_at: nowIso, version: evento.version + 1 })
    .eq("id", eventoId)
    .eq("version", evento.version);
  if (error) return { success: false, error: error.message };

  await supabase.from("guardia_novedad").insert({ evento_id: eventoId, texto: textoCierre.trim(), por: profile.id });

  revalidatePath("/guardia/evento/[id]", "page");
  revalidatePath("/guardia/historial");
  revalidatePath("/panel/guardia");
  return { success: true };
}

const TICKET_TIPOS: TicketTipoGuardia[] = ["Incidencia", "Ticket", "Tarea de cambio"];

/**
 * Editar ticket/incidente de un evento ya registrado — pedido de Ivan: a
 * veces el número de ticket no se conoce todavía al momento de la llamada y
 * hay que poder completarlo después. Solo esos dos campos (RLS exige lo
 * mismo que para cerrar: admin/supervisor o la guardia general del evento).
 */
export async function editarTicketAction(eventoId: string, ticketTipo: TicketTipoGuardia, ticketNumero: string): Promise<AccionResult> {
  await requireProfile();
  if (!TICKET_TIPOS.includes(ticketTipo)) return { success: false, error: "Tipo de ticket inválido." };
  const supabase = await createClient();

  const { data: evento, error: errSelect } = await supabase.from("guardia_evento").select("id, version").eq("id", eventoId).single();
  if (errSelect || !evento) return { success: false, error: "No se encontró el evento." };

  const { error } = await supabase
    .from("guardia_evento")
    .update({ ticket_tipo: ticketTipo, ticket_numero: ticketNumero.trim() || null, version: evento.version + 1 })
    .eq("id", eventoId)
    .eq("version", evento.version);
  if (error) return { success: false, error: error.message };

  revalidatePath("/guardia/evento/[id]", "page");
  return { success: true };
}

/**
 * Responder un cambio de guardia pendiente (HANDOFF §7.5 — "Asumo la
 * guardia" / "No puedo") — solo quien tiene que cubrir, y solo mientras
 * esté `pendiente` (RLS lo exige igual, esto es nomás el mensaje legible).
 * Aceptado: rige desde ahora. Rechazado: sigue el cronograma de siempre.
 */
export async function responderCambioAction(cambioId: string, respuesta: "aceptado" | "rechazado"): Promise<AccionResult> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: cambio, error: errSelect } = await supabase
    .from("guardia_cambio")
    .select("persona_id, estado, area, desde, hasta, registrado_por")
    .eq("id", cambioId)
    .single();
  if (errSelect || !cambio) return { success: false, error: "No se encontró el cambio." };
  if (cambio.persona_id !== profile.id) return { success: false, error: "Este cambio no es tuyo." };
  if (cambio.estado !== "pendiente") return { success: true }; // ya fue respondido — idempotente

  const { error } = await supabase
    .from("guardia_cambio")
    .update({ estado: respuesta, respondido_at: new Date().toISOString() })
    .eq("id", cambioId)
    .eq("estado", "pendiente");
  if (error) return { success: false, error: error.message };

  const texto = `${profile.nombreCompleto} ${respuesta === "aceptado" ? "asume" : "no puede cubrir"} la guardia de ${cambio.area} (${cambio.desde} → ${cambio.hasta}).`;
  const { data: oficina } = await supabase.from("profiles").select("id").in("rol", ["admin", "supervisor", "superusuario"]);
  const destinatarios = [...new Set([cambio.registrado_por, ...(oficina ?? []).map((o) => o.id)])];
  for (const destinatarioId of destinatarios) {
    await notificar(destinatarioId, "cambio_respondido", "guardia_cambio", cambioId, {
      title: respuesta === "aceptado" ? "Asumen la guardia" : "No pueden cubrir",
      body: texto,
      url: "/panel/guardia/cronograma",
    });
  }

  revalidatePath("/guardia");
  revalidatePath("/panel/guardia/cronograma");
  return { success: true };
}

/**
 * Marcar "hoy" como feriado desde el celular (HANDOFF §10) — la guardia
 * general, o la oficina (que ya tiene su propio botón en Calendario). El
 * contexto de rol/área se arma ACÁ, leyendo `guardia_persona` en este
 * mismo pedido — nunca confiando en lo que mande el cliente.
 */
export async function marcarFeriadoHoyAction(nombre: string): Promise<AccionResult> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const area = await cargarAreaDe(supabase, profile.id);
  if (!esGuardiaGeneral({ rol: profile.rol, area })) return { success: false, error: "Solo la guardia general puede marcar un feriado desde el celular." };

  const fecha = horaGuardiaIso().slice(0, 10);
  const { error } = await supabase.from("guardia_feriado").insert({ fecha, nombre: nombre.trim() || "Feriado", origen: "MANUAL", marcado_por: profile.id });
  if (error) return { success: false, error: error.message };

  await supabase.from("guardia_feriado_hist").insert({ fecha, accion: "marcado", quien: profile.id });

  revalidatePath("/guardia");
  revalidatePath("/panel/guardia/calendario");
  return { success: true };
}

/** "Asumo la guardia" semanal (HANDOFF §7.6) — la fila la crea el cron de los miércoles; esto solo registra que la tocó quien tenía que tocarla. */
export async function asumirGuardiaSemanalAction(semanaInicio: string, area: AreaGuardia): Promise<AccionResult> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase
    .from("guardia_asuncion")
    .update({ asumio_at: new Date().toISOString() })
    .eq("semana_inicio", semanaInicio)
    .eq("area", area)
    .eq("usuario_id", profile.id)
    .is("asumio_at", null);
  if (error) return { success: false, error: error.message };

  revalidatePath("/guardia");
  return { success: true };
}
