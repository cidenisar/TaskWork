// Implementación mínima de las funciones de hardware que declara
// Arduino.h — usada solo para el compile-check de src/main.cpp (ver
// run.sh, target "compile-check"). No se linkea con protocolo_test.cpp
// (que trae su propio main()).
#include "Arduino.h"

void pinMode(uint8_t, uint8_t) {}
void digitalWrite(uint8_t, uint8_t) {}
int digitalRead(uint8_t) { return HIGH; }
unsigned long millis() { return 0; }

HardwareSerial Serial;
HardwareSerial Serial2;

void setup();
void loop();

int main() {
  setup();
  loop();  // una vuelta alcanza para el compile-check — no es un test de comportamiento
  return 0;
}
