// Tipos compartidos — reflejan el modelo de datos (ver
// 03-backend-online.md/backend/001_modelo_de_datos.sql) y el contrato MQTT
// (ver 05.3-programacion.md, "Comunicación Pi ↔ Backend Online — MQTT").

// ---------------------------------------------------------------------------
// Modelo de datos (subconjunto que usa la lógica de negocio)
// ---------------------------------------------------------------------------

export type TipoPersona = "fijo" | "eventual";
export type EstadoPersona = "activo" | "de_baja" | "vencido" | "pendiente_aprobacion" | "rechazado";

export interface Persona {
  id: string;
  organizacion_id: string;
  sitio_id: string | null;
  nombre: string;
  dni: string;
  telefono: string;
  tipo: TipoPersona;
  estado: EstadoPersona;
  push_token: string | null;
}

export type EstadoConfirmacion = "ok" | "ayuda" | "pendiente";
export type CanalConfirmacion = "push" | "sms";

export interface Confirmacion {
  id: string;
  evento_id: string;
  persona_id: string;
  estado: EstadoConfirmacion;
  punto_id: string | null;
  canal: CanalConfirmacion | null;
}

export interface PuntoEncuentro {
  id: string;
  sitio_id: string;
  nombre: string;
  activo: boolean;
}

export interface Consola {
  id: string;
  sitio_id: string;
  nombre: string;
  estado_config: "activa" | "de_baja";
  en_linea: boolean;
}

export type ModoEvento = "real" | "simulacro";
export type EstadoEvento = "en_curso" | "cerrado" | "cancelado";

export interface Evento {
  id: string;
  organizacion_id: string;
  sitio_id: string;
  consola_id: string | null;
  operador_id: string | null;
  tipo_evento_id: string;
  modo: ModoEvento;
  estado: EstadoEvento;
  notificacion_enviada: boolean;
  iniciado_at: string;
  cerrado_at: string | null;
}

export interface TipoEvento {
  id: string;
  nombre: string;
  es_ok: boolean;
}

export type EstadoSimulacro = "programado" | "pendiente_confirmacion" | "realizado" | "no_realizado";

/**
 * Subconjunto de `simulacros_programados` que necesita la lógica de "cuál
 * es el próximo simulacro de este sitio" (ver src/logic/simulacro.ts).
 * `tipoEventoNombre` viene resuelto por join en la query — evita un N+1.
 */
export interface SimulacroProgramado {
  id: string;
  sitioId: string;
  tipoEventoNombre: string;
  puntual: boolean;
  fechaHora: string | null; // ISO; null en los recurrentes (ver logic/simulacro.ts)
  estado: EstadoSimulacro;
}

// ---------------------------------------------------------------------------
// Contrato MQTT (ver ficha Programación)
// ---------------------------------------------------------------------------

/** Payload del tópico `consolas/{id}/eventos` (Pi → Backend). */
export interface PayloadEventoMqtt {
  eventoId: string; // id generado por la propia consola (idempotencia — ver logica/procesarEvento.ts)
  tipo: string; // nombre del tipo de evento, ej. "INCENDIO", "OK"
  estado: "DISPARADO" | "CANCELADO";
  notificacionEnviada: boolean;
  origen: "consola" | "ss2000";
  consolaId: string;
  operadorId: string;
  operadorRol: "operador" | "admin";
  modo: "REAL" | "SIMULACRO";
  simulacroProgramadoId: string | null;
  ts: number; // epoch ms, generado por la consola
}

/** Payload del tópico `consolas/{id}/auth` (Pi → Backend). */
export interface PayloadAuthMqtt {
  operadorId: string | null; // null si el PIN no matcheó a nadie
  legajo: string | null;
  resultado: "valido" | "invalido";
  ts: number;
}

/** Payload del tópico `consolas/{id}/heartbeat` (Pi → Backend, QoS 0, retain). */
export interface PayloadHeartbeatMqtt {
  bateria: number | null; // porcentaje, null si la consola no tiene batería/UPS propio
  caminoRed: "ethernet" | "wifi" | "4g" | null;
  esp32HeartbeatOk: boolean;
  firmwareVersion: string;
  ts: number;
}

/** Payload del tópico `consolas/{id}/estado` (Pi → Backend + LWT del broker). */
export type PayloadEstadoMqtt = "online" | "offline";

/** Payload de `consolas/{id}/padron` (Backend → Pi, retain). */
export interface OperadorPadron {
  legajo: string | null;
  pinHash: string;
  rol: "operador" | "admin";
}
export interface PayloadPadronMqtt {
  operadores: OperadorPadron[];
  actualizadoAt: string; // ISO timestamp
}

/** Payload de `consolas/{id}/simulacro` (Backend → Pi, retain). */
export interface PayloadSimulacroMqtt {
  tipo: string;
  fechaHora: string | null; // ISO, null si es recurrente sin próxima ocurrencia calculada aún
}

/** Payload de `consolas/{id}/accountability/{eventoId}` (Backend → Pi). */
export interface PayloadAccountabilityMqtt {
  eventoId: string;
  notificados: number;
  ok: number;
  ayuda: number;
  pendiente: number;
  porPunto: Array<{ puntoId: string; nombre: string; ok: number; ayuda: number; pendiente: number }>;
}

/** Payload de `consolas/{id}/evento-activo` (Backend → Pi, retain). Null cuando no hay ninguno. */
export interface PayloadEventoActivoMqtt {
  eventoId: string;
  tipo: string;
  modo: "REAL" | "SIMULACRO";
  sitioNombre: string;
  consolaOrigenNombre: string;
  relacion: "mismo-sitio" | "sitio-vecino";
  ts: number;
}

/**
 * Body de `POST /confirmaciones` (Mobile → Backend). No es MQTT — es un
 * endpoint HTTP normal (ver README, "Endpoint para las confirmaciones de
 * Mobile"): un teléfono no mantiene una conexión de broker persistente en
 * background, así que el flujo es push-out / REST-in, no push-out / MQTT-in.
 *
 * Sin personaId: lo deriva el backend del JWT de Supabase Auth (header
 * `Authorization: Bearer <token>`) vía `personas.auth_user_id` — que el
 * body lo mandara directamente permitiría confirmar en nombre de cualquier
 * otra persona con solo cambiar un campo (ver README, "Autenticación de
 * POST /confirmaciones").
 */
export interface PayloadConfirmacionHttp {
  eventoId: string;
  estado: "ok" | "ayuda";
  puntoId: string | null;
  notaAyuda: string | null;
  ubicacionLat: number | null;
  ubicacionLng: number | null;
}
