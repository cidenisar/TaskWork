# Firmware ESP32 — capa de seguridad de la Consola Disparadora

Firmware real (Arduino framework / PlatformIO) para el ESP32 que lee la
botonera + llave y maneja las 8 lámparas + el relé de la sirena local de
la Consola Disparadora (ver `consola-pi/`). Hasta esta ronda, el
protocolo UART entre la Pi y el ESP32 estaba diseñado y testeado del
lado Pi (`consola-pi/src/lib/esp32.ts`) pero **no existía ningún código
del lado ESP32 contra el cual confirmarlo** — este paquete es esa otra
mitad.

## Por qué existe como paquete aparte

Mismo criterio que `consola-pi/` respecto de `backend-server/`: es un
proceso (acá, un binario) que corre en otro dispositivo, con su propio
toolchain (C++ / Arduino framework / PlatformIO, nada que ver con
Node/TypeScript) — no tiene sentido mezclarlo en un monorepo de paquetes
Node.

## Arquitectura y decisiones heredadas

Este firmware implementa la "capa de seguridad" tal cual la definen la
Especificación del Sistema de Emergencias y el artefacto Cowork
"Cableado ESP32–Pi" (esquema + tabla de conexionado — la fuente de la
verdad para pines/cableado, no algo inventado acá):

- **Solo UART hacia la Pi** (TX/RX/GND, 3.3V↔3.3V, sin conversor de
  nivel) — nunca alimentación compartida. Si la Pi se cuelga, este
  firmware sigue leyendo botones, manejando lámparas y mandando su
  heartbeat sin depender de ella para nada.
- **El ESP32 nunca decide si algo "se dispara de verdad"** — solo avisa
  `{"evt":"boton",...}` a la Pi. La decisión de cuándo un evento es real
  (cuenta regresiva, CANCELAR, etc.) es 100% de `logic/panel.ts` del
  lado Pi (invariante 1 de la Especificación). Lo único que el ESP32
  decide por su cuenta es el **parpadeo local** de la lámpara al detectar
  la pulsación — feedback inmediato de "se registró", no un evento real.
- **Protocolo**: JSON compacto, un objeto por línea (`\n`), exactamente
  el que ya definía `consola-pi/src/lib/esp32.ts` (`protocolo.h` lo
  documenta con el detalle de cada mensaje).

## Estructura

```
esp32-firmware/
  platformio.ini       envs esp32dev (producción) y esp32dev_debug
  src/
    pines.h             asignación de pines + la cuenta de por qué no entran "los seguros nomás"
    protocolo.h/.cpp     JSON hand-rolled (sin ArduinoJson), encode/decode
    main.cpp             setup/loop: debounce, parpadeo local, comandos de la Pi, heartbeat
  test/
    run.sh                test de protocolo.cpp + compile-check de main.cpp, con g++ del host
    protocolo_test.cpp    asserts reales contra el contrato de consola-pi/src/lib/esp32.ts
    stub/                 stub mínimo de Arduino.h — SOLO para poder compilar fuera del ESP32
```

## El presupuesto de pines no cierra con los "seguros" solos

Ver el comentario largo en `src/pines.h` para el detalle número por
número. Resumen: un DevKit ESP32 de 38 pines, después de descontar
strapping (GPIO0/2/12/15), flash interna (GPIO6-11) y el UART2 hacia la
Pi (GPIO16/17), deja 18 pines libres — hacen falta 20 (11 entradas + 9
salidas). **La solución elegida:** reutilizar UART0 (GPIO1/3, el mismo
enlace que usa el conversor USB de la placa) como 2 salidas de lámpara
más, con un segundo build (`esp32dev_debug` / `-D DEBUG_SERIAL`) que
hace lo contrario — libera esos 2 pines para depurar por USB y
deshabilita la lámpara de PROG4 y el relé. **Esto es una decisión de
diseño mía, razonada pero no confirmada contra hardware real** — si al
armar el gabinete aparece un problema con reutilizar UART0, la
alternativa más simple es un DevKit con más GPIO expuesto (ESP32-S3, por
ejemplo) en vez de pelear por 2 pines en un WROOM-32 de 38.

También quedan sin confirmar (documentado en el código, no adivinado en
silencio):

- **Sentido del selector de llave** — se asumió contacto cerrado a GND
  (nivel BAJO) = "habilitado" (`esLlaveHabilitada` en `main.cpp`). No
  hay forma de confirmar esto sin el ZB4 real en la mano.
- **Polaridad del módulo de relé** — se asumió activo en ALTO
  (`RELE_ACTIVO_ALTO` en `main.cpp`). Muchos módulos de relé de un canal
  comerciales son activos en BAJO — confirmar contra el módulo real
  antes de armar, es un `false` de un carácter si hace falta cambiarlo.
- **Tiempos** (`DEBOUNCE_MS=30`, `BLINK_MS=400`, `HEARTBEAT_MS=2000`) —
  valores de partida razonables, no confirmados con el cliente (mismo
  criterio que `CUENTA_REGRESIVA_MS` del lado Pi).

## Qué SÍ se validó (`test/run.sh`)

Sin ESP32 real ni PlatformIO instalado en este entorno de desarrollo
(sin internet — ver `backend-server/README.md`, "Limitación de red de
este sandbox"), lo más riguroso disponible fue:

1. **Test de comportamiento real de `protocolo.cpp`** (no un
   compile-check) — 22 asserts contra un `Stream` de prueba que captura
   lo que se escribiría por UART: cada `emitirBoton`/`emitirLlave`/
   `emitirHeartbeat` produce byte por byte lo que
   `parsearLineaEsp32` (consola-pi) espera parsear, y `parsearComandoPi`
   interpreta correctamente cada `{"cmd":"lampara",...}`/
   `{"cmd":"rele",...}` que realmente manda `crearClienteEsp32.enviar()`
   del lado Pi — incluidas líneas corruptas, comandos desconocidos y un
   estado inválido, todos cayendo en `TipoComando::NINGUNO` sin trabar
   nada. Los 10 botones confirmados ida y vuelta
   (`nombreDeBoton`↔`botonDeNombre`).
2. **Compile-check de `main.cpp`** contra un stub mínimo de `Arduino.h`
   escrito para esto (`test/stub/`) — no es el core real del ESP32 (no
   valida registros ni timings), pero compila con `-Wall -Wextra` sin
   warnings propios del firmware (los únicos warnings son del stub) y
   corre `setup()`+`loop()` una vuelta sin crashear, en las dos
   variantes de build (producción y `DEBUG_SERIAL`).

`test/run.sh` corre las tres cosas de punta a punta — 0 fallos.

## Qué NO está validado

- **Nada de esto corrió jamás en un ESP32 real.** No hay uno en este
  entorno de desarrollo. El stub de `Arduino.h` es una aproximación para
  poder compilar/testear la lógica en el host, no el SDK real de
  espressif32 — puede haber diferencias de comportamiento (timing de
  `millis()`, comportamiento exacto de `INPUT_PULLUP`, etc.) que solo un
  banco de pruebas real puede confirmar.
- **PlatformIO nunca se instaló ni se corrió** en este entorno (sin
  internet, ver arriba) — `platformio.ini` está escrito contra su
  formato documentado, no confirmado con un build real de
  `pio run`.
- **El pinout propuesto no se verificó contra un módulo físico** — ver
  la sección de arriba. Antes de armar: confirmar que tu DevKit exacto
  expone todos estos pines (algunos clones no) y que ninguno choca con
  un LED/botón de la propia placa.
- **El driver ULN2803A y el módulo de relé** — la lógica activa-alta de
  las lámparas está tomada directo del esquema Cowork (comportamiento
  estándar de un ULN2803A), pero no hay banco de pruebas para
  confirmarlo con el driver real.
- **Consumo/tiempos de arranque** — cuánto tarda el ESP32 en levantar
  `setup()` y mandar el primer `llave`, y si eso importa para la
  experiencia del operador, no se pudo medir sin hardware.

## Cómo compilar de verdad (con el hardware en mano)

```bash
# instalar PlatformIO (requiere internet, no disponible en este entorno de desarrollo)
pip install platformio

cd esp32-firmware
pio run -e esp32dev            # build de producción
pio run -e esp32dev_debug      # build de depuración (USB libre, PROG4+relé deshabilitados)
pio run -e esp32dev -t upload  # flashear
pio device monitor             # solo tiene algo que mostrar en el build _debug
```

## Decisiones pendientes (para no perderlas de vista)

- **Confirmar pinout exacto contra el DevKit real** — ver sección de
  presupuesto de pines arriba.
- **Sentido del selector de llave y polaridad del relé** — ver arriba.
- **Timings** (`DEBOUNCE_MS`/`BLINK_MS`/`HEARTBEAT_MS`) — no confirmados
  con el cliente.
- ~~`esp32HeartbeatOk` del lado Pi no tiene timeout~~ — **resuelto
  (2026-08-28)**, ver `consola-pi/README.md`, "Timeout del heartbeat del
  ESP32". El umbral elegido ahí (`ESP32_HEARTBEAT_TIMEOUT_MS = 6_000`)
  asume `HEARTBEAT_MS = 2000` de este firmware — si ese valor cambia acá,
  actualizar también el umbral del lado Pi.
