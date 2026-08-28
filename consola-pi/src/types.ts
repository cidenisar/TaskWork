// Contrato MQTT Pi ↔ Backend (ver `backend-server/src/types.ts`, que es la
// fuente de la verdad porque el backend es quien controla el modelo de
// datos). Duplicado acá a propósito, no importado como paquete compartido:
// consola-pi es un proceso completamente separado que corre en otra
// máquina (la Pi) — atarlo a un `import` cruzado entre carpetas del
// monorepo complicaría el build/deploy de la Pi para ganar poco (el
// contrato cambia poco, y cuando cambia hay que tocar los dos lados de
// todos modos porque son dos procesos distintos). Si algún día esto pesa,
// pasar a un paquete `@refineria/mqtt-contrato` compartido.

/** Tópico `consolas/{id}/eventos` (Pi → Backend). */
export interface PayloadEventoMqtt {
  eventoId: string;
  tipo: string;
  estado: "DISPARADO" | "CANCELADO";
  notificacionEnviada: boolean;
  origen: "consola" | "ss2000";
  consolaId: string;
  operadorId: string;
  operadorRol: "operador" | "admin";
  modo: "REAL" | "SIMULACRO";
  simulacroProgramadoId: string | null;
  ts: number;
}

/** Tópico `consolas/{id}/auth` (Pi → Backend) — auditoría, la consola ya validó. */
export interface PayloadAuthMqtt {
  operadorId: string | null;
  legajo: string | null;
  resultado: "valido" | "invalido";
  ts: number;
}

/** Tópico `consolas/{id}/heartbeat` (Pi → Backend, QoS 0, retain). */
export interface PayloadHeartbeatMqtt {
  bateria: number | null;
  caminoRed: "ethernet" | "wifi" | "4g" | null;
  esp32HeartbeatOk: boolean;
  firmwareVersion: string;
  ts: number;
}

/** Tópico `consolas/{id}/estado` (Pi → Backend + LWT del broker). */
export type PayloadEstadoMqtt = "online" | "offline";

/** Tópico `consolas/{id}/padron` (Backend → Pi, retain). */
export interface OperadorPadron {
  id: string;
  legajo: string | null;
  pinHash: string;
  rol: "operador" | "admin";
}
export interface PayloadPadronMqtt {
  operadores: OperadorPadron[];
  actualizadoAt: string;
}

/** Tópico `consolas/{id}/simulacro` (Backend → Pi, retain). Null = nada programado. */
export interface PayloadSimulacroMqtt {
  tipo: string;
  fechaHora: string | null;
  escenario: string | null;
}

/** Tópico `consolas/{id}/evento-activo` (Backend → Pi, retain). Null = ninguno. */
export interface PayloadEventoActivoMqtt {
  eventoId: string;
  tipo: string;
  modo: "REAL" | "SIMULACRO";
  sitioNombre: string;
  consolaOrigenNombre: string;
  relacion: "mismo-sitio" | "sitio-vecino";
  ts: number;
  activarRele: boolean;
  escenario: string | null;
}

/** Tópico `consolas/{id}/accountability/{eventoId}` (Backend → Pi). */
export interface PayloadAccountabilityMqtt {
  eventoId: string;
  notificados: number;
  ok: number;
  ayuda: number;
  pendiente: number;
  porPunto: Array<{ puntoId: string; nombre: string; ok: number; ayuda: number; pendiente: number }>;
}
