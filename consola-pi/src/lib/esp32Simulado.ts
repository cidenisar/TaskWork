// Para desarrollar sin la Pi/ESP32 físicos (Windows, WSL2, este sandbox,
// CI) — implementa el mismo `ClienteEsp32` que esp32.ts, pero los botones
// se disparan por teclado y las lámparas/relé se loguean por consola en
// vez de tocar hardware. Solo funciona en una TTY real; sin eso avisa y
// queda sin recibir nada (mismo criterio que el resto de este proyecto:
// avisar, no fallar en silencio).
//
// También expone `leerPin()` — no es parte de `ClienteEsp32` (la Pi real
// nunca la llama, ahí el PIN se tipea en el teclado numérico de la
// pantalla táctil, que todavía no existe) — index.ts la usa solo cuando
// `esp32 instanceof ClienteEsp32Simulado`, para poder probar el flujo
// completo sin pantalla.

import type { BotonFisico, ClienteEsp32, EventoEsp32 } from "./esp32.js";

const MAPA_TECLAS: Record<string, BotonFisico> = {
  "1": "INCENDIO",
  "2": "SISMO",
  "3": "MEDICO",
  "4": "TOXICO",
  "5": "PROG1",
  "6": "PROG2",
  "7": "PROG3",
  "8": "PROG4",
  o: "OK",
  c: "CANCELAR",
};

const CTRL_C = "";
const BACKSPACE = "";

export class ClienteEsp32Simulado implements ClienteEsp32 {
  private readonly callbacks: Array<(evento: EventoEsp32) => void> = [];
  private llave: "bloqueado" | "habilitado" = "bloqueado";
  private leyendoPin = false;

  constructor() {
    if (!process.stdin.isTTY) {
      console.warn(
        "[esp32-simulado] sin TTY — no va a recibir nada por teclado. " +
          "Normal en un proceso en background/CI; correr `npm run dev` en una terminal interactiva para probarlo."
      );
      return;
    }
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    console.log(
      "[esp32-simulado] teclado — 1=INCENDIO 2=SISMO 3=MEDICO 4=TOXICO 5-8=PROG1-4 o=OK c=CANCELAR " +
        "k=girar llave (bloqueado↔habilitado). Ctrl+C sale."
    );
    process.stdin.on("data", (tecla: string) => {
      if (tecla === CTRL_C) process.exit(0);
      if (this.leyendoPin) return; // leerPin tiene su propio listener temporal
      if (tecla === "k") {
        this.llave = this.llave === "bloqueado" ? "habilitado" : "bloqueado";
        console.log(`[esp32-simulado] llave → ${this.llave}`);
        this.emitir({ tipo: "llave", estado: this.llave });
        return;
      }
      const boton = MAPA_TECLAS[tecla];
      if (boton) this.emitir({ tipo: "boton", tecla: boton });
    });
  }

  private emitir(evento: EventoEsp32): void {
    this.callbacks.forEach((cb) => cb(evento));
  }

  onEvento(callback: (evento: EventoEsp32) => void): void {
    this.callbacks.push(callback);
  }

  fijarLampara(boton: BotonFisico, encendida: boolean): void {
    console.log(`[esp32-simulado] lámpara ${boton}: ${encendida ? "🟡 fijo" : "⚪ apagada"}`);
  }

  fijarRele(activo: boolean): void {
    console.log(`[esp32-simulado] relé: ${activo ? "🔴 ACTIVADO" : "⚪ desactivado"}`);
  }

  /** Ver comentario de cabecera — solo para el flujo de desarrollo sin pantalla táctil. */
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
