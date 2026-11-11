/**
 * Lectura compartida de las tablas de Guardia General — usada tanto por el
 * circuito del evento (`src/app/(app)/guardia/actions.ts`) como por las
 * pantallas de oficina (`src/app/panel/guardia/**\/actions.ts`). No es
 * "use server" porque no son Server Actions en sí, son helpers que las
 * Server Actions llaman.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Cronograma, CambioGuardia, PersonaGuardia, AreaGuardia } from "./cronograma";
import { AREAS_GUARDIA, guardiaDe, inicioSemana, finSemana } from "./cronograma";
import type { ParametrosGuardia } from "./motor";
import { horaGuardiaIso } from "./reloj";
import { liquidarConDetalle, type FichaPersonaDetalle, type ParticipacionDetalle } from "./liquidacion";

type Client = SupabaseClient<Database>;

export async function cargarCronograma(supabase: Client): Promise<Cronograma> {
  const { data: rows } = await supabase.from("guardia_cronograma_semana").select("semana_inicio, area, usuario_id");
  const cronograma: Cronograma = {};
  for (const r of rows ?? []) {
    (cronograma[r.semana_inicio] ??= {})[r.area as AreaGuardia] = r.usuario_id;
  }
  return cronograma;
}

export async function cargarCambiosAceptados(supabase: Client): Promise<CambioGuardia[]> {
  const { data: rows } = await supabase
    .from("guardia_cambio")
    .select("id, area, persona_id, original_id, desde, hasta, estado")
    .eq("estado", "aceptado");
  return (rows ?? []).map((c) => ({
    id: c.id,
    area: c.area as AreaGuardia,
    persona: c.persona_id,
    original: c.original_id,
    desde: c.desde,
    hasta: c.hasta,
    estado: "aceptado",
  }));
}

export async function cargarPersonas(supabase: Client): Promise<PersonaGuardia[]> {
  const { data: rows } = await supabase.from("guardia_persona").select("usuario_id, area, orden");
  return (rows ?? []).map((p) => ({ id: p.usuario_id, area: p.area as AreaGuardia, orden: p.orden }));
}

/** Parámetros completos del motor de activaciones, tal como están guardados ahora mismo (fila única `id = 1`). */
export async function cargarParametros(supabase: Client): Promise<ParametrosGuardia & { cambioMin: number }> {
  const { data: config } = await supabase
    .from("guardia_config")
    .select("entrada_min, salida_activacion_min, madrugada_hasta_min, tope_media_min, valor_media, valor_entera, cambio_min")
    .eq("id", 1)
    .single();
  return {
    entradaMin: config?.entrada_min ?? 450,
    salidaActivacionMin: config?.salida_activacion_min ?? 1020,
    madrugadaHastaMin: config?.madrugada_hasta_min ?? 450,
    topeMediaMin: config?.tope_media_min ?? 270,
    valorMedia: config?.valor_media ?? 50,
    valorEntera: config?.valor_entera ?? 100,
    cambioMin: config?.cambio_min ?? 600,
  };
}

/** El área de guardia de ESTE usuario (null = no hace ninguna) — para armar su `ContextoGuardia` en cada Server Action, nunca confiando en lo que mande el cliente. */
export async function cargarAreaDe(supabase: Client, usuarioId: string): Promise<AreaGuardia | null> {
  const { data } = await supabase.from("guardia_persona").select("area").eq("usuario_id", usuarioId).maybeSingle();
  return (data?.area as AreaGuardia | undefined) ?? null;
}

/** Nombre del grupo de WhatsApp al que se avisan las novedades — solo para mostrarlo en pantalla (un link wa.me no puede apuntar a un grupo), ver Parámetros. */
export async function cargarGrupoWhatsappNombre(supabase: Client): Promise<string> {
  const { data } = await supabase.from("guardia_config").select("grupo_whatsapp_nombre").eq("id", 1).single();
  return data?.grupo_whatsapp_nombre ?? "Novedades Guardia TI Cuyo";
}

export interface PeriodoGuardia {
  desde: string;
  hasta: string;
}

/** El período de liquidación vigente (Parámetros) — mismo criterio que el resto: nada clavado en el código. */
export async function cargarPeriodoVigente(supabase: Client): Promise<PeriodoGuardia> {
  const { data } = await supabase.from("guardia_config").select("periodo_desde, periodo_hasta").eq("id", 1).single();
  return { desde: data?.periodo_desde ?? "", hasta: data?.periodo_hasta ?? "" };
}

/** Mismo formato que `encabezadoEvento()` en `evento-detalle.tsx` — a qué incidente se refiere cada fila de la liquidación. */
function formatIncidente(numero: number, tipoAlarma: string, sitio: string): string {
  return `#${numero.toString().padStart(4, "0")} · ${tipoAlarma} — ${sitio}`;
}

/**
 * Participaciones que puedan tocar algún día entre `desde` y `hasta` — la
 * consulta viene con un día de margen de cada lado (la zona horaria hace
 * que el día calendario de la guardia no coincida 1 a 1 con el de UTC);
 * el recorte exacto al período pedido lo hace `calcularLiquidacion`
 * después de pasar todo por el motor. Trae también a qué incidente
 * perteneció cada participación y si fue remota o en sitio — pedido de
 * Ivan para poder evaluar la liquidación en detalle, no solo el total del
 * día (dos consultas + join en JS, como el resto de la app — el tipo
 * `Database` de este proyecto es manual y no describe relaciones).
 */
async function cargarParticipacionesDelPeriodo(supabase: Client, desde: string, hasta: string) {
  const margenDesde = new Date(`${desde}T00:00:00-03:00`);
  margenDesde.setUTCDate(margenDesde.getUTCDate() - 1);
  const margenHasta = new Date(`${hasta}T00:00:00-03:00`);
  margenHasta.setUTCDate(margenHasta.getUTCDate() + 2);
  const { data } = await supabase
    .from("guardia_participacion")
    .select("usuario_id, inicio_at, fin_at, evento_id, modalidad")
    .gte("inicio_at", margenDesde.toISOString())
    .lt("inicio_at", margenHasta.toISOString());
  const rows = data ?? [];

  const eventoIds = [...new Set(rows.map((r) => r.evento_id))];
  const { data: eventos } =
    eventoIds.length > 0 ? await supabase.from("guardia_evento").select("id, numero, tipo_alarma, sitio").in("id", eventoIds) : { data: [] };
  const incidentePorEvento = new Map((eventos ?? []).map((e) => [e.id, formatIncidente(e.numero, e.tipo_alarma, e.sitio)]));

  return rows.map((r) => ({ ...r, incidente: incidentePorEvento.get(r.evento_id) ?? "—" }));
}

export interface FilaLiquidacionPersona {
  usuarioId: string;
  nombre: string;
  area: AreaGuardia;
  detalle: FichaPersonaDetalle;
}

/**
 * La liquidación completa de un período: junta participaciones + feriados
 * + parámetros vigentes, los pasa por el motor (`liquidarConDetalle`) y
 * arma una fila por cada persona de guardia (incluidas las que no tuvieron
 * ninguna activación en el período — quedan en 0). "Derivados, no
 * guardados" (HANDOFF §11): esto se recalcula siempre; la única foto fija
 * es la que se guarda al cerrar el período (ver `guardia_periodo_cierre`).
 */
export async function calcularLiquidacion(supabase: Client, desde: string, hasta: string): Promise<FilaLiquidacionPersona[]> {
  const [participacionesRaw, feriadosRes, parametros, personas] = await Promise.all([
    cargarParticipacionesDelPeriodo(supabase, desde, hasta),
    supabase.from("guardia_feriado").select("fecha"),
    cargarParametros(supabase),
    cargarPersonas(supabase),
  ]);
  const feriados = new Set((feriadosRes.data ?? []).map((f) => f.fecha));
  const ahora = horaGuardiaIso();
  const participaciones: ParticipacionDetalle[] = participacionesRaw.map((p) => ({
    persona: p.usuario_id,
    inicio: horaGuardiaIso(new Date(p.inicio_at)),
    fin: p.fin_at ? horaGuardiaIso(new Date(p.fin_at)) : ahora,
    enCurso: !p.fin_at,
    eventoId: p.evento_id,
    incidente: p.incidente,
    modalidad: p.modalidad as ParticipacionDetalle["modalidad"],
  }));
  const resultado = liquidarConDetalle(participaciones, feriados, parametros);

  // Recortar al período exacto — la consulta de participaciones vino con margen de un día de cada lado.
  for (const ficha of Object.values(resultado)) {
    for (const fecha of Object.keys(ficha.porDia)) {
      if (fecha < desde || fecha > hasta) delete ficha.porDia[fecha];
    }
    ficha.totalMinutos = Object.values(ficha.porDia).reduce((acc, d) => acc + d.minutos, 0);
    ficha.totalCentesimas = Object.values(ficha.porDia).reduce((acc, d) => acc + d.centesimas, 0);
    ficha.totalFrancos = Object.values(ficha.porDia).reduce((acc, d) => acc + d.francos, 0);
  }

  const idsConActividad = Object.keys(resultado).filter((id) => !personas.some((p) => p.id === id));
  const idsPersonas = [...new Set([...personas.map((p) => p.id), ...idsConActividad])];
  const { data: perfiles } = idsPersonas.length > 0 ? await supabase.from("profiles").select("id, nombre_completo").in("id", idsPersonas) : { data: [] };
  const nombrePorId = new Map((perfiles ?? []).map((p) => [p.id, p.nombre_completo]));
  const areaPorId = new Map(personas.map((p) => [p.id, p.area]));

  return idsPersonas
    .map((id) => ({
      usuarioId: id,
      nombre: nombrePorId.get(id) ?? "—",
      area: areaPorId.get(id) ?? "General",
      detalle: resultado[id] ?? { porDia: {}, totalMinutos: 0, totalCentesimas: 0, totalFrancos: 0 },
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

function restarDias(fechaIso: string, dias: number): string {
  const d = new Date(`${fechaIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

export interface SemanaLiquidacion {
  /** Miércoles (fecha de guardia) que arranca la semana. */
  semanaInicio: string;
  /** Martes siguiente — último día de guardia de esa semana. */
  semanaFin: string;
  cerrada: boolean;
  cierreId: string | null;
}

/**
 * Las últimas `cantidad` semanas de guardia (miércoles a martes, HANDOFF
 * §7.1) que YA TERMINARON — nunca incluye la semana en curso, todavía no
 * terminó — junto con si cada una ya se cerró. Pedido de Ivan: poder
 * liquidar semana por semana a medida que pasan, antes de esperar al
 * cierre del período global más grande.
 */
export async function cargarSemanasLiquidacion(supabase: Client, cambioMin: number, cantidad = 8): Promise<SemanaLiquidacion[]> {
  const semanaActual = inicioSemana(horaGuardiaIso(), cambioMin);
  const inicios = Array.from({ length: cantidad }, (_, i) => restarDias(semanaActual, 7 * (i + 1)));

  const { data: cerradas } = await supabase.from("guardia_periodo_cierre").select("id, desde").eq("tipo", "semanal").in("desde", inicios);
  const cierrePorDesde = new Map((cerradas ?? []).map((c) => [c.desde, c.id]));

  return inicios.map((semanaInicio) => ({
    semanaInicio,
    semanaFin: finSemana(semanaInicio),
    cerrada: cierrePorDesde.has(semanaInicio),
    cierreId: cierrePorDesde.get(semanaInicio) ?? null,
  }));
}

export interface GuardiaGeneralActual {
  usuarioId: string;
  nombre: string;
  telefono: string | null;
}

/**
 * Quién hace la guardia general EN ESTE INSTANTE (cronograma + cambios
 * aceptados vigentes, igual que al activar guardia técnica) — para avisar
 * a esa persona cuando pasa algo que la guardia general tiene que saber
 * aunque no sea un evento de Guardia General en sí (ej. Riesgo de Viaje).
 * null si nadie tiene asignada el área "General" en este momento.
 */
export async function cargarGuardiaGeneralActual(supabase: Client): Promise<GuardiaGeneralActual | null> {
  const [cronograma, cambios, parametros] = await Promise.all([cargarCronograma(supabase), cargarCambiosAceptados(supabase), cargarParametros(supabase)]);
  const usuarioId = guardiaDe(cronograma, cambios, "General", horaGuardiaIso(), parametros.cambioMin);
  if (!usuarioId) return null;

  const { data: perfil } = await supabase.from("profiles").select("nombre_completo, telefono").eq("id", usuarioId).maybeSingle();
  if (!perfil) return null;
  return { usuarioId, nombre: perfil.nombre_completo, telefono: perfil.telefono };
}

export { AREAS_GUARDIA };
