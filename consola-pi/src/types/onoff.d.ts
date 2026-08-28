// Declaración mínima ambiente para `onoff` — a propósito el paquete NO
// está instalado acá (ver lib/rele.ts, lib/botonera.ts: solo hace falta
// en la Pi real, se importa dinámicamente). Esto es solo lo que este
// proyecto usa de su API, no la librería completa — si hace falta más,
// ampliar acá.
declare module "onoff" {
  export class Gpio {
    constructor(
      gpio: number,
      direction: "in" | "out",
      edge?: "none" | "rising" | "falling" | "both",
      options?: { debounceTimeout?: number }
    );
    writeSync(value: 0 | 1): void;
    readSync(): 0 | 1;
    watch(callback: (err: Error | null, value: number) => void): void;
    unwatch(): void;
    unexport(): void;
  }
}
