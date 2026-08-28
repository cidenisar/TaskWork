// Máquina de estados del panel — pura, sin I/O ni timers reales (ver
// index.ts para eso). Codifica los invariantes de la Especificación del
// Sistema de Emergencias tal cual, no una interpretación:
//
// - Invariante 1: solo un botón físico dispara una emergencia real — acá
//   solo `publicar_evento` como efecto de haber pasado por la cuenta
//   regresiva completa, nunca desde la pantalla.
// - Invariante 3: OK y CANCELAR son mecanismos distintos. CANCELAR solo
//   actúa durante `confirmando` (la cuenta regresiva) y es 100% local —
//   nunca produce un efecto que toque MQTT. OK sí es un botón de alarma
//   más (pasa por la misma cuenta regresiva) porque es un evento real.
// - Invariante 5: el PIN es la única autoridad para habilitar el panel —
//   un botón presionado en `bloqueado` o `pidiendo_pin` no hace nada.

import type { BotonFisico } from "../lib/esp32.js";

export interface OperadorIdentificado {
  operadorId: string;
  legajo: string | null;
  rol: "operador" | "admin";
}

/** Los botones que de verdad pueden terminar en un evento — todos menos CANCELAR. */
export type BotonAlarma = Exclude<BotonFisico, "CANCELAR">;

export type EstadoPanel =
  | { fase: "bloqueado" }
  | { fase: "pidiendo_pin" }
  | { fase: "habilitado"; operador: OperadorIdentificado }
  | { fase: "confirmando"; operador: OperadorIdentificado; boton: BotonAlarma }
  | { fase: "enviado"; operador: OperadorIdentificado; boton: BotonAlarma };

export type EntradaPanel =
  | { tipo: "llave_habilitada" }
  | { tipo: "llave_bloqueada" }
  | { tipo: "pin_valido"; operador: OperadorIdentificado }
  | { tipo: "pin_invalido" }
  | { tipo: "boton_presionado"; boton: BotonFisico }
  | { tipo: "cuenta_regresiva_terminada" }
  | { tipo: "volver_a_reposo" };

export type EfectoPanel =
  | { tipo: "publicar_evento"; boton: BotonAlarma; operador: OperadorIdentificado }
  | { tipo: "publicar_auth"; resultado: "valido" | "invalido"; operador: OperadorIdentificado | null }
  | { tipo: "iniciar_cuenta_regresiva" }
  | { tipo: "cancelar_cuenta_regresiva" };

export interface ResultadoPanel {
  estado: EstadoPanel;
  efectos: EfectoPanel[];
}

function sinCambios(estado: EstadoPanel): ResultadoPanel {
  return { estado, efectos: [] };
}

export function reducirPanel(estado: EstadoPanel, entrada: EntradaPanel): ResultadoPanel {
  // La llave manda por encima de cualquier fase — girarla a bloqueado
  // corta lo que estuviera pasando, incluida una cuenta regresiva en
  // curso (mismo criterio de "el panel bloqueado no hace nada" aplicado
  // también a mitad de camino, no solo al arrancar).
  if (entrada.tipo === "llave_bloqueada") {
    const efectos: EfectoPanel[] = estado.fase === "confirmando" ? [{ tipo: "cancelar_cuenta_regresiva" }] : [];
    return { estado: { fase: "bloqueado" }, efectos };
  }

  switch (estado.fase) {
    case "bloqueado":
      if (entrada.tipo === "llave_habilitada") {
        return sinCambios({ fase: "pidiendo_pin" });
      }
      return sinCambios(estado); // ignora botones y PIN sin llave — invariante 5

    case "pidiendo_pin":
      if (entrada.tipo === "pin_valido") {
        return {
          estado: { fase: "habilitado", operador: entrada.operador },
          efectos: [{ tipo: "publicar_auth", resultado: "valido", operador: entrada.operador }],
        };
      }
      if (entrada.tipo === "pin_invalido") {
        return {
          estado: { fase: "pidiendo_pin" },
          efectos: [{ tipo: "publicar_auth", resultado: "invalido", operador: null }],
        };
      }
      return sinCambios(estado);

    case "habilitado":
      if (entrada.tipo === "boton_presionado" && entrada.boton !== "CANCELAR") {
        return {
          estado: { fase: "confirmando", operador: estado.operador, boton: entrada.boton },
          efectos: [{ tipo: "iniciar_cuenta_regresiva" }],
        };
      }
      return sinCambios(estado);

    case "confirmando":
      if (entrada.tipo === "boton_presionado" && entrada.boton === "CANCELAR") {
        // Invariante 3 — 100% local, ningún efecto toca MQTT.
        return {
          estado: { fase: "habilitado", operador: estado.operador },
          efectos: [{ tipo: "cancelar_cuenta_regresiva" }],
        };
      }
      if (entrada.tipo === "cuenta_regresiva_terminada") {
        return {
          estado: { fase: "enviado", operador: estado.operador, boton: estado.boton },
          efectos: [{ tipo: "publicar_evento", boton: estado.boton, operador: estado.operador }],
        };
      }
      return sinCambios(estado);

    case "enviado":
      if (entrada.tipo === "volver_a_reposo") {
        return sinCambios({ fase: "habilitado", operador: estado.operador });
      }
      return sinCambios(estado);
  }
}
