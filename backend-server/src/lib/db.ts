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
} from "../types.js";
import type { ConfirmacionInicial, EventoPuntoInicial } from "../logic/eventos.js";
import type { RegistroAuditoriaPin } from "../logic/auth.js";

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
      .select("id, nombre, es_ok")
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

  async getConfirmacionesDeEvento(eventoId: string): Promise<Confirmacion[]> {
    const { data, error } = await this.client
      .from("confirmaciones")
      .select("id, evento_id, persona_id, estado, punto_id, canal")
      .eq("evento_id", eventoId);
    if (error) throw error;
    return (data ?? []) as Confirmacion[];
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
