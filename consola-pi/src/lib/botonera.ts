// Botonera física — los tres botones que disparan las acciones críticas
// (no dependen de que la pantalla táctil responda, a propósito: mismo
// criterio que un panel de incendio real). Misma idea de abstracción que
// rele.ts: la lógica de qué hacer al apretar un botón no sabe si viene de
// GPIO real o de una tecla simulada en el teclado de una laptop.

export type BotonFisico = "disparado" | "ok" | "cancelar";

export interface BotoneraDriver {
  onPresion(callback: (boton: BotonFisico) => void): void;
}

const CTRL_C = "";
const BACKSPACE = "";
const MAPA_TECLAS: Record<string, BotonFisico> = { d: "disparado", o: "ok", c: "cancelar" };

/**
 * Para desarrollo sin hardware: mapea teclas del teclado a los tres
 * botones (d/o/c) leyendo stdin en modo raw. Solo funciona en una TTY
 * real (no dentro de un pipe/redirect) — si no hay TTY, queda sin
 * arrancar y lo avisa por consola en vez de fallar en silencio.
 */
export class BotoneraSimulada implements BotoneraDriver {
  private callback: ((boton: BotonFisico) => void) | null = null;
  // Mientras se está leyendo un PIN (ver leerPin) las teclas NO se
  // interpretan como botones — si no, tipear el PIN "1234" dispararía
  // OK/CANCELAR/etc. por las teclas que coincidan con el mapa.
  private leyendoPin = false;

  constructor() {
    if (!process.stdin.isTTY) {
      console.warn(
        "[botonera] sin TTY — la botonera simulada por teclado no va a recibir nada. " +
          "Normal en un proceso en background/CI; corré `npm run dev` en una terminal interactiva para probarla."
      );
      return;
    }
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    console.log("[botonera] simulada por teclado — 'd' = DISPARADO, 'o' = OK, 'c' = CANCELAR, Ctrl+C sale.");
    process.stdin.on("data", (tecla: string) => {
      if (tecla === CTRL_C) process.exit(0);
      if (this.leyendoPin) return; // leerPin tiene su propio listener temporal
      const boton = MAPA_TECLAS[tecla];
      if (boton && this.callback) this.callback(boton);
    });
  }

  onPresion(callback: (boton: BotonFisico) => void): void {
    this.callback = callback;
  }

  /**
   * Solo para desarrollo sin pantalla táctil — pide el PIN por stdin en
   * vez de por un teclado numérico en pantalla. No es parte de
   * `BotoneraDriver`: la Pi real nunca la llama (ver index.ts, se usa solo
   * cuando `botonera instanceof BotoneraSimulada`).
   */
  async leerPin(): Promise<string> {
    if (!process.stdin.isTTY) return "";
    this.leyendoPin = true;
    process.stdout.write("PIN: ");
    return new Promise((resolve) => {
      let pin = "";
      const onData = (tecla: string) => {
        if (tecla === "\r" || tecla === "\n") {
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          this.leyendoPin = false;
          resolve(pin);
          return;
        }
        if (tecla === BACKSPACE) {
          pin = pin.slice(0, -1);
          return;
        }
        pin += tecla;
        process.stdout.write("*");
      };
      process.stdin.on("data", onData);
    });
  }
}

/**
 * Implementación real — GPIO de entrada por botón, vía `onoff` (mismo
 * motivo que ReleGpioReal para el import dinámico: no pedir el paquete
 * nativo fuera de la Pi real). Sin validar contra hardware real todavía.
 */
export class BotoneraGpioReal implements BotoneraDriver {
  constructor(private readonly pines: Record<BotonFisico, number>) {}

  onPresion(callback: (boton: BotonFisico) => void): void {
    void this.armar(callback);
  }

  private async armar(callback: (boton: BotonFisico) => void): Promise<void> {
    const { Gpio } = await import("onoff");
    for (const [boton, pin] of Object.entries(this.pines) as [BotonFisico, number][]) {
      const gpio = new Gpio(pin, "in", "rising", { debounceTimeout: 20 });
      gpio.watch((err) => {
        if (err) {
          console.error(`[botonera] error leyendo GPIO del botón ${boton}:`, err);
          return;
        }
        callback(boton);
      });
    }
  }
}
