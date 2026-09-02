#!/usr/bin/env bash
# Valida lo que se puede validar SIN un ESP32 real ni el toolchain de
# PlatformIO/espressif32 (no instalable en muchos entornos de
# desarrollo sin internet) — ver README.md, "Qué SÍ se validó" / "Qué NO
# está validado". Dos cosas, con g++ del host:
#
#   1. Test real de protocolo.cpp (encode/decode) contra el contrato
#      exacto de consola-pi/src/lib/esp32.ts — no un compile-check, un
#      test de comportamiento con asserts.
#   2. Compile-check de src/main.cpp contra un stub mínimo de Arduino.h,
#      en las dos variantes de build (producción y DEBUG_SERIAL) — esto
#      SÍ es solo sintaxis/tipos, no valida timings ni nada específico
#      del chip real.
#
# No reemplaza correrlo en un ESP32 real. Uso: test/run.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "== 1/3: test de protocolo (protocolo_test.cpp) =="
g++ -std=c++14 -Wall -Wextra -Wno-unused-parameter \
  -I stub -I ../src \
  protocolo_test.cpp ../src/protocolo.cpp \
  -o "$TMP/protocolo_test"
"$TMP/protocolo_test"

echo
echo "== 2/3: compile-check de main.cpp (build de produccion) =="
g++ -std=c++14 -Wall -Wextra -Wno-unused-parameter \
  -I stub -I ../src \
  ../src/main.cpp ../src/protocolo.cpp stub/stub_main.cpp \
  -o "$TMP/fw_prod"
"$TMP/fw_prod" >/dev/null
echo "ok — compila y corre setup()+loop() una vuelta sin crashear"

echo
echo "== 3/3: compile-check de main.cpp (build DEBUG_SERIAL) =="
g++ -std=c++14 -Wall -Wextra -Wno-unused-parameter -DDEBUG_SERIAL \
  -I stub -I ../src \
  ../src/main.cpp ../src/protocolo.cpp stub/stub_main.cpp \
  -o "$TMP/fw_debug"
"$TMP/fw_debug" >/dev/null
echo "ok — compila y corre setup()+loop() una vuelta sin crashear"

echo
echo "Todo verde. Recordatorio: esto NO corrió en un ESP32 real — ver README.md."
