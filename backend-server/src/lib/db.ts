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
  EstadoSimulacro,
  SimulacroProgramado,
  FilaHistorialSimulacro,
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

  /** El operador vinculado a esa cuenta (operadores.auth_user_id, ya existía en el esquema) — null si ninguno. */
  async getOperadorPorAuthUserId(authUserId: string): Promise<{ id: string; rol: "operador" | "admin" } | null> {
    const { data, error } = await this.client
      .from("operadores")
      .select("id, rol")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (error) throw error;
    return data as { id: string; rol: "operador" | "admin" } | null;
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
   */
  async getHistorialSimulacros(sitioId: string | null): Promise<FilaHistorialSimulacro[]> {
    let query = this.client
      .from("simulacros_programados")
      .select("sitio_id, tipo_evento_id, fecha_hora, estado, sitios(nombre), tipos_evento(nombre)");
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

  /** Todos los sitios — para el barrido periódico de sincronización de padrón (ver handlers/padron.ts). */
  async getTodosLosSitiosIds(): Promise<string[]> {
    const { data, error } = await this.client.from("sitios").select("id");
    if (error) throw error;
    return (data ?? []).map((r: { id: string }) => r.id);
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
  ): Promise<Array<{ legajo: string | null; pin_hash: string; rol: "operador" | "admin" }>> {
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
      .select("operadores(legajo, pin_hash, rol, estado)")
      .eq("sitio_id", sitioId);
    if (err1) throw err1;

    const { data: deOrganizacion, error: err2 } = await this.client
      .from("operadores")
      .select("legajo, pin_hash, rol, estado")
      .eq("organizacion_id", sitio.organizacion_id)
      .eq("alcance_tipo", "organizacion");
    if (err2) throw err2;

    type Fila = { legajo: string | null; pin_hash: string; rol: "operador" | "admin"; estado: string };
    const puntualesFilas = (puntuales ?? [])
      .map((r: { operadores: unknown }) => r.operadores as unknown as Fila)
      .filter(Boolean);
    const todas = [...puntualesFilas, ...((deOrganizacion ?? []) as Fila[])];

    return todas.filter((o) => o.estado === "activo").map(({ legajo, pin_hash, rol }) => ({ legajo, pin_hash, rol }));
  }
}
