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

/**
 * Una fila de `accountability_contadores` — el contador incremental que
 * mantiene `trg_confirmaciones_accountability` sobre `confirmaciones` (ver
 * migración `accountability_contadores`). `puntoId: null` = confirmaciones
 * sin punto de encuentro asignado; igual suman al total del evento.
 */
export interface ContadorAccountability {
  puntoId: string | null;
  ok: number;
  ayuda: number;
  pendiente: number;
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
  /**
   * ¿Esta clase de evento amerita activar el relé/sirena física de la
   * consola? Aplica a eventos reales y a simulacros por igual — un Tóxico
   * real también debería sonar la sirena, no solo el simulacro (ver
   * README, "Simulacro sorpresa"). Se manda en PayloadEventoActivoMqtt
   * como `activarRele` para que el firmware de la consola (todavía no
   * escrito) sepa cuándo mover el pin.
   */
  activa_rele: boolean;
}

export type EstadoSimulacro = "programado" | "pendiente_confirmacion" | "realizado" | "no_realizado";

/**
 * Forma de la columna `recurrencia` (jsonb) de `simulacros_programados` —
 * ver logic/recurrencia.ts para el cálculo de la próxima ocurrencia.
 * Dos formas cubren los patrones reales de un programa de simulacros de
 * seguridad industrial (mensual, trimestral, semestral, "el primer lunes
 * de cada trimestre") sin la complejidad de un estándar completo tipo
 * RRULE, que sería mucha más potencia de la que hace falta acá:
 *
 *  - "intervalo": cada N semanas/meses desde la ocurrencia actual.
 *  - "posicion": el N-ésimo día de semana del mes, cada N meses — para
 *    patrones tipo "el primer lunes de cada trimestre" (diaSemana: 1,
 *    posicion: 1, cadaMeses: 3). `posicion: -1` = el último de ese día en
 *    el mes.
 */
export type ReglaRecurrencia =
  | { tipo: "intervalo"; unidad: "semanas" | "meses"; cada: number }
  | { tipo: "posicion"; diaSemana: 0 | 1 | 2 | 3 | 4 | 5 | 6; posicion: 1 | 2 | 3 | 4 | -1; cadaMeses: number };

/**
 * Subconjunto de `simulacros_programados` que necesita la lógica de
 * simulacros (ver src/logic/simulacro.ts, src/logic/recurrencia.ts).
 * `tipoEventoNombre` viene resuelto por join en la query — evita un N+1.
 *
 * Toda fila `programado` tiene una `fechaHora` concreta — puntual o
 * recurrente (el modelo anterior dejaba `fechaHora: null` en las
 * recurrentes; ya no: cada ocurrencia agendada tiene su fecha propia, y
 * `recurrencia` no-null es lo que dispara que se genere la siguiente al
 * resolverse esta — ver handlers/simulacro.ts, resolverSimulacroProgramado).
 */
export interface SimulacroProgramado {
  id: string;
  sitioId: string;
  tipoEventoId: string;
  tipoEventoNombre: string;
  puntual: boolean;
  fechaHora: string | null; // ISO
  estado: EstadoSimulacro;
  recurrencia: ReglaRecurrencia | null;
  /** Sin aviso previo por el broadcast de `consolas/{id}/simulacro` — ver logic/simulacro.ts, elegirProximoSimulacro. */
  sorpresa: boolean;
  /** Narrativa puntual (ej. "se rompió una válvula, hay derrame de líquido tóxico en Zona B") — null si no se cargó. */
  escenario: string | null;
  /**
   * Lista ordenada de `tipo_evento_id` por la que rota un programa
   * recurrente — ver logic/simulacro.ts, proximoTipoEvento. Null/vacío =
   * sin rotación, el programa sigue con el mismo tipo para siempre (el
   * comportamiento de antes de que existiera esto).
   */
  rotacionTipos: string[] | null;
}

/**
 * Fila del historial de simulacros (cualquier estado, no solo
 * `programado`) para GET /simulacros/cumplimiento — ver
 * logic/cumplimiento.ts. Trae `sitioNombre` (no lo trae
 * SimulacroProgramado — es la única consulta que lo necesita).
 */
export interface FilaHistorialSimulacro {
  sitioId: string;
  sitioNombre: string;
  tipoEventoId: string;
  tipoEventoNombre: string;
  fechaHora: string | null;
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

/**
 * Payload de `consolas/{id}/padron` (Backend → Pi, retain).
 *
 * `id` es el `operadores.id` real — imprescindible: la consola valida el
 * PIN localmente contra `pinHash` (ver README "Autenticación de las
 * consolas contra Mosquitto"/PIN), pero después tiene que poder mandar
 * `operadorId` real en `PayloadAuthMqtt`/`PayloadEventoMqtt` (ambos lo
 * piden) — sin este campo la consola no tenía forma de saber el id de
 * quién validó, solo el legajo. Encontrado al diseñar el firmware real de
 * la consola (`consola-pi/`, 2026-08-28).
 */
export interface OperadorPadron {
  id: string;
  legajo: string | null;
  pinHash: string;
  rol: "operador" | "admin";
}
export interface PayloadPadronMqtt {
  operadores: OperadorPadron[];
  actualizadoAt: string; // ISO timestamp
}

/**
 * Payload de `consolas/{id}/prog` (Backend → Pi, retain) — asignación de
 * los botones programables PROG1-4 a un tipo de evento (ver
 * `consolas.prog_config` y consola-pi/README, "Configuración PROG1-4").
 * `null` = sin asignar, ese botón no manda un tipo que el backend
 * reconozca todavía.
 */
export interface PayloadProgMqtt {
  prog1: string | null;
  prog2: string | null;
  prog3: string | null;
  prog4: string | null;
}

/** Payload de `consolas/{id}/simulacro` (Backend → Pi, retain). */
export interface PayloadSimulacroMqtt {
  tipo: string;
  fechaHora: string | null; // ISO, null si es recurrente sin próxima ocurrencia calculada aún
  escenario: string | null;
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
  /** Ver TipoEvento.activa_rele — contrato para el firmware de la consola (todavía no escrito). */
  activarRele: boolean;
  /** Narrativa del simulacro, si la tiene (ver SimulacroProgramado.escenario) — null en eventos reales o sin escenario cargado. */
  escenario: string | null;
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
