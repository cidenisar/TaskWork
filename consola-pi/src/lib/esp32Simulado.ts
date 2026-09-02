// Para desarrollar sin la Pi/ESP32 físicos (Windows, WSL2, este sandbox,
// CI) — implementa el mismo `ClienteEsp32` que esp32.ts, pero los botones
// se disparan por teclado y las lámparas/relé se loguean por consola en
// vez de tocar hardware. Solo funciona en una TTY real; sin eso avisa y
// queda sin recibir nada (mismo criterio que el resto de este proyecto:
// avisar, no fallar en silencio).
//
// El PIN NO se pide acá — eso lo maneja la pantalla táctil real
// (lib/pantalla.ts, `POST /pin`), igual en modo simulado que en la Pi
// real: abrir http://localhost:PUERTO en un navegador y tipear el PIN
// ahí, no por teclado de la terminal (versión anterior de este archivo lo
// hacía así, antes de que existiera la pantalla).

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

export class ClienteEsp32Simulado implements ClienteEsp32 {
  private readonly callbacks: Array<(evento: EventoEsp32) => void> = [];
  private llave: "bloqueado" | "habilitado" = "bloqueado";

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
        "k=girar llave (bloqueado↔habilitado). El PIN se tipea en la pantalla (navegador). Ctrl+C sale."
    );
    process.stdin.on("data", (tecla: string) => {
      if (tecla === CTRL_C) process.exit(0);
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
}
