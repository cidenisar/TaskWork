// Capa de acceso a datos — Supabase con la service_role key (bypasea RLS por
// completo, ver 03-backend-online.md). Cada función acá adentro corresponde
// a UNA operación de negocio concreta que usan los handlers; las queries en
// sí se probaron a mano contra el proyecto real (ver
// backend/verificacion_queries.sql, en la misma carpeta que este código) —
// esta capa las encapsula tal cual, sin lógica de decisión (esa vive en
// src/logic/, que sí está testeada acá).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Persona,
  PuntoEncuentro,
  TipoEvento,
  Consola,
  Confirmacion,
  ContadorAccountability,
  EstadoEvento,
  PayloadProgMqtt,
  EstadoSimulacro,
  SimulacroProgramado,
  FilaHistorialSimulacro,
  RolOperador,
  AlcanceTipo,
  EstadoPersona,
} from "../types.js";
import type { ConfirmacionInicial, EventoPuntoInicial } from "../logic/eventos.js";
import type { RegistroAuditoriaPin } from "../logic/auth.js";
import type { NuevaFilaSimulacro } from "../logic/simulacro.js";

export function crearClienteDb(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — copiar .env.example a .env y completar."
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export class Db {
  constructor(private client: SupabaseClient) {}

  async getConsolaPorId(consolaId: string): Promise<Consola | null> {
    const { data, error } = await this.client
      .from("consolas")
      .select("id, sitio_id, nombre, estado_config, en_linea")
      .eq("id", consolaId)
      .maybeSingle();
    if (error) throw error;
    return data as Consola | null;
  }

  async getConsolaNombre(consolaId: string): Promise<string> {
    const { data, error } = await this.client.from("consolas").select("nombre").eq("id", consolaId).single();
    if (error) throw error;
    return data.nombre as string;
  }

  async getSitioOrganizacionId(sitioId: string): Promise<string> {
    const { data, error } = await this.client.from("sitios").select("organizacion_id").eq("id", sitioId).single();
    if (error) throw error;
    return data.organizacion_id as string;
  }

  async getSitioNombre(sitioId: string): Promise<string> {
    const { data, error } = await this.client.from("sitios").select("nombre").eq("id", sitioId).single();
    if (error) throw error;
    return data.nombre as string;
  }

  async getTipoEventoPorNombre(organizacionId: string, nombre: string): Promise<TipoEvento | null> {
    const { data, error } = await this.client
      .from("tipos_evento")
      .select("id, nombre, es_ok, activa_rele")
      .or(`organizacion_id.eq.${organizacionId},organizacion_id.is.null`)
      .ilike("nombre", nombre)
      .maybeSingle();
    if (error) throw error;
    return data as TipoEvento | null;
  }

  async existeEvento(eventoId: string): Promise<boolean> {
    const { data, error } = await this.client.from("eventos").select("id").eq("id", eventoId).maybeSingle();
    if (error) throw error;
    return data !== null;
  }

  async getEventoEnCursoDeSitio(sitioId: string): Promise<string | null> {
    const { data, error } = await this.client
      .from("eventos")
      .select("id")
      .eq("sitio_id", sitioId)
      .eq("estado", "en_curso")
      .order("iniciado_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
  }

  async insertEvento(evento: {
    id: string;
    organizacion_id: string;
    sitio_id: string;
    consola_id: string;
    operador_id: string;
    tipo_evento_id: string;
    modo: "real" | "simulacro";
    simulacro_programado_id: string | null;
    notificacion_enviada: boolean;
    // Solo para el propio evento OK (ver handlers/eventos.ts): se inserta ya
    // resuelto, nunca "en_curso" — si no, se queda colgado para siempre como
    // el evento en_curso más reciente del sitio (bug real, ver commit que
    // agregó esto). Se omite en el alta normal de un evento real, donde el
    // default de la columna ('en_curso') es lo correcto.
    estado?: "cerrado";
    cerrado_at?: string;
  }): Promise<void> {
    const { error } = await this.client.from("eventos").insert(evento);
    if (error) throw error;
  }

  async cerrarEvento(eventoId: string): Promise<void> {
    const { error } = await this.client
      .from("eventos")
      .update({ estado: "cerrado", cerrado_at: new Date().toISOString() })
      .eq("id", eventoId);
    if (error) throw error;
  }

  async getPersonasActivasDeSitio(sitioId: string): Promise<Persona[]> {
    const { data, error } = await this.client
      .from("personas")
      .select("id, organizacion_id, sitio_id, nombre, dni, telefono, tipo, estado, push_token")
      .eq("sitio_id", sitioId)
      .eq("estado", "activo");
    if (error) throw error;
    return (data ?? []) as Persona[];
  }

  async getPuntosActivosDeSitio(sitioId: string): Promise<PuntoEncuentro[]> {
    const { data, error } = await this.client
      .from("puntos_encuentro")
      .select("id, sitio_id, nombre, activo")
      .eq("sitio_id", sitioId)
      .eq("activo", true);
    if (error) throw error;
    return (data ?? []) as PuntoEncuentro[];
  }

  async insertConfirmacionesIniciales(filas: ConfirmacionInicial[]): Promise<void> {
    if (filas.length === 0) return;
    const { error } = await this.client.from("confirmaciones").insert(filas);
    if (error) throw error;
  }

  async insertEventosPuntosEstado(filas: EventoPuntoInicial[]): Promise<void> {
    if (filas.length === 0) return;
    const { error } = await this.client.from("eventos_puntos_estado").insert(filas);
    if (error) throw error;
  }

  async insertAuditoriaPin(registro: RegistroAuditoriaPin): Promise<void> {
    const { error } = await this.client.from("auditoria_pin").insert(registro);
    if (error) throw error;
  }

  async actualizarHeartbeatConsola(consolaId: string): Promise<void> {
    const { error } = await this.client
      .from("consolas")
      .update({ ultimo_heartbeat: new Date().toISOString(), en_linea: true })
      .eq("id", consolaId);
    if (error) throw error;
  }

  async actualizarEstadoConsola(consolaId: string, enLinea: boolean): Promise<void> {
    const { error } = await this.client.from("consolas").update({ en_linea: enLinea }).eq("id", consolaId);
    if (error) throw error;
  }

  /**
   * Verifica un JWT de Supabase Auth (el que manda Mobile en
   * `Authorization: Bearer <token>`) contra el propio servidor de Auth del
   * proyecto — no se valida la firma a mano acá para no depender de qué
   * esquema de firma use el proyecto (HS256 con secreto compartido vs.
   * claves asimétricas/JWKS); `auth.getUser` ya lo resuelve. Devuelve el
   * `auth_user_id`, o null si el token es inválido o expiró.
   *
   * No es específico de Mobile pese al nombre original — lo reusa también
   * GET /simulacros/cumplimiento (ver handlers/cumplimiento.ts) para
   * autenticar operadores, no solo personas.
   */
  async verificarJwt(token: string): Promise<string | null> {
    const { data, error } = await this.client.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  }

  /** La persona vinculada a esa cuenta de Mobile (ver migración personas.auth_user_id) — null si ninguna. */
  async getPersonaPorAuthUserId(authUserId: string): Promise<{ id: string } | null> {
    const { data, error } = await this.client
      .from("personas")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (error) throw error;
    return data as { id: string } | null;
  }

  /**
   * El operador vinculado a esa cuenta (operadores.auth_user_id, ya
   * existía en el esquema) — null si ninguno. Incluye
   * `organizacionId`: lo necesita `handlers/operadores.ts` para
   * confinar cualquier alta/reseteo que haga un admin a su propia
   * organización (esto usa `service_role`, que bypasea RLS por
   * completo — la restricción de organización acá es manual, no algo
   * que la base ya esté aplicando por nosotros).
   */
  async getOperadorPorAuthUserId(
    authUserId: string
  ): Promise<{ id: string; rol: RolOperador; organizacionId: string } | null> {
    const { data, error } = await this.client
      .from("operadores")
      .select("id, rol, organizacion_id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { id: data.id, rol: data.rol, organizacionId: data.organizacion_id };
  }

  /** Para el handler de POST /confirmaciones: a qué sitio pertenece el evento y si sigue en curso. */
  async getEventoParaConfirmar(eventoId: string): Promise<{ sitio_id: string; estado: EstadoEvento } | null> {
    const { data, error } = await this.client
      .from("eventos")
      .select("sitio_id, estado")
      .eq("id", eventoId)
      .maybeSingle();
    if (error) throw error;
    return data as { sitio_id: string; estado: EstadoEvento } | null;
  }

  /** Los punto_id habilitados de un evento (eventos_puntos_estado) — para validar el puntoId de POST /confirmaciones. */
  async getPuntosHabilitadosDeEvento(eventoId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from("eventos_puntos_estado")
      .select("punto_id")
      .eq("evento_id", eventoId)
      .eq("habilitado", true);
    if (error) throw error;
    return (data ?? []).map((r: { punto_id: string }) => r.punto_id);
  }

  /**
   * Actualiza la confirmación que ya existe para (evento, persona) — nace
   * `pendiente` al abrir el evento (ver crearConfirmacionesIniciales), esto
   * nunca inserta una fila nueva. Devuelve null si no hay ninguna fila para
   * ese par — significa que esa persona no fue notificada de ese evento
   * (personaId equivocado, o no estaba activa en el sitio cuando se abrió).
   */
  async actualizarConfirmacion(
    eventoId: string,
    personaId: string,
    campos: {
      estado: "ok" | "ayuda";
      punto_id: string | null;
      nota_ayuda: string | null;
      ubicacion_lat: number | null;
      ubicacion_lng: number | null;
    }
  ): Promise<Confirmacion | null> {
    const { data, error } = await this.client
      .from("confirmaciones")
      .update({ ...campos, confirmado_at: new Date().toISOString() })
      .eq("evento_id", eventoId)
      .eq("persona_id", personaId)
      .select("id, evento_id, persona_id, estado, punto_id, canal")
      .maybeSingle();
    if (error) throw error;
    return data as Confirmacion | null;
  }

  async getConfirmacionesDeEvento(eventoId: string): Promise<Confirmacion[]> {
    const { data, error } = await this.client
      .from("confirmaciones")
      .select("id, evento_id, persona_id, estado, punto_id, canal")
      .eq("evento_id", eventoId);
    if (error) throw error;
    return (data ?? []) as Confirmacion[];
  }

  /**
   * Camino real para Accountability (ver logic/accountability.ts,
   * `armarAccountabilityDesdeContadores`) — lee `accountability_contadores`
   * (una fila por punto + una para "sin punto", mantenidas por
   * `trg_confirmaciones_accountability`) en vez de `getConfirmacionesDeEvento`,
   * que trae la tabla completa.
   */
  async getContadoresAccountability(eventoId: string): Promise<ContadorAccountability[]> {
    const { data, error } = await this.client
      .from("accountability_contadores")
      .select("punto_id, ok, ayuda, pendiente")
      .eq("evento_id", eventoId);
    if (error) throw error;
    return (data ?? []).map((r: { punto_id: string | null; ok: number; ayuda: number; pendiente: number }) => ({
      puntoId: r.punto_id,
      ok: r.ok,
      ayuda: r.ayuda,
      pendiente: r.pendiente,
    }));
  }

  /** Filas `programado` de simulacros_programados de un sitio — ver logic/simulacro.ts. */
  async getSimulacrosProgramadosDeSitio(sitioId: string): Promise<SimulacroProgramado[]> {
    const { data, error } = await this.client
      .from("simulacros_programados")
      .select(Db.SELECT_SIMULACRO)
      .eq("sitio_id", sitioId)
      .eq("estado", "programado");
    if (error) throw error;
    return this.mapFilasSimulacro(data);
  }

  /**
   * Todos los simulacros `programado`, de cualquier sitio — para el
   * barrido periódico que busca vencidos (ver handlers/simulacro.ts,
   * marcarSimulacrosVencidosComoNoRealizados). A diferencia de
   * getSimulacrosProgramadosDeSitio, no filtra por sitio (es un chequeo
   * global). Ya no filtra por `puntual` — las recurrentes también tienen
   * una fecha_hora concreta (ver types.ts, SimulacroProgramado) y también
   * pueden vencer.
   */
  async getTodosLosSimulacrosProgramados(): Promise<SimulacroProgramado[]> {
    const { data, error } = await this.client
      .from("simulacros_programados")
      .select(Db.SELECT_SIMULACRO)
      .eq("estado", "programado");
    if (error) throw error;
    return this.mapFilasSimulacro(data);
  }

  /**
   * Todo el historial de simulacros (cualquier estado) — para GET
   * /simulacros/cumplimiento (ver handlers/cumplimiento.ts). A diferencia
   * de las otras consultas de simulacros, esta SÍ trae el nombre del sitio
   * (join a `sitios`) — es la única que lo necesita, no vale la pena
   * traerlo en las demás.
   *
   * `organizacionId` es obligatorio y siempre se aplica — `simulacros_programados`
   * no tiene su propia columna `organizacion_id` (solo `sitio_id`), así
   * que el filtro va vía `sitios!inner(organizacion_id)`. Sin esto, este
   * método (que usa `service_role`, sin RLS) devolvía el historial de
   * TODAS las organizaciones cuando `sitioId` venía `null` — hallazgo de
   * revisión de código al construir la pantalla de Historial en
   * Frontend Web, ver backend-server/README.md. `sitioId`, si viene, se
   * combina con el filtro de organización — un sitio de otra
   * organización simplemente no matchea nada, no hace falta validarlo
   * aparte.
   */
  async getHistorialSimulacros(organizacionId: string, sitioId: string | null): Promise<FilaHistorialSimulacro[]> {
    let query = this.client
      .from("simulacros_programados")
      .select("sitio_id, tipo_evento_id, fecha_hora, estado, sitios!inner(nombre, organizacion_id), tipos_evento(nombre)")
      .eq("sitios.organizacion_id", organizacionId);
    if (sitioId) query = query.eq("sitio_id", sitioId);
    const { data, error } = await query;
    if (error) throw error;

    type Fila = {
      sitio_id: string;
      tipo_evento_id: string;
      fecha_hora: string | null;
      estado: EstadoSimulacro;
      sitios: { nombre: string } | null;
      tipos_evento: { nombre: string } | null;
    };
    return ((data ?? []) as unknown as Fila[]).map((f) => ({
      sitioId: f.sitio_id,
      sitioNombre: f.sitios?.nombre ?? "(sitio desconocido)",
      tipoEventoId: f.tipo_evento_id,
      tipoEventoNombre: f.tipos_evento?.nombre ?? "(tipo desconocido)",
      fechaHora: f.fecha_hora,
      estado: f.estado,
    }));
  }

  private static readonly SELECT_SIMULACRO =
    "id, sitio_id, tipo_evento_id, puntual, fecha_hora, estado, recurrencia, sorpresa, escenario, rotacion_tipos, tipos_evento(nombre)";

  private mapFilasSimulacro(data: unknown[] | null): SimulacroProgramado[] {
    type Fila = {
      id: string;
      sitio_id: string;
      tipo_evento_id: string;
      puntual: boolean;
      fecha_hora: string | null;
      estado: SimulacroProgramado["estado"];
      recurrencia: SimulacroProgramado["recurrencia"];
      sorpresa: boolean;
      escenario: string | null;
      rotacion_tipos: string[] | null;
      tipos_evento: { nombre: string } | null;
    };
    return ((data ?? []) as unknown as Fila[]).map((f) => ({
      id: f.id,
      sitioId: f.sitio_id,
      tipoEventoId: f.tipo_evento_id,
      tipoEventoNombre: f.tipos_evento?.nombre ?? "(tipo desconocido)",
      puntual: f.puntual,
      fechaHora: f.fecha_hora,
      estado: f.estado,
      recurrencia: f.recurrencia,
      sorpresa: f.sorpresa,
      escenario: f.escenario,
      rotacionTipos: f.rotacion_tipos,
    }));
  }

  /**
   * Transiciona un simulacro de `programado` a un estado terminal
   * (`realizado` o `no_realizado`) y devuelve la fila completa si la
   * transición aplicó — null si ya no estaba en `programado` (alguien más
   * ya lo resolvió, o el id no existe). El caller usa la fila devuelta
   * para decidir si hay que generar la próxima ocurrencia (ver
   * logic/simulacro.ts, proximaFilaSimulacro).
   */
  async transicionarSimulacro(
    id: string,
    nuevoEstado: "realizado" | "no_realizado"
  ): Promise<SimulacroProgramado | null> {
    const { data, error } = await this.client
      .from("simulacros_programados")
      .update({ estado: nuevoEstado })
      .eq("id", id)
      .eq("estado", "programado") // no pisar si alguien ya lo movió de estado mientras tanto
      .select(Db.SELECT_SIMULACRO)
      .maybeSingle();
    if (error) throw error;
    return data ? this.mapFilasSimulacro([data])[0] : null;
  }

  /**
   * Inserta la fila de la próxima ocurrencia de un simulacro recurrente —
   * ver logic/simulacro.ts, proximaFilaSimulacro. `sorpresa` se hereda de
   * la ocurrencia resuelta (un programa sorpresa sigue siendo sorpresa);
   * `escenario` NO se hereda — repetir la misma narrativa en cada
   * ocurrencia futura no tiene sentido, alguien tiene que escribir una
   * nueva para la próxima vez que corresponda.
   */
  async insertProximaOcurrenciaSimulacro(fila: NuevaFilaSimulacro): Promise<void> {
    const { error } = await this.client.from("simulacros_programados").insert({
      sitio_id: fila.sitioId,
      tipo_evento_id: fila.tipoEventoId,
      puntual: false,
      fecha_hora: fila.fechaHora,
      recurrencia: fila.recurrencia,
      sorpresa: fila.sorpresa,
      rotacion_tipos: fila.rotacionTipos,
      estado: "programado",
    });
    if (error) throw error;
  }

  /** `true` si `tipoEventoId` es un tipo real de `organizacionId` (o global, `organizacion_id IS NULL`) — mismo motivo que `sitiosPertenecenAOrganizacion`: service_role bypasea RLS, así que el handler tiene que confirmarlo él mismo antes de programar un simulacro con ese tipo. */
  async tipoEventoPerteneceAOrganizacion(tipoEventoId: string, organizacionId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("tipos_evento")
      .select("id, organizacion_id")
      .eq("id", tipoEventoId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return false;
    return data.organizacion_id === null || data.organizacion_id === organizacionId;
  }

  /**
   * Alta de un simulacro programado por un admin (ver
   * handlers/simulacro.ts, manejarProgramarSimulacro) — a diferencia de
   * `insertProximaOcurrenciaSimulacro` (que genera la ocurrencia
   * SIGUIENTE de un programa ya existente), esta es la primera fila de
   * un programa nuevo, puntual o recurrente. `sorpresa`/`escenario`/
   * `rotacionTipos` no los pone hoy ninguna pantalla — quedan en sus
   * default (false/null/null) hasta que se necesiten (ver
   * frontend-web/README.md).
   */
  async crearSimulacroProgramado(fila: {
    sitioId: string;
    tipoEventoId: string;
    puntual: boolean;
    fechaHora: string;
    recurrencia: SimulacroProgramado["recurrencia"];
  }): Promise<SimulacroProgramado> {
    const { data, error } = await this.client
      .from("simulacros_programados")
      .insert({
        sitio_id: fila.sitioId,
        tipo_evento_id: fila.tipoEventoId,
        puntual: fila.puntual,
        fecha_hora: fila.fechaHora,
        recurrencia: fila.recurrencia,
        estado: "programado",
      })
      .select(Db.SELECT_SIMULACRO)
      .single();
    if (error) throw error;
    return this.mapFilasSimulacro([data])[0];
  }

  /**
   * Trae sitio_id + estado de un simulacro programado, sin más — el
   * primer paso de editar/cancelar (ver handlers/simulacro.ts): hace
   * falta saber a qué sitio pertenece ANTES de poder confirmar que ese
   * sitio es de la organización del admin que llama (service_role
   * bypasea RLS, así que nada más lo hace por vos).
   */
  async getSitioYEstadoDeSimulacro(id: string): Promise<{ sitioId: string; estado: EstadoSimulacro } | null> {
    const { data, error } = await this.client.from("simulacros_programados").select("sitio_id, estado").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? { sitioId: data.sitio_id, estado: data.estado } : null;
  }

  /**
   * Edita un simulacro que sigue sin resolverse (`programado` o
   * `pendiente_confirmacion` — el wireframe permite editar/cancelar
   * cualquiera de los dos, ver frontend-web/README.md). Devuelve null
   * si mientras tanto pasó a un estado terminal (alguien lo disparó, o
   * venció) — el caller lo trata como "ya no se puede editar", no como
   * un error.
   */
  async editarSimulacroProgramado(
    id: string,
    fila: { tipoEventoId: string; puntual: boolean; fechaHora: string; recurrencia: SimulacroProgramado["recurrencia"] }
  ): Promise<SimulacroProgramado | null> {
    const { data, error } = await this.client
      .from("simulacros_programados")
      .update({ tipo_evento_id: fila.tipoEventoId, puntual: fila.puntual, fecha_hora: fila.fechaHora, recurrencia: fila.recurrencia })
      .eq("id", id)
      .in("estado", ["programado", "pendiente_confirmacion"])
      .select(Db.SELECT_SIMULACRO)
      .maybeSingle();
    if (error) throw error;
    return data ? this.mapFilasSimulacro([data])[0] : null;
  }

  /** Cancela (borra) un simulacro que sigue sin resolverse — `true` si había uno para borrar, `false` si ya pasó a un estado terminal mientras tanto. */
  async cancelarSimulacroProgramado(id: string): Promise<boolean> {
    const { data, error } = await this.client
      .from("simulacros_programados")
      .delete()
      .eq("id", id)
      .in("estado", ["programado", "pendiente_confirmacion"])
      .select("id");
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  /** Todos los sitios — para el barrido periódico de sincronización de padrón (ver handlers/padron.ts). */
  async getTodosLosSitiosIds(): Promise<string[]> {
    const { data, error } = await this.client.from("sitios").select("id");
    if (error) throw error;
    return (data ?? []).map((r: { id: string }) => r.id);
  }

  /** Todas las consolas — para el barrido periódico de sincronización de PROG1-4 (ver handlers/prog.ts). */
  async getTodosLosIdsDeConsolas(): Promise<string[]> {
    const { data, error } = await this.client.from("consolas").select("id");
    if (error) throw error;
    return (data ?? []).map((r: { id: string }) => r.id);
  }

  /**
   * Resuelve `consolas.prog_config` (jsonb, `{prog1: tipoEventoId|null, ...}`)
   * a nombres de tipo de evento reales — la consola solo necesita el
   * nombre (lo manda tal cual en `PayloadEventoMqtt.tipo`), no el id.
   */
  async getProgConfigDeConsola(consolaId: string): Promise<PayloadProgMqtt> {
    const { data: consola, error: errConsola } = await this.client
      .from("consolas")
      .select("prog_config")
      .eq("id", consolaId)
      .maybeSingle();
    if (errConsola) throw errConsola;

    const config = (consola?.prog_config ?? {}) as Record<string, string | null>;
    const ids = ["prog1", "prog2", "prog3", "prog4"]
      .map((k) => config[k])
      .filter((id): id is string => typeof id === "string");

    let nombresPorId: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: tipos, error: errTipos } = await this.client.from("tipos_evento").select("id, nombre").in("id", ids);
      if (errTipos) throw errTipos;
      nombresPorId = Object.fromEntries((tipos ?? []).map((t: { id: string; nombre: string }) => [t.id, t.nombre]));
    }

    const resolver = (id: string | null | undefined): string | null => (id ? (nombresPorId[id] ?? null) : null);
    return {
      prog1: resolver(config.prog1),
      prog2: resolver(config.prog2),
      prog3: resolver(config.prog3),
      prog4: resolver(config.prog4),
    };
  }

  async getSitiosVecinos(sitioId: string): Promise<string[]> {
    const { data, error } = await this.client.from("sitios_vecinos").select("vecino_id").eq("sitio_id", sitioId);
    if (error) throw error;
    return (data ?? []).map((r: { vecino_id: string }) => r.vecino_id);
  }

  async getConsolasActivasDeSitio(sitioId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from("consolas")
      .select("id")
      .eq("sitio_id", sitioId)
      .eq("estado_config", "activa");
    if (error) throw error;
    return (data ?? []).map((r: { id: string }) => r.id);
  }

  async getOperadoresActivosDeSitio(
    sitioId: string
  ): Promise<Array<{ id: string; legajo: string | null; pin_hash: string; rol: "operador" | "admin" }>> {
    // Alcance "organización" (ver ficha) ve todos los sitios — se resuelve
    // trayendo primero los de alcance puntual sobre este sitio, más los de
    // alcance organización de la misma organización que el sitio.
    const { data: sitio, error: errSitio } = await this.client
      .from("sitios")
      .select("organizacion_id")
      .eq("id", sitioId)
      .single();
    if (errSitio) throw errSitio;

    const { data: puntuales, error: err1 } = await this.client
      .from("operadores_sitios")
      .select("operadores(id, legajo, pin_hash, rol, estado)")
      .eq("sitio_id", sitioId);
    if (err1) throw err1;

    const { data: deOrganizacion, error: err2 } = await this.client
      .from("operadores")
      .select("id, legajo, pin_hash, rol, estado")
      .eq("organizacion_id", sitio.organizacion_id)
      .eq("alcance_tipo", "organizacion");
    if (err2) throw err2;

    type Fila = { id: string; legajo: string | null; pin_hash: string; rol: "operador" | "admin"; estado: string };
    const puntualesFilas = (puntuales ?? [])
      .map((r: { operadores: unknown }) => r.operadores as unknown as Fila)
      .filter(Boolean);
    const todas = [...puntualesFilas, ...((deOrganizacion ?? []) as Fila[])];

    return todas
      .filter((o) => o.estado === "activo")
      .map(({ id, legajo, pin_hash, rol }) => ({ id, legajo, pin_hash, rol }));
  }

  // --- Administración de operadores (Frontend Web, ver handlers/operadores.ts) ---

  /** Para confinar el alta de un operador a sitios que de verdad son de la organización del admin que la pide (esto usa service_role — RLS no está protegiendo nada acá). */
  async sitiosPertenecenAOrganizacion(sitiosIds: string[], organizacionId: string): Promise<boolean> {
    const { data, error } = await this.client.from("sitios").select("id").eq("organizacion_id", organizacionId).in("id", sitiosIds);
    if (error) throw error;
    return (data ?? []).length === sitiosIds.length;
  }

  async crearOperador(input: {
    organizacionId: string;
    nombre: string;
    legajo: string | null;
    rol: RolOperador;
    alcanceTipo: AlcanceTipo;
    pinHash: string;
  }): Promise<string> {
    const { data, error } = await this.client
      .from("operadores")
      .insert({
        organizacion_id: input.organizacionId,
        nombre: input.nombre,
        legajo: input.legajo,
        rol: input.rol,
        alcance_tipo: input.alcanceTipo,
        pin_hash: input.pinHash,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  async vincularSitiosOperador(operadorId: string, sitiosIds: string[]): Promise<void> {
    const filas = sitiosIds.map((sitioId) => ({ operador_id: operadorId, sitio_id: sitioId }));
    const { error } = await this.client.from("operadores_sitios").insert(filas);
    if (error) throw error;
  }

  /**
   * Invita por email a través de la Admin API de Supabase Auth
   * (`inviteUserByEmail` — manda el mail de invitación con el link para
   * poner contraseña, necesita `service_role`). Devuelve el
   * `auth_user_id` recién creado para vincularlo al operador — separado
   * en dos pasos (invitar, después vincular) en vez de un trigger de
   * Postgres porque la invitación puede fallar (email ya en uso, etc.)
   * y en ese caso no queremos un operador a medio crear.
   */
  async invitarOperadorPorEmail(email: string): Promise<{ ok: true; authUserId: string } | { ok: false; error: string }> {
    const { data, error } = await this.client.auth.admin.inviteUserByEmail(email);
    if (error || !data.user) return { ok: false, error: error?.message ?? "invitación sin usuario devuelto" };
    return { ok: true, authUserId: data.user.id };
  }

  async vincularAuthUserOperador(operadorId: string, authUserId: string): Promise<void> {
    const { error } = await this.client.from("operadores").update({ auth_user_id: authUserId }).eq("id", operadorId);
    if (error) throw error;
  }

  /** Para el reseteo de PIN: confirma que el operador existe y a qué organización pertenece (mismo motivo que sitiosPertenecenAOrganizacion — service_role bypasea RLS). */
  async getOperadorPorId(operadorId: string): Promise<{ id: string; organizacionId: string } | null> {
    const { data, error } = await this.client.from("operadores").select("id, organizacion_id").eq("id", operadorId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { id: data.id, organizacionId: data.organizacion_id };
  }

  async actualizarPinOperador(operadorId: string, pinHash: string): Promise<void> {
    const { error } = await this.client.from("operadores").update({ pin_hash: pinHash }).eq("id", operadorId);
    if (error) throw error;
  }

  // --- Alta de personas desde Mobile (ver handlers/personas.ts) ---

  /** Para el flujo "reclamar" (personal fijo ya en el padrón) — null si no hay ningún match exacto de legajo+dni. */
  async getPersonaPorLegajoYDni(legajo: string, dni: string): Promise<{ id: string; authUserId: string | null } | null> {
    const { data, error } = await this.client.from("personas").select("id, auth_user_id").eq("legajo", legajo).eq("dni", dni).limit(1).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { id: data.id, authUserId: data.auth_user_id };
  }

  async vincularAuthUserPersona(personaId: string, authUserId: string): Promise<void> {
    const { error } = await this.client.from("personas").update({ auth_user_id: authUserId }).eq("id", personaId);
    if (error) throw error;
  }

  /** `sitioId` viene de Mobile, sin validar — a diferencia de getSitioOrganizacionId (que asume un caller confiable y explota con `.single()`), acá null en vez de tirar si no existe. */
  async getSitioParaAutoregistro(sitioId: string): Promise<{ id: string; organizacionId: string } | null> {
    const { data, error } = await this.client.from("sitios").select("id, organizacion_id").eq("id", sitioId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { id: data.id, organizacionId: data.organizacion_id };
  }

  async crearPersonaAutoregistro(input: {
    organizacionId: string;
    sitioId: string;
    nombre: string;
    dni: string;
    legajo: string | null;
    telefono: string;
    authUserId: string;
  }): Promise<string> {
    const { data, error } = await this.client
      .from("personas")
      .insert({
        organizacion_id: input.organizacionId,
        sitio_id: input.sitioId,
        nombre: input.nombre,
        dni: input.dni,
        legajo: input.legajo,
        telefono: input.telefono,
        tipo: "fijo",
        estado: "pendiente_aprobacion",
        origen: "autoregistro",
        auth_user_id: input.authUserId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  async getCodigoAccesoPorCodigo(codigo: string): Promise<{
    id: string;
    tipo: "individual" | "lote";
    dni: string | null;
    empresa: string;
    sitioId: string;
    organizacionId: string;
    vencimiento: string;
    estado: "vigente" | "vencido" | "agotado" | "revocado";
  } | null> {
    const { data, error } = await this.client
      .from("codigos_acceso")
      .select("id, tipo, dni, empresa, sitio_id, organizacion_id, vencimiento, estado")
      .eq("codigo", codigo)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      id: data.id,
      tipo: data.tipo,
      dni: data.dni,
      empresa: data.empresa,
      sitioId: data.sitio_id,
      organizacionId: data.organizacion_id,
      vencimiento: data.vencimiento,
      estado: data.estado,
    };
  }

  /**
   * Intento atómico de consumir un uso del código (ver migración
   * `fn_intentar_usar_codigo` — evita la carrera de dos personas
   * canjeando el mismo código de lote al mismo tiempo). Null si para
   * cuando el UPDATE corrió de verdad el código ya no tenía cupo, o
   * dejó de estar vigente — aunque `getCodigoAccesoPorCodigo` lo haya
   * visto vigente un instante antes.
   */
  async intentarUsarCodigo(codigoId: string): Promise<boolean> {
    const { data, error } = await this.client.rpc("fn_intentar_usar_codigo", { p_codigo_id: codigoId });
    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  }

  async crearPersonaPorCodigo(input: {
    organizacionId: string;
    sitioId: string;
    nombre: string;
    dni: string;
    telefono: string;
    empresa: string;
    vencimiento: string;
    authUserId: string;
  }): Promise<string> {
    const { data, error } = await this.client
      .from("personas")
      .insert({
        organizacion_id: input.organizacionId,
        sitio_id: input.sitioId,
        nombre: input.nombre,
        dni: input.dni,
        telefono: input.telefono,
        empresa: input.empresa,
        vencimiento: input.vencimiento,
        tipo: "eventual",
        estado: "activo",
        origen: "codigo_acceso",
        auth_user_id: input.authUserId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  async registrarUsoCodigo(codigoId: string, personaId: string): Promise<void> {
    const { error } = await this.client.from("codigos_acceso_usos").insert({ codigo_id: codigoId, persona_id: personaId });
    if (error) throw error;
  }

  /** Solo toca `push_token` — ver types.ts PayloadActualizarPushTokenHttp para por qué esto es un endpoint aparte y no una escritura directa contra Supabase. */
  async actualizarPushTokenPersona(personaId: string, pushToken: string): Promise<void> {
    const { error } = await this.client
      .from("personas")
      .update({ push_token: pushToken, push_token_actualizado_at: new Date().toISOString() })
      .eq("id", personaId);
    if (error) throw error;
  }

  // --- Aprobar/rechazar autoregistro (ver handlers/personas.ts, "Precauciones..." no aplica acá, ver "Aprobar/rechazar un autoregistro") ---

  /** Para aprobar/rechazar — trae `estado` y `pushToken` para que el handler decida si hay que avisar por push. */
  async getPersonaPorId(personaId: string): Promise<{ id: string; organizacionId: string; estado: EstadoPersona; pushToken: string | null } | null> {
    const { data, error } = await this.client
      .from("personas")
      .select("id, organizacion_id, estado, push_token")
      .eq("id", personaId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { id: data.id, organizacionId: data.organizacion_id, estado: data.estado, pushToken: data.push_token };
  }

  async actualizarEstadoPersona(personaId: string, estado: EstadoPersona): Promise<void> {
    const { error } = await this.client.from("personas").update({ estado }).eq("id", personaId);
    if (error) throw error;
  }
}
