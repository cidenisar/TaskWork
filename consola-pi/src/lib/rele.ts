// Salida de relé/sirena — ver backend-server/README, "Simulacro sorpresa,
// escenario y relé/sirena": el contrato del lado backend ya está firme
// (`PayloadEventoActivoMqtt.activarRele`), lo que faltaba era el lado
// físico. Detrás de una interfaz para que el resto del código (qué hacer
// cuando llega un evento-activo) nunca sepa ni le importe si corre en la
// Pi real o en la laptop de quien está desarrollando sin hardware
// todavía — mismo motivo por el que esto se decidió abstraer así en vez
// de llamar a GPIO directo desde la lógica de eventos.

export interface ReleDriver {
  activar(): Promise<void>;
  desactivar(): Promise<void>;
}

/**
 * Para desarrollo sin hardware (Windows, WSL2, este sandbox, CI). Loguea
 * el cambio de estado — es lo único que hace falta para probar el resto
 * del flujo (MQTT → decidir activar el relé) sin la Pi física.
 */
export class ReleSimulado implements ReleDriver {
  private activo = false;

  async activar(): Promise<void> {
    if (this.activo) return;
    this.activo = true;
    console.log("[rele] 🔴 ACTIVADO (simulado — sin hardware real)");
  }

  async desactivar(): Promise<void> {
    if (!this.activo) return;
    this.activo = false;
    console.log("[rele] ⚪ desactivado (simulado)");
  }

  /** Solo para tests/inspección local — no es parte de ReleDriver. */
  estaActivo(): boolean {
    return this.activo;
  }
}

/**
 * Implementación real — GPIO de la Raspberry Pi, vía `onoff`. A propósito
 * NO está en package.json `dependencies` (necesita compilar bindings
 * nativos, no tiene sentido pedírselo a quien desarrolla en Windows sin la
 * Pi) — el import es dinámico y solo se ejecuta si de verdad se
 * instancia esta clase (ver index.ts, se elige por variable de entorno).
 * Sin validar contra hardware real todavía — no hay una Pi en este
 * entorno de desarrollo, ver README "Qué NO está validado".
 */
export class ReleGpioReal implements ReleDriver {
  private gpio: unknown = null;

  constructor(private readonly pin: number) {}

  private async obtenerGpio(): Promise<{ writeSync: (valor: 0 | 1) => void }> {
    if (!this.gpio) {
      const { Gpio } = await import("onoff");
      this.gpio = new Gpio(this.pin, "out");
    }
    return this.gpio as { writeSync: (valor: 0 | 1) => void };
  }

  async activar(): Promise<void> {
    const gpio = await this.obtenerGpio();
    gpio.writeSync(1);
  }

  async desactivar(): Promise<void> {
    const gpio = await this.obtenerGpio();
    gpio.writeSync(0);
  }
}
