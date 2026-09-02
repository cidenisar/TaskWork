#include "protocolo.h"
#include <string.h>
#include <stdio.h>

const char *nombreDeBoton(Boton b) {
  switch (b) {
    case Boton::INCENDIO:
      return "INCENDIO";
    case Boton::SISMO:
      return "SISMO";
    case Boton::MEDICO:
      return "MEDICO";
    case Boton::TOXICO:
      return "TOXICO";
    case Boton::PROG1:
      return "PROG1";
    case Boton::PROG2:
      return "PROG2";
    case Boton::PROG3:
      return "PROG3";
    case Boton::PROG4:
      return "PROG4";
    case Boton::OK:
      return "OK";
    case Boton::CANCELAR:
      return "CANCELAR";
    default:
      return "DESCONOCIDO";
  }
}

Boton botonDeNombre(const char *nombre) {
  if (strcmp(nombre, "INCENDIO") == 0) return Boton::INCENDIO;
  if (strcmp(nombre, "SISMO") == 0) return Boton::SISMO;
  if (strcmp(nombre, "MEDICO") == 0) return Boton::MEDICO;
  if (strcmp(nombre, "TOXICO") == 0) return Boton::TOXICO;
  if (strcmp(nombre, "PROG1") == 0) return Boton::PROG1;
  if (strcmp(nombre, "PROG2") == 0) return Boton::PROG2;
  if (strcmp(nombre, "PROG3") == 0) return Boton::PROG3;
  if (strcmp(nombre, "PROG4") == 0) return Boton::PROG4;
  if (strcmp(nombre, "OK") == 0) return Boton::OK;
  if (strcmp(nombre, "CANCELAR") == 0) return Boton::CANCELAR;
  return Boton::DESCONOCIDO;
}

void emitirBoton(Stream &out, Boton b) {
  char buf[48];
  snprintf(buf, sizeof(buf), "{\"evt\":\"boton\",\"tecla\":\"%s\"}\n", nombreDeBoton(b));
  out.print(buf);
}

void emitirLlave(Stream &out, bool habilitada) {
  out.print(habilitada ? "{\"evt\":\"llave\",\"estado\":\"habilitado\"}\n"
                        : "{\"evt\":\"llave\",\"estado\":\"bloqueado\"}\n");
}

void emitirHeartbeat(Stream &out, bool ok) {
  out.print(ok ? "{\"evt\":\"heartbeat\",\"ok\":true}\n" : "{\"evt\":\"heartbeat\",\"ok\":false}\n");
}

// Busca `"clave":"..."` en `linea` y copia lo que hay entre comillas a
// `out` (truncado a outLen-1 si hace falta, siempre null-terminado).
// Parser deliberadamente ingenuo (sin escapes, sin anidamiento) — el
// emisor real es siempre backend-server/lib/mqtt.ts vía consola-pi (ver
// protocolo.h), nunca texto arbitrario, así que no hace falta un parser
// de JSON completo para esta superficie fija y chica.
static bool extraerValorString(const char *linea, const char *clave, char *out, size_t outLen) {
  char patron[24];
  snprintf(patron, sizeof(patron), "\"%s\":\"", clave);
  const char *inicio = strstr(linea, patron);
  if (!inicio) return false;
  inicio += strlen(patron);
  const char *fin = strchr(inicio, '"');
  if (!fin) return false;
  size_t len = (size_t)(fin - inicio);
  if (len >= outLen) len = outLen - 1;
  memcpy(out, inicio, len);
  out[len] = '\0';
  return true;
}

ComandoPi parsearComandoPi(const char *linea) {
  ComandoPi resultado;

  char cmd[16];
  if (!extraerValorString(linea, "cmd", cmd, sizeof(cmd))) return resultado;

  if (strcmp(cmd, "lampara") == 0) {
    char boton[16];
    char estado[16];
    if (!extraerValorString(linea, "boton", boton, sizeof(boton))) return resultado;
    if (!extraerValorString(linea, "estado", estado, sizeof(estado))) return resultado;
    Boton b = botonDeNombre(boton);
    if (b == Boton::DESCONOCIDO) return resultado;
    if (strcmp(estado, "fijo") != 0 && strcmp(estado, "apagado") != 0) return resultado;
    resultado.tipo = TipoComando::LAMPARA;
    resultado.boton = b;
    resultado.encender = (strcmp(estado, "fijo") == 0);
    return resultado;
  }

  if (strcmp(cmd, "rele") == 0) {
    char estado[16];
    if (!extraerValorString(linea, "estado", estado, sizeof(estado))) return resultado;
    if (strcmp(estado, "on") != 0 && strcmp(estado, "off") != 0) return resultado;
    resultado.tipo = TipoComando::RELE;
    resultado.encender = (strcmp(estado, "on") == 0);
    return resultado;
  }

  return resultado;  // cmd desconocido — ignorado, ver comentario en protocolo.h
}
