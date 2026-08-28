// Punto de entrada de la consola. Estado de esta primera versión: conecta
// a MQTT con el contrato real, cachea padrón/próximo simulacro, reacciona
// a evento-activo activando/desactivando el relé, y detecta presiones de
// la botonera — pero TODAVÍA NO dispara un evento al presionar
// "disparado" (ver README, "Qué falta — decisión pendiente": si el botón
// físico necesita PIN antes de publicar, o es un pulsador de pánico sin
// autenticación). No hay pantalla táctil todavía — lo que mostraría se
// loguea por consola como aproximación.

import "dotenv/config";
import {
  conectar,
  suscribirSaliente,
  restoDeTopico,
  publicarEstado,
  publicarHeartbeat,
  publicarAuth,
} from "./lib/mqtt.js";
import { ReleSimulado, ReleGpioReal, type ReleDriver } from "./lib/rele.js";
import { BotoneraSimulada, BotoneraGpioReal, type BotoneraDriver } from "./lib/botonera.js";
import { validarPin } from "./logic/pin.js";
import type {
  PayloadPadronMqtt,
  PayloadSimulacroMqtt,
  PayloadEventoActivoMqtt,
  PayloadAccountabilityMqtt,
  PayloadHeartbeatMqtt,
  OperadorPadron,
} from "./types.js";

const CONSOLA_ID = process.env.CONSOLA_ID;
if (!CONSOLA_ID) throw new Error("falta CONSOLA_ID en .env");

const FIRMWARE_VERSION = "0.1.0-dev";
const INTERVALO_HEARTBEAT_MS = 30_000;

// Selección de driver real vs. simulado por variable de entorno — ver
// README "Cómo correr esto". EN_PI=1 es explícito a propósito (nunca por
// defecto): correr en la Pi real sin haberlo puesto sería instanciar
// GPIO real sin querer.
const enPi = process.env.EN_PI === "1";
const rele: ReleDriver = enPi ? new ReleGpioReal(Number(process.env.RELE_PIN ?? 17)) : new ReleSimulado();
const botonera: BotoneraDriver = enPi
  ? new BotoneraGpioReal({
      disparado: Number(process.env.PIN_BOTON_DISPARADO ?? 27),
      ok: Number(process.env.PIN_BOTON_OK ?? 22),
      cancelar: Number(process.env.PIN_BOTON_CANCELAR ?? 23),
    })
  : new BotoneraSimulada();

// Estado en memoria — lo que hoy sería "lo último que se le mostraría a
// la pantalla táctil". Se repuebla solo al reconectar porque
// padron/simulacro/evento-activo son retained.
let padronCache: OperadorPadron[] = [];
let simulacroCache: PayloadSimulacroMqtt | null = null;
let eventoActivoCache: PayloadEventoActivoMqtt | null = null;

const client = conectar();

client.on("connect", () => {
  console.log(`[mqtt] conectado como ${CONSOLA_ID}`);
  suscribirSaliente(client, CONSOLA_ID);
  publicarEstado(client, CONSOLA_ID, "online");
});

client.on("reconnect", () => console.log("[mqtt] reconectando…"));
client.on("error", (err) => console.error("[mqtt] error:", err.message));

client.on("message", (topic, rawPayload) => {
  const resto = restoDeTopico(topic, CONSOLA_ID);
  if (!resto) return;
  void manejarMensaje(resto, rawPayload.toString()).catch((err) => {
    console.error(`[consola] error procesando ${topic}:`, err);
  });
});

async function manejarMensaje(resto: string, raw: string): Promise<void> {
  if (resto === "padron") {
    const payload = JSON.parse(raw) as PayloadPadronMqtt;
    padronCache = payload.operadores;
    console.log(`[padron] actualizado — ${padronCache.length} operador(es) habilitados`);
    return;
  }

  if (resto === "simulacro") {
    simulacroCache = raw === "null" ? null : (JSON.parse(raw) as PayloadSimulacroMqtt);
    console.log("[simulacro] próximo programado:", simulacroCache ?? "ninguno");
    return;
  }

  if (resto === "evento-activo") {
    eventoActivoCache = raw === "null" ? null : (JSON.parse(raw) as PayloadEventoActivoMqtt);
    if (!eventoActivoCache) {
      await rele.desactivar();
      console.log("[evento-activo] ninguno — pantalla volvería a estado normal");
      return;
    }
    console.log(
      `[evento-activo] ${eventoActivoCache.tipo} (${eventoActivoCache.modo}) — ${eventoActivoCache.relacion}` +
        (eventoActivoCache.escenario ? ` — escenario: "${eventoActivoCache.escenario}"` : "")
    );
    if (eventoActivoCache.activarRele) await rele.activar();
    else await rele.desactivar();
    return;
  }

  if (resto.startsWith("accountability/")) {
    const payload = JSON.parse(raw) as PayloadAccountabilityMqtt;
    console.log(
      `[accountability] evento ${payload.eventoId}: ${payload.ok} ok / ${payload.ayuda} ayuda / ${payload.pendiente} pendiente (de ${payload.notificados})`
    );
    return;
  }
}

// Botonera — pide PIN, lo valida contra el padrón cacheado (mismo
// bcrypt.compare que usaría la pantalla táctil) y publica SIEMPRE la
// auditoría en `auth` (válido o no) — eso no depende de ninguna decisión
// pendiente, es la auditoría de todo intento de PIN. Lo que todavía NO
// hace: publicar el propio evento DISPARADO — necesita saber el TIPO
// (Incendio/Sismo/Médico/Tóxico), y eso hoy solo lo elegiría la pantalla
// táctil (todavía sin construir) — ver README "Qué falta".
botonera.onPresion((boton) => {
  console.log(`[botonera] botón "${boton}" presionado`);
  if (boton !== "disparado") return;
  void manejarBotonDisparado();
});

async function manejarBotonDisparado(): Promise<void> {
  if (!(botonera instanceof BotoneraSimulada)) {
    console.log("[botonera] TODO: entrada de PIN por pantalla táctil todavía no implementada.");
    return;
  }
  const pin = await botonera.leerPin();
  const resultado = await validarPin(pin, padronCache);
  publicarAuth(client, CONSOLA_ID as string, {
    operadorId: resultado.operadorId,
    legajo: resultado.legajo,
    resultado: resultado.resultado,
    ts: Date.now(),
  });
  if (resultado.resultado === "invalido") {
    console.log("[botonera] PIN inválido — auditado, no se dispara nada.");
    return;
  }
  console.log(
    `[botonera] PIN válido (legajo ${resultado.legajo}, rol ${resultado.rol}) — ` +
      "TODO: falta elegir el TIPO de evento (pantalla táctil) para poder publicar el DISPARADO."
  );
}

// Heartbeat periódico — payload real, valores de batería/red en null
// porque esta primera versión no lee ningún sensor todavía (ver README).
function enviarHeartbeat(): void {
  const payload: PayloadHeartbeatMqtt = {
    bateria: null,
    caminoRed: null,
    esp32HeartbeatOk: true,
    firmwareVersion: FIRMWARE_VERSION,
    ts: Date.now(),
  };
  publicarHeartbeat(client, CONSOLA_ID as string, payload);
}
// Un solo setInterval para toda la vida del proceso (no uno por cada
// reconexión) — `client.publish` de la librería mqtt bufferea mientras
// está desconectado y reenvía al reconectar, así que no hace falta
// reiniciar nada acá.
enviarHeartbeat();
setInterval(enviarHeartbeat, INTERVALO_HEARTBEAT_MS);
