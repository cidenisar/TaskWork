// Stub MÍNIMO del core Arduino-ESP32, solo para poder compilar y correr
// protocolo.cpp fuera del ESP32 (con g++ del host) y así testear la
// lógica de encode/decode del protocolo sin hardware real ni el
// toolchain de PlatformIO/espressif32 (no instalable en este entorno de
// desarrollo, sin internet — ver README.md). NO es el core real: no
// valida timings, registros, ni nada específico del chip — eso sigue
// pendiente de un ESP32 físico. Lo único que valida es que
// protocolo.cpp compila con los tipos correctos y produce/interpreta
// exactamente las líneas que espera consola-pi/src/lib/esp32.ts.
#pragma once
#include <cstdint>
#include <cstddef>

#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define SERIAL_8N1 0x800001c

void pinMode(uint8_t pin, uint8_t mode);
void digitalWrite(uint8_t pin, uint8_t level);
int digitalRead(uint8_t pin);
unsigned long millis();

class Print {
 public:
  virtual void print(const char *s) = 0;
  virtual void println(const char *s) = 0;
  virtual void println() = 0;
  virtual ~Print() {}
};

class Stream : public Print {
 public:
  virtual int available() = 0;
  virtual int read() = 0;
  void print(const char *s) override { (void)s; }
  void println(const char *s) override { (void)s; }
  void println() override {}
};

class HardwareSerial : public Stream {
 public:
  void begin(unsigned long baud) { (void)baud; }
  void begin(unsigned long baud, uint32_t config, int8_t rxPin, int8_t txPin) {
    (void)baud;
    (void)config;
    (void)rxPin;
    (void)txPin;
  }
  int available() override { return 0; }
  int read() override { return -1; }
};

extern HardwareSerial Serial;
extern HardwareSerial Serial2;
