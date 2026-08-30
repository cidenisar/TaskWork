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

// --- Administración de operadores (Frontend Web, ver handlers/operadores.ts) ---
//
// Un operador es UNA fila con dos accesos posibles (decisión tomada con
// el usuario, 2026-08-28, ver README "Alta de operadores y login web
// para admins"): el PIN (`pin_hash`, siempre — es lo que usa para
// habilitar una Consola Disparadora) y, opcional, un login de Supabase
// Auth (`auth_user_id`) para entrar al Frontend Web — solo tiene
// sentido si `rol === "admin"` (ver migración
// `auth_organizacion_id_solo_admin_activo`: un `rol: "operador"` nunca
// obtiene acceso por RLS aunque tuviera `auth_user_id` vinculado).

export type RolOperador = "operador" | "admin";
export type AlcanceTipo = "sitio" | "organizacion";

/**
 * Body de `POST /operadores` (Frontend Web → Backend, solo admins). No
 * es una tabla que Frontend pueda escribir directo vía Supabase pese a
 * que RLS se lo permitiría (`org_isolation` es `FOR ALL`) — crear un
 * operador implica generar y hashear un PIN nuevo (`bcryptjs`, ver
 * consola-pi que lo valida) y, opcional, invitar por email a través de
 * la Admin API de Supabase Auth (necesita `service_role`, que el
 * navegador nunca tiene). Ninguna de las dos cosas es posible desde el
 * cliente.
 */
export interface PayloadCrearOperadorHttp {
  nombre: string;
  legajo: string | null;
  rol: RolOperador;
  alcanceTipo: AlcanceTipo;
  /** Ids de `sitios` — obligatorio y no vacío si alcanceTipo === "sitio"; vacío si es "organizacion". */
  sitiosIds: string[];
  /** Si se manda, se invita a esta persona al Frontend Web (ver Db.invitarOperadorPorEmail). Solo tiene sentido con rol "admin". */
  email: string | null;
}

/**
 * Body de `POST /simulacros` y `PATCH /simulacros/:id` (ver
 * handlers/simulacro.ts) — programar/editar un simulacro pasa por acá
 * (no es escritura directa a Supabase como Puntos de encuentro) por
 * dos motivos: la fecha concreta de una ocurrencia recurrente nueva
 * necesita el mismo motor de fechas que ya usa el backend para generar
 * la ocurrencia siguiente (`primeraOcurrenciaDesde`, ver
 * logic/recurrencia.ts — reimplementarlo en el cliente arriesgaba una
 * diferencia sutil, ej. en el corte de fin de mes), y porque programar/
 * editar/cancelar tiene que re-publicar `consolas/{id}/simulacro` al
 * toque (necesita el cliente MQTT, que solo vive acá).
 *
 * `cadaMeses` no se expone todavía — siempre 1 (mensual). El wireframe
 * de Cowork ("Programador de Simulacros") tampoco lo ofrece.
 */
export interface PayloadProgramarSimulacroHttp {
  sitioId: string;
  tipoEventoId: string;
  puntual: boolean;
  /** Obligatorio si puntual — "YYYY-MM-DD". */
  fecha: string | null;
  /** "HH:MM", 24hs. */
  hora: string;
  /** Obligatorio si !puntual — 0=domingo .. 6=sábado (getUTCDay()). */
  diaSemana: 0 | 1 | 2 | 3 | 4 | 5 | 6 | null;
  /** Obligatorio si !puntual — 1..4 = la N-ésima ocurrencia; -1 = la última. */
  posicion: 1 | 2 | 3 | 4 | -1 | null;
}

// --- Alta de personas desde Mobile (ver handlers/personas.ts) ---
//
// Ninguno de los tres flujos pide email/contraseña — el wireframe de
// Cowork ("Mobile — App de Personal", pantallas "registro") no tiene un
// solo campo de ese tipo. La identidad del dispositivo es el JWT que
// Mobile ya trae en el header `Authorization` (una sesión anónima de
// Supabase Auth — `supabase.auth.signInAnonymously()` del lado
// cliente, invisible en el wireframe porque no hace falta ninguna
// pantalla para eso); estos tres endpoints solo vinculan o crean la
// fila de `personas` que le corresponde a esa sesión.

/** Body de `POST /personas/reclamar` — "soy personal fijo, ya estoy en el padrón". */
export interface PayloadReclamarPersonaHttp {
  legajo: string;
  dni: string;
}

/** Body de `POST /personas/autoregistro` — "no me encontraron, pido el alta" (queda pendiente_aprobacion). */
export interface PayloadAutoregistroHttp {
  nombre: string;
  dni: string;
  legajo: string | null;
  telefono: string;
  sitioId: string;
}

/** Body de `POST /personas/canjear-codigo` — "soy eventual/contratista, tengo un código". */
export interface PayloadCanjearCodigoHttp {
  codigo: string;
  nombre: string;
  telefono: string;
  /** Solo se cruza contra el DNI del código si el código es de tipo "individual" y trae uno cargado. */
  dni: string | null;
}

/**
 * Body de `POST /organizaciones/resolver-codigo` (ver
 * handlers/organizaciones.ts) — el paso previo a Autoregistro: Mobile
 * no puede leer `sitios` (admin-only por RLS) antes de tener una
 * `personas` vinculada, así que necesita este código (que el admin de
 * la organización comparte con su personal, ver
 * `organizaciones.codigo_acceso_app`) para saber a qué organización
 * pertenece y qué sitios ofrecerle en el selector.
 */
export interface PayloadResolverCodigoOrgHttp {
  codigo: string;
}

/**
 * Body de `POST /personas/push-token` — Mobile registra/renueva su
 * token de FCM. Endpoint aparte (no una escritura directa contra
 * Supabase, aunque ahora hay lectura propia vía RLS — ver migración
 * `personas_self_read`) porque una fila de `personas` self-editable
 * por su dueño es un riesgo si se permite tocar cualquier columna
 * (alguien podría auto-aprobarse escribiendo `estado: "activo"` a
 * mano) — este endpoint solo puede tocar `push_token`.
 */
export interface PayloadActualizarPushTokenHttp {
  pushToken: string;
}
