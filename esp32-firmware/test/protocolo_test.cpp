// Chequeo real (no solo compile-check) del protocolo hand-rolled contra
// el contrato exacto que espera consola-pi/src/lib/esp32.ts —
// `parsearLineaEsp32` del lado Pi y `crearClienteEsp32` (comandos que
// manda). No reemplaza probarlo contra un ESP32 real, pero valida la
// lógica de encode/decode en sí (lo único que este firmware inventa
// completamente, sin poder apoyarse en una librería ya probada) — ver
// README.md, "Qué SÍ se validó" / "Qué NO está validado". Correr con
// `test/run.sh` (plano, con g++ del host — no necesita PlatformIO).
#include "Arduino.h"
#include "../src/protocolo.h"
#include <string>
#include <cstdio>

class StreamCapturador : public Stream {
 public:
  std::string capturado;
  void print(const char *s) override { capturado += s; }
  void println(const char *s) override {
    capturado += s;
    capturado += "\n";
  }
  void println() override { capturado += "\n"; }
  int available() override { return 0; }
  int read() override { return -1; }
};

static int fallos = 0;
#define CHECK(cond, msg)                                             \
  do {                                                                \
    if (!(cond)) {                                                    \
      fallos++;                                                       \
      std::fprintf(stderr, "FALLO: %s (linea %d)\n", msg, __LINE__);  \
    } else {                                                          \
      std::printf("ok: %s\n", msg);                                   \
    }                                                                 \
  } while (0)

int main() {
  // --- Saliente: exactamente lo que parsearLineaEsp32 (Pi) espera ---
  {
    StreamCapturador s;
    emitirBoton(s, Boton::INCENDIO);
    CHECK(s.capturado == "{\"evt\":\"boton\",\"tecla\":\"INCENDIO\"}\n", "emitirBoton INCENDIO");
  }
  {
    StreamCapturador s;
    emitirBoton(s, Boton::PROG4);
    CHECK(s.capturado == "{\"evt\":\"boton\",\"tecla\":\"PROG4\"}\n", "emitirBoton PROG4");
  }
  {
    StreamCapturador s;
    emitirLlave(s, true);
    CHECK(s.capturado == "{\"evt\":\"llave\",\"estado\":\"habilitado\"}\n", "emitirLlave habilitado");
  }
  {
    StreamCapturador s;
    emitirLlave(s, false);
    CHECK(s.capturado == "{\"evt\":\"llave\",\"estado\":\"bloqueado\"}\n", "emitirLlave bloqueado");
  }
  {
    StreamCapturador s;
    emitirHeartbeat(s, true);
    CHECK(s.capturado == "{\"evt\":\"heartbeat\",\"ok\":true}\n", "emitirHeartbeat true");
  }
  {
    StreamCapturador s;
    emitirHeartbeat(s, false);
    CHECK(s.capturado == "{\"evt\":\"heartbeat\",\"ok\":false}\n", "emitirHeartbeat false");
  }

  // --- Entrante: exactamente lo que manda consola-pi (lib/esp32.ts, enviar()) ---
  {
    ComandoPi c = parsearComandoPi("{\"cmd\":\"lampara\",\"boton\":\"TOXICO\",\"estado\":\"fijo\"}");
    CHECK(c.tipo == TipoComando::LAMPARA, "parsear lampara: tipo");
    CHECK(c.boton == Boton::TOXICO, "parsear lampara: boton");
    CHECK(c.encender == true, "parsear lampara fijo: encender=true");
  }
  {
    ComandoPi c = parsearComandoPi("{\"cmd\":\"lampara\",\"boton\":\"PROG2\",\"estado\":\"apagado\"}");
    CHECK(c.tipo == TipoComando::LAMPARA, "parsear lampara apagado: tipo");
    CHECK(c.boton == Boton::PROG2, "parsear lampara apagado: boton");
    CHECK(c.encender == false, "parsear lampara apagado: encender=false");
  }
  {
    ComandoPi c = parsearComandoPi("{\"cmd\":\"rele\",\"estado\":\"on\"}");
    CHECK(c.tipo == TipoComando::RELE, "parsear rele on: tipo");
    CHECK(c.encender == true, "parsear rele on: encender=true");
  }
  {
    ComandoPi c = parsearComandoPi("{\"cmd\":\"rele\",\"estado\":\"off\"}");
    CHECK(c.tipo == TipoComando::RELE, "parsear rele off: tipo");
    CHECK(c.encender == false, "parsear rele off: encender=false");
  }
  // --- Basura / no reconocido — no debe trabar nada, tipo NINGUNO ---
  {
    ComandoPi c = parsearComandoPi("no es json en absoluto");
    CHECK(c.tipo == TipoComando::NINGUNO, "linea corrupta -> NINGUNO");
  }
  {
    ComandoPi c = parsearComandoPi("{\"cmd\":\"lampara\",\"boton\":\"NOEXISTE\",\"estado\":\"fijo\"}");
    CHECK(c.tipo == TipoComando::NINGUNO, "boton desconocido -> NINGUNO");
  }
  {
    ComandoPi c = parsearComandoPi("{\"cmd\":\"lampara\",\"boton\":\"OK\",\"estado\":\"parpadeo\"}");
    CHECK(c.tipo == TipoComando::NINGUNO, "estado invalido (parpadeo, no lo manda la Pi) -> NINGUNO");
  }
  {
    ComandoPi c = parsearComandoPi("{\"cmd\":\"otracosa\"}");
    CHECK(c.tipo == TipoComando::NINGUNO, "cmd desconocido -> NINGUNO");
  }
  {
    ComandoPi c = parsearComandoPi("");
    CHECK(c.tipo == TipoComando::NINGUNO, "linea vacia -> NINGUNO");
  }

  // --- Todos los 10 botones ida y vuelta (nombreDeBoton / botonDeNombre) ---
  const Boton todos[] = {Boton::INCENDIO, Boton::SISMO, Boton::MEDICO, Boton::TOXICO,
                          Boton::PROG1,    Boton::PROG2, Boton::PROG3,  Boton::PROG4,
                          Boton::OK,       Boton::CANCELAR};
  bool idaYVuelta = true;
  for (Boton b : todos) {
    if (botonDeNombre(nombreDeBoton(b)) != b) idaYVuelta = false;
  }
  CHECK(idaYVuelta, "los 10 botones sobreviven nombreDeBoton -> botonDeNombre");

  std::printf("\n%d fallo(s)\n", fallos);
  return fallos == 0 ? 0 : 1;
}
