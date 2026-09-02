// Protocolo UART ESP32↔Pi — implementa exactamente el formato ya
// diseñado y testeado del lado Pi (consola-pi/src/lib/esp32.ts:
// `parsearLineaEsp32`, `crearClienteEsp32`). JSON compacto, un objeto
// por línea (\n). Sin librerías de JSON (ArduinoJson u otra): los
// mensajes son de forma fija y chica, y este proyecto ya viene evitando
// frameworks para superficies chicas (mismo criterio que
// backend-server/lib/http.ts y consola-pi/lib/pantalla.ts) — acá pesa
// más todavía porque este entorno de desarrollo no tiene forma de bajar
// dependencias (sin internet, ver esp32-firmware/README.md) ni de
// compilar para confirmar que compaginan bien.
//
// Saliente (ESP32 → Pi):
//   {"evt":"boton","tecla":"INCENDIO"}
//   {"evt":"llave","estado":"habilitado"}
//   {"evt":"heartbeat","ok":true}
// Entrante (Pi → ESP32):
//   {"cmd":"lampara","boton":"INCENDIO","estado":"fijo"}
//   {"cmd":"rele","estado":"on"}

#pragma once
#include <Arduino.h>

enum class Boton {
  INCENDIO,
  SISMO,
  MEDICO,
  TOXICO,
  PROG1,
  PROG2,
  PROG3,
  PROG4,
  OK,
  CANCELAR,
  DESCONOCIDO,
};

// Los 8 con lámpara propia — ver tabla de conexionado del esquema (OK y
// CANCELAR no tienen). Mismo orden que `BOTONES_CON_LAMPARA` en
// consola-pi/src/lib/esp32.ts.
constexpr Boton BOTONES_CON_LAMPARA[8] = {
    Boton::INCENDIO, Boton::SISMO, Boton::MEDICO, Boton::TOXICO,
    Boton::PROG1,    Boton::PROG2, Boton::PROG3,  Boton::PROG4,
};

const char *nombreDeBoton(Boton b);
Boton botonDeNombre(const char *nombre);

// --- Saliente: arma la línea y la escribe en `out` (típicamente Serial2) ---
void emitirBoton(Stream &out, Boton b);
void emitirLlave(Stream &out, bool habilitada);
void emitirHeartbeat(Stream &out, bool ok);

// --- Entrante: un comando ya parseado ---
enum class TipoComando { NINGUNO, LAMPARA, RELE };
struct ComandoPi {
  TipoComando tipo = TipoComando::NINGUNO;
  Boton boton = Boton::DESCONOCIDO;  // solo si tipo == LAMPARA
  bool encender = false;             // LAMPARA: fijo(true)/apagado(false) — RELE: on(true)/off(false)
};

// Parsea una línea cruda ya recibida (sin el \n). Devuelve
// {tipo: NINGUNO} ante cualquier línea corrupta o no reconocida — mismo
// criterio que `parsearLineaEsp32` del lado Pi: ignorar basura ocasional
// en vez de trabar el firmware por eso.
ComandoPi parsearComandoPi(const char *linea);
