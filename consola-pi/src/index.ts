// Punto de entrada de la consola. Conecta a MQTT con el contrato real,
// cachea padrón (SQLite)/próximo simulacro, reacciona a evento-activo
// activando/desactivando el relé, maneja el ciclo completo
// llave→PIN→botón→cuenta regresiva→envío a través de la máquina de
// estados pura de logic/panel.ts, y sirve la pantalla táctil (lib/pantalla.ts,
// HTML adaptado del wireframe de Cowork) con el estado en vivo por SSE.

import "dotenv/config";
import { conectar, suscribirSaliente, restoDeTopico, publicarEstado, publicarHeartbeat, publicarEvento, publicarAuth } from "./lib/mqtt.js";
import { crearClienteEsp32, type ClienteEsp32, BOTONES_CON_LAMPARA } from "./lib/esp32.js";
import { abrirPuertoEsp32 } from "./lib/esp32Serial.js";
import { ClienteEsp32Simulado } from "./lib/esp32Simulado.js";
import { PadronCache } from "./lib/padronCache.js";
import { crearServidorPantalla, type EstadoParaPantalla } from "./lib/pantalla.js";
import { validarPin } from "./logic/pin.js";
import { reducirPanel, type EstadoPanel, type EntradaPanel, type BotonAlarma } from "./logic/panel.js";
import type {
  PayloadPadronMqtt,
  PayloadSimulacroMqtt,
  PayloadEventoActivoMqtt,
  PayloadAccountabilityMqtt,
  PayloadHeartbeatMqtt,
  PayloadEventoMqtt,
} from "./types.js";

const CONSOLA_ID = process.env.CONSOLA_ID;
if (!CONSOLA_ID) throw new Error("falta CONSOLA_ID en .env");

const FIRMWARE_VERSION = "0.3.0-dev";
const INTERVALO_HEARTBEAT_MS = 30_000;
// Ventana para cancelar antes de que un botón de alarma se envíe de
// verdad — ver README, "Decisión pendiente: tiempo de cuenta regresiva"
// (la Especificación menciona la cuenta regresiva cancelable pero no fija
// un número; 5s es el valor usado en el wireframe de pantalla, se toma
// como punto de partida razonable hasta que se confirme con el cliente).
const CUENTA_REGRESIVA_MS = 5_000;
const PUERTO_PANTALLA = Number(process.env.PUERTO_PANTALLA ?? 8080);

// Selección de driver real vs. simulado por variable de entorno — ver
// README "Cómo correr esto". EN_PI=1 es explícito a propósito (nunca por
// defecto): correr en la Pi real sin haberlo puesto sería intentar abrir
// un puerto serie real que no existe en una laptop de desarrollo.
const enPi = process.env.EN_PI === "1";
const esp32: ClienteEsp32 = enPi
  ? crearClienteEsp32(abrirPuertoEsp32(process.env.ESP32_PUERTO ?? "/dev/serial0", Number(process.env.ESP32_BAUD ?? 115200)))
  : new ClienteEsp32Simulado();

const padronCache = new PadronCache(process.env.PADRON_DB_PATH ?? "./padron.db");

// Estado en memoria que además se le empuja a la pantalla por SSE.
// simulacro/evento-activo/accountability se repueblan solos al reconectar
// porque los dos primeros son retained; el padrón vive en SQLite (ver
// PadronCache) porque tiene que sobrevivir a un restart sin red.
let simulacroCache: PayloadSimulacroMqtt | null = null;
let eventoActivoCache: PayloadEventoActivoMqtt | null = null;
let accountabilityCache: PayloadAccountabilityMqtt | null = null;
let releActivo = false;
let esp32HeartbeatOk = false;
let panelState: EstadoPanel = { fase: "bloqueado" };
let temporizadorCuentaRegresiva: NodeJS.Timeout | null = null;
let cuentaRegresivaFinTs: number | null = null;

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
  void manejarMensajeMqtt(resto, rawPayload.toString()).catch((err) => {
    console.error(`[consola] error procesando ${topic}:`, err);
  });
});

async function manejarMensajeMqtt(resto: string, raw: string): Promise<void> {
  if (resto === "padron") {
    const payload = JSON.parse(raw) as PayloadPadronMqtt;
    padronCache.reemplazar(payload.operadores);
    console.log(`[padron] actualizado — ${payload.operadores.length} operador(es) habilitados`);
    pantalla.notificar();
    return;
  }

  if (resto === "simulacro") {
    simulacroCache = raw === "null" ? null : (JSON.parse(raw) as PayloadSimulacroMqtt);
    console.log("[simulacro] próximo programado:", simulacroCache ?? "ninguno");
    pantalla.notificar();
    return;
  }

  if (resto === "evento-activo") {
    eventoActivoCache = raw === "null" ? null : (JSON.parse(raw) as PayloadEventoActivoMqtt);
    if (!eventoActivoCache) {
      releActivo = false;
      esp32.fijarRele(false);
      // Reset de las lámparas de alarma al cerrar el evento — así la
      // lámpara steady de "esto es lo que se disparó" no queda encendida
      // después de que el backend confirma el cierre.
      for (const boton of BOTONES_CON_LAMPARA) esp32.fijarLampara(boton, false);
      console.log("[evento-activo] ninguno — pantalla vuelve a estado normal");
      pantalla.notificar();
      return;
    }
    console.log(
      `[evento-activo] ${eventoActivoCache.tipo} (${eventoActivoCache.modo}) — ${eventoActivoCache.relacion}` +
        (eventoActivoCache.escenario ? ` — escenario: "${eventoActivoCache.escenario}"` : "")
    );
    // TODO (ver README, "Decisión pendiente: relé local inmediato o
    // esperar al backend"): hoy el relé solo se activa cuando llega la
    // confirmación de evento-activo del backend, no apenas se envía el
    // propio disparo.
    releActivo = eventoActivoCache.activarRele;
    esp32.fijarRele(releActivo);
    pantalla.notificar();
    return;
  }

  if (resto.startsWith("accountability/")) {
    accountabilityCache = JSON.parse(raw) as PayloadAccountabilityMqtt;
    console.log(
      `[accountability] evento ${accountabilityCache.eventoId}: ${accountabilityCache.ok} ok / ${accountabilityCache.ayuda} ayuda / ${accountabilityCache.pendiente} pendiente (de ${accountabilityCache.notificados})`
    );
    pantalla.notificar();
    return;
  }
}

// --- Máquina de estados del panel (ver logic/panel.ts) ---

function dispatch(entrada: EntradaPanel): void {
  const anterior = panelState;
  const resultado = reducirPanel(anterior, entrada);
  panelState = resultado.estado;

  for (const efecto of resultado.efectos) {
    switch (efecto.tipo) {
      case "publicar_auth":
        publicarAuth(client, CONSOLA_ID as string, {
          operadorId: efecto.operador?.operadorId ?? null,
          legajo: efecto.operador?.legajo ?? null,
          resultado: efecto.resultado,
          ts: Date.now(),
        });
        break;

      case "iniciar_cuenta_regresiva":
        cuentaRegresivaFinTs = Date.now() + CUENTA_REGRESIVA_MS;
        console.log(`[panel] cuenta regresiva iniciada (${CUENTA_REGRESIVA_MS / 1000}s) — CANCELAR para abortar`);
        temporizadorCuentaRegresiva = setTimeout(() => dispatch({ tipo: "cuenta_regresiva_terminada" }), CUENTA_REGRESIVA_MS);
        break;

      case "cancelar_cuenta_regresiva":
        if (temporizadorCuentaRegresiva) {
          clearTimeout(temporizadorCuentaRegresiva);
          temporizadorCuentaRegresiva = null;
        }
        cuentaRegresivaFinTs = null;
        if (anterior.fase === "confirmando") esp32.fijarLampara(anterior.boton, false);
        console.log("[panel] cuenta regresiva cancelada — 100% local, no se publicó nada");
        break;

      case "publicar_evento":
        cuentaRegresivaFinTs = null;
        publicarDisparo(efecto.boton, efecto.operador);
        esp32.fijarLampara(efecto.boton, true);
        break;
    }
  }
  pantalla.notificar();
}

/** PROG1–4 sin asignar todavía (eso es config de pantalla táctil, ver README) — se manda el nombre literal del botón. */
function tipoEventoDeBoton(boton: BotonAlarma): string {
  return boton;
}

function publicarDisparo(boton: BotonAlarma, operador: { operadorId: string; rol: "operador" | "admin" }): void {
  const payload: PayloadEventoMqtt = {
    eventoId: crypto.randomUUID(),
    tipo: tipoEventoDeBoton(boton),
    estado: "DISPARADO",
    notificacionEnviada: true,
    origen: "consola",
    consolaId: CONSOLA_ID as string,
    operadorId: operador.operadorId,
    operadorRol: operador.rol,
    modo: (process.env.MODO_EVENTO === "SIMULACRO" ? "SIMULACRO" : "REAL") as "REAL" | "SIMULACRO",
    simulacroProgramadoId: null,
    ts: Date.now(),
  };
  publicarEvento(client, CONSOLA_ID as string, payload);
  console.log(`[panel] DISPARADO publicado: ${payload.tipo} (${payload.modo}), operador ${operador.operadorId}`);
}

esp32.onEvento((evento) => {
  if (evento.tipo === "heartbeat") {
    esp32HeartbeatOk = evento.ok;
    pantalla.notificar();
    return;
  }
  if (evento.tipo === "llave") {
    console.log(`[esp32] llave → ${evento.estado}`);
    dispatch({ tipo: evento.estado === "habilitado" ? "llave_habilitada" : "llave_bloqueada" });
    return;
  }
  if (evento.tipo === "boton") {
    console.log(`[esp32] botón "${evento.tecla}" presionado`);
    dispatch({ tipo: "boton_presionado", boton: evento.tecla });
    return;
  }
});

// --- Pantalla táctil (ver lib/pantalla.ts) ---

function estadoParaPantalla(): EstadoParaPantalla {
  return {
    panel: panelState,
    modo: (process.env.MODO_EVENTO === "SIMULACRO" ? "SIMULACRO" : "REAL") as "REAL" | "SIMULACRO",
    releActivo,
    padronCount: padronCache.obtenerTodos().length,
    eventoActivo: eventoActivoCache,
    accountability: accountabilityCache,
    simulacro: simulacroCache,
    esp32HeartbeatOk,
    cuentaRegresivaFinTs,
  };
}

const pantalla = crearServidorPantalla({
  obtenerEstado: estadoParaPantalla,
  onPin: async (pin) => {
    const resultado = await validarPin(pin, padronCache.obtenerTodos());
    if (resultado.resultado === "valido" && resultado.operadorId && resultado.rol) {
      dispatch({
        tipo: "pin_valido",
        operador: { operadorId: resultado.operadorId, legajo: resultado.legajo, rol: resultado.rol },
      });
      return { resultado: "valido" };
    }
    dispatch({ tipo: "pin_invalido" });
    return { resultado: "invalido" };
  },
  onCancelar: () => dispatch({ tipo: "boton_presionado", boton: "CANCELAR" }),
});
pantalla.server.listen(PUERTO_PANTALLA, () => {
  console.log(`[pantalla] escuchando en :${PUERTO_PANTALLA}`);
});

// --- Heartbeat periódico ---

function enviarHeartbeat(): void {
  const payload: PayloadHeartbeatMqtt = {
    bateria: null,
    caminoRed: null,
    esp32HeartbeatOk,
    firmwareVersion: FIRMWARE_VERSION,
    ts: Date.now(),
  };
  publicarHeartbeat(client, CONSOLA_ID as string, payload);
}
// Un solo setInterval para toda la vida del proceso — client.publish de
// la librería mqtt bufferea mientras está desconectado y reenvía al
// reconectar, así que no hace falta reiniciar nada en cada reconexión.
enviarHeartbeat();
setInterval(enviarHeartbeat, INTERVALO_HEARTBEAT_MS);

process.on("SIGINT", () => {
  padronCache.cerrar();
  process.exit(0);
});
