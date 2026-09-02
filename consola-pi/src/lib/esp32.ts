// Cliente hacia el ESP32 de la consola — botones, llave, lámparas y relé.
// Ver README, "Protocolo UART Pi↔ESP32": JSON compacto línea por línea es
// lo único que estaba especificado en la Especificación del Sistema de
// Emergencias; el formato exacto de cada mensaje se define acá porque
// todavía no existe el firmware del ESP32 — a validar/ajustar cuando se
// escriba, no es un contrato ya cerrado del otro lado.
//
// `crearClienteEsp32` toma cualquier `Duplex` (no acopla a `serialport`
// directamente) — así el framing/parseo del protocolo se puede testear
// con un stream en memoria, sin puerto serie real (ni este sandbox ni
// Windows sin la Pi tienen /dev/ttyUSB0). El puerto real se abre en
// esp32Serial.ts.

import type { Duplex } from "node:stream";
import readline from "node:readline";

/**
 * Los diez botones del panel + CANCELAR — ver backend-server/README,
 * "Cableado ESP32–Pi": Incendio/Sismo/Médico/Tóxico/OK en la primera
 * fila, PROG1–4/Cancelar en la segunda.
 */
export type BotonFisico =
  | "INCENDIO"
  | "SISMO"
  | "MEDICO"
  | "TOXICO"
  | "PROG1"
  | "PROG2"
  | "PROG3"
  | "PROG4"
  | "OK"
  | "CANCELAR";

export const BOTONES: readonly BotonFisico[] = [
  "INCENDIO",
  "SISMO",
  "MEDICO",
  "TOXICO",
  "PROG1",
  "PROG2",
  "PROG3",
  "PROG4",
  "OK",
  "CANCELAR",
];

/** Los ocho botones que tienen lámpara propia (ver tabla de conexionado) — OK y CANCELAR no. */
export const BOTONES_CON_LAMPARA: readonly BotonFisico[] = [
  "INCENDIO",
  "SISMO",
  "MEDICO",
  "TOXICO",
  "PROG1",
  "PROG2",
  "PROG3",
  "PROG4",
];

export type EstadoLlave = "bloqueado" | "habilitado";

export type EventoEsp32 =
  | { tipo: "boton"; tecla: BotonFisico }
  | { tipo: "llave"; estado: EstadoLlave }
  | { tipo: "heartbeat"; ok: boolean };

export interface ClienteEsp32 {
  onEvento(callback: (evento: EventoEsp32) => void): void;
  /** "fijo"/apagado — nunca "parpadeo": eso lo decide el ESP32 solo apenas detecta el botón (ver cableado). */
  fijarLampara(boton: BotonFisico, encendida: boolean): void;
  fijarRele(activo: boolean): void;
}

/**
 * Parsea una línea cruda del ESP32. Devuelve null ante cualquier línea
 * corrupta o no reconocida — un firmware embebido en UART puede mandar
 * basura ocasional (ruido, línea partida a mitad de un reset); ignorarla
 * es más seguro que tirar abajo el proceso por eso.
 */
export function parsearLineaEsp32(linea: string): EventoEsp32 | null {
  let json: unknown;
  try {
    json = JSON.parse(linea);
  } catch {
    return null;
  }
  if (typeof json !== "object" || json === null) return null;
  const obj = json as Record<string, unknown>;

  if (obj.evt === "boton" && typeof obj.tecla === "string" && (BOTONES as string[]).includes(obj.tecla)) {
    return { tipo: "boton", tecla: obj.tecla as BotonFisico };
  }
  if (obj.evt === "llave" && (obj.estado === "bloqueado" || obj.estado === "habilitado")) {
    return { tipo: "llave", estado: obj.estado };
  }
  if (obj.evt === "heartbeat" && typeof obj.ok === "boolean") {
    return { tipo: "heartbeat", ok: obj.ok };
  }
  return null;
}

export function crearClienteEsp32(transporte: Duplex): ClienteEsp32 {
  const callbacks: Array<(evento: EventoEsp32) => void> = [];
  const rl = readline.createInterface({ input: transporte });
  rl.on("line", (linea) => {
    const evento = parsearLineaEsp32(linea);
    if (evento) callbacks.forEach((cb) => cb(evento));
  });

  function enviar(mensaje: unknown): void {
    transporte.write(JSON.stringify(mensaje) + "\n");
  }

  return {
    onEvento(callback) {
      callbacks.push(callback);
    },
    fijarLampara(boton, encendida) {
      enviar({ cmd: "lampara", boton, estado: encendida ? "fijo" : "apagado" });
    },
    fijarRele(activo) {
      enviar({ cmd: "rele", estado: activo ? "on" : "off" });
    },
  };
}
