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
import { AREAS_GUARDIA } from "./cronograma";
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

/**
 * Participaciones que puedan tocar algún día entre `desde` y `hasta` — la
 * consulta viene con un día de margen de cada lado (la zona horaria hace
 * que el día calendario de la guardia no coincida 1 a 1 con el de UTC);
 * el recorte exacto al período pedido lo hace `calcularLiquidacion`
 * después de pasar todo por el motor.
 */
async function cargarParticipacionesDelPeriodo(supabase: Client, desde: string, hasta: string) {
  const margenDesde = new Date(`${desde}T00:00:00-03:00`);
  margenDesde.setUTCDate(margenDesde.getUTCDate() - 1);
  const margenHasta = new Date(`${hasta}T00:00:00-03:00`);
  margenHasta.setUTCDate(margenHasta.getUTCDate() + 2);
  const { data } = await supabase
    .from("guardia_participacion")
    .select("usuario_id, inicio_at, fin_at")
    .gte("inicio_at", margenDesde.toISOString())
    .lt("inicio_at", margenHasta.toISOString());
  return data ?? [];
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
  }));
  const resultado = liquidarConDetalle(participaciones, feriados, parametros);

  // Recortar al período exacto — la consulta de participaciones vino con margen de un día de cada lado.
  for (const ficha of Object.values(resultado)) {
    for (const fecha of Object.keys(ficha.porDia)) {
      if (fecha < desde || fecha > hasta) delete ficha.porDia[fecha];
    }
    ficha.totalMinutos = Object.values(ficha.porDia).reduce((acc, d) => acc + d.minutos, 0);
    ficha.totalCentesimas = Object.values(ficha.porDia).reduce((acc, d) => acc + d.centesimas, 0);
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
      detalle: resultado[id] ?? { porDia: {}, totalMinutos: 0, totalCentesimas: 0 },
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export { AREAS_GUARDIA };
