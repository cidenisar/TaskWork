// Firmware de la "capa de seguridad" — botonera + llave + lámparas +
// relé de la sirena local. Ver esp32-firmware/README.md para el porqué
// de cada decisión y, sobre todo, para lo que NO está validado (nunca
// corrió en un ESP32 real — no hay uno en este entorno de desarrollo).
//
// Lo que hace, en orden de importancia (ver invariantes de la
// Especificación del Sistema de Emergencias):
//  1. Lee los 10 botones + la llave (debounce por software, sin
//     componentes extra salvo 4 resistencias de pull-up, ver pines.h) y
//     avisa a la Pi por UART — SOLO avisa; nunca decide por sí solo si
//     algo "se dispara de verdad" (esa decisión es de logic/panel.ts del
//     lado Pi, invariante 1).
//  2. Ante cualquier botón con lámpara, la prende parpadeando de
//     inmediato — feedback local de "se registró la pulsación", sigue
//     funcionando aunque la Pi esté caída o sin red (ese es el sentido
//     de que esto viva en un microcontrolador aparte). La Pi decide
//     después si queda fija (evento confirmado) o se apaga (cancelado).
//  3. Obedece los dos únicos comandos que manda la Pi: lámpara
//     fijo/apagado y relé on/off — nunca al revés, la Pi nunca le pide
//     al ESP32 que decida nada.
//  4. Manda su propio heartbeat cada HEARTBEAT_MS — la Pi lo usa para
//     saber si esta capa sigue viva (ver consola-pi/src/index.ts).

#include <Arduino.h>
#include "pines.h"
#include "protocolo.h"

// ---- Tiempos — valores de partida razonables, no confirmados con el
// cliente (mismo criterio que CUENTA_REGRESIVA_MS del lado Pi) ----
static const unsigned long DEBOUNCE_MS = 30;     // rebote típico de un pulsador mecánico
static const unsigned long BLINK_MS = 400;       // período de parpadeo "registrado, sin confirmar"
static const unsigned long HEARTBEAT_MS = 2000;  // ver README, "por qué 2s y no los 30s de la Pi"

// Relé: activo en ALTO por defecto — CONFIRMAR contra el módulo real
// (muchos módulos de relé de un canal son activos en BAJO). Si el tuyo
// lo es, poner esto en false.
static const bool RELE_ACTIVO_ALTO = true;

// ---- Entradas: los 10 botones, cada uno con su pin (ver pines.h) ----
struct EntradaBoton {
  Boton boton;
  uint8_t pin;
};
static const EntradaBoton ENTRADAS[] = {
    {Boton::INCENDIO, PIN_BOTON_INCENDIO}, {Boton::SISMO, PIN_BOTON_SISMO},
    {Boton::MEDICO, PIN_BOTON_MEDICO},     {Boton::TOXICO, PIN_BOTON_TOXICO},
    {Boton::PROG1, PIN_BOTON_PROG1},       {Boton::PROG2, PIN_BOTON_PROG2},
    {Boton::PROG3, PIN_BOTON_PROG3},       {Boton::PROG4, PIN_BOTON_PROG4},
    {Boton::OK, PIN_BOTON_OK},             {Boton::CANCELAR, PIN_BOTON_CANCELAR},
};
static const size_t CANTIDAD_ENTRADAS = sizeof(ENTRADAS) / sizeof(ENTRADAS[0]);

static bool sinPullupInterno(Boton b) {
  // PROG1-4 van por los 4 pines solo-entrada del ESP32 (34/35/36/39),
  // que no tienen pull-up interno — ver pines.h.
  return b == Boton::PROG1 || b == Boton::PROG2 || b == Boton::PROG3 || b == Boton::PROG4;
}

// Debounce por pin: nivel estable actual + candidato + desde cuándo el
// candidato se sostiene. Sin bloquear el loop (todo por millis()).
struct EstadoDebounce {
  int nivelEstable;
  int nivelCandidato;
  unsigned long desde;
};
static EstadoDebounce debounceEntradas[CANTIDAD_ENTRADAS];
static EstadoDebounce debounceLlave;

// LOW (contacto cerrado a GND) = habilitado — ver README, "sentido del
// selector de llave (a confirmar)": no hay forma de confirmar esto sin
// el ZB4 real en la mano.
static bool esLlaveHabilitada(int nivel) { return nivel == LOW; }

// ---- Lámparas — una por cada uno de los 8 botones que tienen ----
enum class EstadoLampara { APAGADA, PARPADEANDO, FIJA };
struct Lampara {
  Boton boton;
  uint8_t pin;
  bool habilitada;  // false solo para PROG4 en el build de depuración, ver pines.h
  EstadoLampara estado;
  bool nivelFisico;
  unsigned long ultimoToggle;
};
static Lampara lamparas[8] = {
    {Boton::INCENDIO, PIN_LAMPARA_INCENDIO, true, EstadoLampara::APAGADA, false, 0},
    {Boton::SISMO, PIN_LAMPARA_SISMO, true, EstadoLampara::APAGADA, false, 0},
    {Boton::MEDICO, PIN_LAMPARA_MEDICO, true, EstadoLampara::APAGADA, false, 0},
    {Boton::TOXICO, PIN_LAMPARA_TOXICO, true, EstadoLampara::APAGADA, false, 0},
    {Boton::PROG1, PIN_LAMPARA_PROG1, true, EstadoLampara::APAGADA, false, 0},
    {Boton::PROG2, PIN_LAMPARA_PROG2, true, EstadoLampara::APAGADA, false, 0},
    {Boton::PROG3, PIN_LAMPARA_PROG3, true, EstadoLampara::APAGADA, false, 0},
#ifndef LAMPARA_PROG4_DESHABILITADA
    {Boton::PROG4, PIN_LAMPARA_PROG4, true, EstadoLampara::APAGADA, false, 0},
#else
    {Boton::PROG4, 0, false, EstadoLampara::APAGADA, false, 0},
#endif
};

static Lampara *lamparaDe(Boton b) {
  for (auto &l : lamparas)
    if (l.boton == b) return &l;
  return nullptr;
}

static void escribirLampara(Lampara &l, bool encendida) {
  l.nivelFisico = encendida;
  digitalWrite(l.pin, encendida ? HIGH : LOW);  // ULN2803A: activo en ALTO (ver esquema)
}

// Feedback local inmediato al detectar la pulsación — invariante de la
// Especificación: esto NO espera a la Pi ni a la red.
static void iniciarParpadeo(Lampara &l) {
  l.estado = EstadoLampara::PARPADEANDO;
  l.ultimoToggle = millis();
  escribirLampara(l, true);
}

// Único llamado desde un comando real de la Pi (ver aplicarComandoPi).
static void fijarLampara(Lampara &l, bool encender) {
  l.estado = encender ? EstadoLampara::FIJA : EstadoLampara::APAGADA;
  escribirLampara(l, encender);
}

static void actualizarLamparas(unsigned long ahora) {
  for (auto &l : lamparas) {
    if (!l.habilitada || l.estado != EstadoLampara::PARPADEANDO) continue;
    if (ahora - l.ultimoToggle >= BLINK_MS) {
      escribirLampara(l, !l.nivelFisico);
      l.ultimoToggle = ahora;
    }
  }
}

// ---- Relé de la sirena local ----
static void fijarRele(bool encender) {
#ifndef RELE_DESHABILITADO
  bool nivelAlto = RELE_ACTIVO_ALTO ? encender : !encender;
  digitalWrite(PIN_RELE, nivelAlto ? HIGH : LOW);
#else
  (void)encender;  // deshabilitado en build de depuración, ver pines.h
#endif
}

// ---- Comandos entrantes de la Pi (UART2) ----
static void aplicarComandoPi(const char *linea) {
  ComandoPi cmd = parsearComandoPi(linea);
  switch (cmd.tipo) {
    case TipoComando::LAMPARA: {
      Lampara *l = lamparaDe(cmd.boton);
      if (l && l->habilitada) fijarLampara(*l, cmd.encender);
      break;
    }
    case TipoComando::RELE:
      fijarRele(cmd.encender);
      break;
    case TipoComando::NINGUNO:
      break;  // línea corrupta o comando no reconocido — se ignora, no traba el firmware
  }
}

static void leerComandosPi() {
  static char buffer[96];
  static size_t longitud = 0;

  while (Serial2.available() > 0) {
    char c = (char)Serial2.read();
    if (c == '\n') {
      buffer[longitud] = '\0';
      if (longitud > 0) aplicarComandoPi(buffer);
      longitud = 0;
      continue;
    }
    if (c == '\r') continue;  // tolerar CRLF además de LF
    if (longitud < sizeof(buffer) - 1) buffer[longitud++] = c;
    // línea más larga que el buffer: el resto se descarta hasta el
    // próximo '\n' — una línea corrupta no debería trabar el firmware.
  }
}

void setup() {
#ifdef DEBUG_SERIAL
  Serial.begin(115200);
  Serial.println();
  Serial.println("[esp32-firmware] build de depuracion -- lampara PROG4 y rele deshabilitados (ver pines.h)");
#endif

  Serial2.begin(115200, SERIAL_8N1, PIN_UART_PI_RX, PIN_UART_PI_TX);

  for (size_t i = 0; i < CANTIDAD_ENTRADAS; i++) {
    pinMode(ENTRADAS[i].pin, sinPullupInterno(ENTRADAS[i].boton) ? INPUT : INPUT_PULLUP);
    int nivel = digitalRead(ENTRADAS[i].pin);
    debounceEntradas[i] = {nivel, nivel, millis()};
  }
  pinMode(PIN_LLAVE, INPUT_PULLUP);
  {
    int nivel = digitalRead(PIN_LLAVE);
    debounceLlave = {nivel, nivel, millis()};
  }

  for (auto &l : lamparas) {
    if (!l.habilitada) continue;
    pinMode(l.pin, OUTPUT);
    escribirLampara(l, false);  // estado seguro al arrancar
  }
#ifndef RELE_DESHABILITADO
  pinMode(PIN_RELE, OUTPUT);
#endif
  fijarRele(false);  // estado seguro al arrancar

  // La Pi no tiene forma de saber la posición real de la llave hasta el
  // primer evento — se lo decimos apenas arranca (invariante 5).
  emitirLlave(Serial2, esLlaveHabilitada(debounceLlave.nivelEstable));
}

void loop() {
  unsigned long ahora = millis();

  for (size_t i = 0; i < CANTIDAD_ENTRADAS; i++) {
    int nivel = digitalRead(ENTRADAS[i].pin);
    EstadoDebounce &d = debounceEntradas[i];
    if (nivel != d.nivelCandidato) {
      d.nivelCandidato = nivel;
      d.desde = ahora;
    } else if (nivel != d.nivelEstable && (ahora - d.desde) >= DEBOUNCE_MS) {
      d.nivelEstable = nivel;
      if (nivel == LOW) {  // flanco de presión — INPUT_PULLUP → GND, activo en bajo
        emitirBoton(Serial2, ENTRADAS[i].boton);
#ifdef DEBUG_SERIAL
        Serial.print("[boton] ");
        Serial.println(nombreDeBoton(ENTRADAS[i].boton));
#endif
        Lampara *l = lamparaDe(ENTRADAS[i].boton);
        if (l && l->habilitada) iniciarParpadeo(*l);
      }
      // el flanco de soltada (HIGH) no genera evento — la Especificación
      // no define un "boton_soltado", ver logic/panel.ts del lado Pi.
    }
  }

  {
    int nivel = digitalRead(PIN_LLAVE);
    EstadoDebounce &d = debounceLlave;
    if (nivel != d.nivelCandidato) {
      d.nivelCandidato = nivel;
      d.desde = ahora;
    } else if (nivel != d.nivelEstable && (ahora - d.desde) >= DEBOUNCE_MS) {
      d.nivelEstable = nivel;
      emitirLlave(Serial2, esLlaveHabilitada(nivel));
#ifdef DEBUG_SERIAL
      Serial.print("[llave] ");
      Serial.println(esLlaveHabilitada(nivel) ? "habilitado" : "bloqueado");
#endif
    }
  }

  actualizarLamparas(ahora);

  static unsigned long ultimoHeartbeat = 0;
  if (ahora - ultimoHeartbeat >= HEARTBEAT_MS) {
    ultimoHeartbeat = ahora;
    // "ok" siempre true hoy — no hay ningún self-test que lo pueda poner
    // en false todavía, ver README.
    emitirHeartbeat(Serial2, true);
  }

  leerComandosPi();
}
