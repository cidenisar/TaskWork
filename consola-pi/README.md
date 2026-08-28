# Consola Disparadora — software real (Pi)

El programa que corre en la Raspberry Pi de cada sitio: habla MQTT con
`backend-server`, valida el PIN del operador localmente contra el padrón
cacheado, y maneja la salida de relé/sirena. Pantalla táctil (información +
configuración) y botonera física (DISPARADO/OK/CANCELAR) — ver
`backend-server/README.md`, "Simulacro sorpresa, escenario y relé/sirena"
para el contrato del lado backend.

## Por qué no hace falta emular una Raspberry Pi para desarrollar esto

Lo único realmente específico de la Pi acá es el **GPIO** (relé + botonera
física) — y un emulador de Pi completo (QEMU con una imagen de Raspberry
Pi OS) no emula GPIO de forma útil, así que no compra nada para probar
justo la parte que sí depende del hardware. El resto (cliente MQTT,
validación de PIN, lo que se muestra en pantalla) es JavaScript/TypeScript
normal — corre igual en Windows, WSL2, Docker o acá.

**Decisión (2026-08-28):** GPIO detrás de una interfaz (`ReleDriver`,
`BotoneraDriver`, ver `src/lib/`), con dos implementaciones cada una:

- **Real** (`ReleGpioReal`, `BotoneraGpioReal`) — usa [`onoff`](https://www.npmjs.com/package/onoff)
  (GPIO por sysfs, sin bindings nativos que compilar) contra los pines de
  la Pi real. Import dinámico a propósito — `onoff` **no está en
  `package.json`**, así que `npm install` nunca lo pide fuera de la Pi.
  Sin validar contra hardware real todavía (no hay una Pi en este entorno
  de desarrollo) — ver "Qué NO está validado" abajo.
- **Simulada** (`ReleSimulado`, `BotoneraSimulada`) — el relé loguea su
  estado por consola; la botonera mapea teclas del teclado (`d`/`o`/`c`) a
  los tres botones físicos, leyendo stdin en modo raw. Es la que se usa
  por defecto (`EN_PI` sin definir o `0`).

## Cómo correr esto en Windows sin la Pi

```bash
# Desde WSL2 (recomendado) o un contenedor Docker con Node 20+:
npm install
cp .env.example .env   # completar CONSOLA_ID + MQTT_PASSWORD (provisionar-consola.sh en backend-server)
npm run dev
```

Necesita un broker Mosquitto corriendo — el mismo que ya usa
`backend-server`/`consola-simulador` para desarrollo (ver
`backend-server/README.md`, "Autenticación de las consolas contra
Mosquitto"). `npm run dev` en una terminal interactiva (no en background)
para que la botonera simulada por teclado funcione — sin una TTY real,
avisa por consola y queda sin recibir nada (es lo que pasa si se corre
como proceso de fondo/CI).

**En la Pi real:** mismo `npm install && npm run build && npm start`, con
`EN_PI=1` y los pines (`RELE_PIN`, `PIN_BOTON_*`) en `.env` — ahí sí hace
falta `npm install onoff` a mano (no es dependencia por defecto, ver
arriba).

## Qué está implementado

- Conexión MQTT como la propia consola (usuario = `CONSOLA_ID`, mismo
  patrón que `consola-simulador`) con Last Will and Testament
  (`consolas/{id}/estado` → `offline` si se cae sin avisar).
- Heartbeat periódico (cada 30s) — `bateria`/`caminoRed` todavía en
  `null`, no hay sensores que leer en esta versión.
- Cachea `padron` y `simulacro` (retained, se repueblan solos al
  reconectar) y reacciona a `evento-activo`: activa/desactiva el relé
  según `activarRele`.
- **Validación de PIN local** (`src/logic/pin.ts`, `validarPin`, pura —
  `bcrypt.compare` contra cada hash del padrón cacheado hasta encontrar
  el que matchea) — 4 tests.
- Botón "disparado" (simulado por teclado) pide el PIN, lo valida, y
  **siempre** publica la auditoría en `consolas/{id}/auth` (válido o no)
  — eso no depende de ninguna decisión pendiente, es la auditoría de todo
  intento de PIN.

## Qué falta (a propósito, ver "Decisiones pendientes")

- **Publicar el evento DISPARADO en sí** — con PIN válido, hoy solo
  loguea "falta elegir el tipo". Un botón físico solo no alcanza para
  decir "Incendio" vs. "Tóxico" vs. "Sismo" — necesita la pantalla
  táctil (para elegir tipo/modo) o una decisión de que cada botón
  represente un tipo fijo. Ver "Decisiones pendientes".
- **Pantalla táctil** — no hay UI todavía, ni siquiera un placeholder. Lo
  que mostraría (evento activo, próximo simulacro, accountability) hoy
  se loguea por consola como aproximación.
- **PIN por teclado numérico en pantalla** — el `leerPin()` actual es por
  stdin (dev/teclado), documentado como solo para desarrollo sin pantalla
  (`BotoneraSimulada`, no forma parte de `BotoneraDriver`).

## Qué NO está validado

- **GPIO real** — no hay una Raspberry Pi en este entorno de desarrollo.
  `ReleGpioReal`/`BotoneraGpioReal` están escritas contra la API
  documentada de `onoff`, pero nunca corrieron contra hardware. Primera
  vez que haya una Pi física, validar esto es el primer paso.
- **El flujo de teclado de punta a punta** (tecla `d` → pedir PIN →
  validar) — `BotoneraSimulada` exige una TTY real (`process.stdin.isTTY`)
  y este entorno de desarrollo no tiene una interactiva para un proceso
  en background. Validado en su lugar: `validarPin` con 4 tests unitarios
  (PIN correcto, incorrecto, padrón vacío, dos PINs con mismo prefijo), y
  el camino completo MQTT→backend→Supabase con un script que llama al
  mismo código de producción (`validarPin` + `publicarAuth`) sin pasar por
  el teclado — ver validación de punta a punta abajo.

## Validado de punta a punta (2026-08-28) contra backend-server + Mosquitto reales

- **Relé reacciona a `evento-activo` real**: conectado como la consola
  "Bunker" (mismas credenciales que usa `consola-simulador`), disparado un
  evento real de Tóxico con `activa_rele: true` vía `mosquitto_pub` (mismo
  patrón que las validaciones de `backend-server`) — el log mostró
  `[evento-activo] TÓXICO (SIMULACRO) — mismo-sitio` seguido de
  `[rele] 🔴 ACTIVADO`, y al cerrar con OK, `[rele] ⚪ desactivado`.
- **Padrón real con `operadorId`**: recibido el padrón real de Supabase
  (2 operadores, incluido uno de prueba con PIN `1234` creado para este
  test) — confirmó que el `id` que se agregó a `OperadorPadron` (ver
  `backend-server/README.md`, actualización del 2026-08-28) llega
  correctamente.
- **PIN + auditoría de punta a punta**: `validarPin("1234", padronReal)`
  devolvió el `operadorId` real del operador de prueba;
  `validarPin("0000", ...)` devolvió inválido. Publicado `auth` para
  ambos casos vía `publicarAuth` — confirmado en Supabase que
  `auditoria_pin` tiene las dos filas correctas (`resultado: valido` con
  el `operador_id` real, `resultado: invalido` con `operador_id: null`).

Operador de prueba, auditoría y eventos de prueba borrados al terminar;
`activa_rele` de Tóxico revertido a `false`.

## Decisiones pendientes (para no perderlas de vista)

- **¿El botón físico "disparado" dispara un tipo fijo, o necesita la
  pantalla táctil para elegir tipo/modo antes?** Bloquea completar el
  flujo de disparo — hoy la validación de PIN y la auditoría ya
  funcionan, pero no se publica el evento en sí hasta resolver esto.
- **Diseño de la pantalla táctil** — todavía no arrancado. Candidata
  razonable: un servidor HTTP local + Chromium en modo kiosko (mismo
  patrón que `consola-simulador`, pero como UI de producción en vez de
  herramienta de test) en vez de una UI nativa — a decidir.
