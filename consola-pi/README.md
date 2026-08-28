# Consola Disparadora — software real (Pi)

El programa que corre en la Raspberry Pi de cada sitio: habla MQTT con
`backend-server`, valida el PIN del operador localmente contra el padrón
cacheado, y maneja el ciclo llave→PIN→botón→cuenta regresiva→envío de un
evento real. Pantalla táctil (información + configuración) todavía sin
construir — ver "Qué falta" más abajo.

## Corrección de arquitectura (2026-08-28)

La primera versión de este paquete (commit anterior) asumía GPIO directo
desde la Pi (`onoff`) para el relé y la botonera. Es arquitectura
incorrecta — al revisar el trabajo de diseño ya hecho en Cowork
("Cableado ESP32–Pi", "Especificación del Sistema de Emergencias") quedó
claro que:

- **El hardware real tiene un ESP32 separado**, no GPIO de la Pi. La Pi y
  el ESP32 se conectan *solo* por UART (TX/RX/GND, sin alimentación
  compartida) — el ESP32 es quien lee los 10 botones + la llave y maneja
  las 8 lámparas + el relé, con firmware propio (Arduino, sin sistema
  operativo). Es la "capa de seguridad" que sigue funcionando aunque la
  Pi se cuelgue (invariante 2 de la Especificación) — GPIO directo desde
  la Pi rompía justo esa garantía.
- **No son 3 botones genéricos, son 10 + la llave**: Incendio, Sismo,
  Médico, Tóxico, OK en una fila; PROG1–4 (configurables) y Cancelar en
  la otra. Cada botón de alarma YA es un tipo específico — no hace falta
  elegir tipo en pantalla como asumía la v1.
- **CANCELAR nunca toca MQTT** (invariante 3): solo aborta la cuenta
  regresiva pre-envío, 100% local. OK sí es un evento real (la única
  forma de cerrar formalmente una emergencia ya disparada).
- **El PIN se pide al girar la llave**, no al presionar un botón de
  disparo genérico (invariante 5: el PIN es la única autoridad para
  habilitar el panel).

Todo esto está corregido en este paquete — ver "Cómo está armado" abajo.
El lenguaje (Node/TypeScript en vez de Python, que era la decisión
original en la Especificación) también se revisó y confirmó — ver
`ac8c8a31...` (artifact "Especificación del Sistema de Emergencias",
sección 5.3) para el razonamiento completo.

## Cómo está armado

- **`lib/esp32.ts`** — el protocolo hacia el ESP32: JSON compacto línea
  por línea (es lo único que estaba especificado; el formato exacto de
  cada mensaje se definió acá, a validar cuando exista el firmware real).
  Recibe `{"evt":"boton","tecla":"INCENDIO"}` / `{"evt":"llave",...}` /
  `{"evt":"heartbeat",...}`; manda `{"cmd":"lampara",...}` /
  `{"cmd":"rele",...}`. Trabaja sobre cualquier `Duplex` de Node, no
  acoplado a `serialport` — así el framing se testea con un stream en
  memoria, sin puerto serie real.
- **`lib/esp32Serial.ts`** — abre el puerto serie real (`serialport`,
  binarios prebuilt, sin necesitar compilador).
- **`lib/esp32Simulado.ts`** — para desarrollar sin hardware: los botones
  se disparan por teclado (`1`-`8`, `o`, `c`, `k` para la llave), lámparas
  y relé se loguean por consola. Expone además `leerPin()` — solo para
  este flujo de desarrollo sin pantalla táctil (la Pi real pediría el PIN
  por el teclado numérico en pantalla, todavía sin construir).
- **`logic/panel.ts`** — la máquina de estados del panel, **pura**
  (`reducirPanel(estado, entrada) -> {estado, efectos}`, sin I/O ni
  timers reales) — codifica los invariantes 1, 3 y 5 tal cual, no una
  interpretación. 13 tests, incluidos casos con esos invariantes en el
  nombre del test.
- **`logic/pin.ts`** — sin cambios de la v1: `validarPin` (bcrypt local
  contra el padrón cacheado).
- **`lib/padronCache.ts`** — **SQLite** (`better-sqlite3`) en vez de un
  array en memoria (que tenía la v1) — ver invariante 2: si la Pi se
  reinicia mientras está desconectada, un cache en memoria arranca vacío
  justo en el peor momento. SQLite sobrevive al restart.
- **`index.ts`** — conecta todo: MQTT (sin cambios de contrato), el
  cliente ESP32 (real o simulado según `EN_PI`), el reductor del panel
  (los timers de la cuenta regresiva SÍ son reales acá, con
  `setTimeout`/`clearTimeout` — el reductor solo decide qué hacer, index.ts
  hace que pase).

## Cómo correr esto en Windows sin la Pi

```bash
npm install
cp .env.example .env   # completar CONSOLA_ID + MQTT_PASSWORD (provisionar-consola.sh en backend-server)
npm run dev
```

En una terminal interactiva (no en background) para que la botonera
simulada por teclado funcione. Necesita un broker Mosquitto (el mismo que
ya usa `backend-server`/`consola-simulador`).

**En la Pi real:** `EN_PI=1` + `ESP32_PUERTO`/`ESP32_BAUD` en `.env` —
`serialport` y `better-sqlite3` ya están en `package.json` con binarios
prebuilt, no hace falta compilador en la Pi tampoco.

## El flujo completo (llave → PIN → botón → cuenta regresiva → envío)

1. **Llave a "habilitado"** (ESP32 → Pi) → la pantalla pediría el PIN
   (`pidiendo_pin`). Un botón presionado acá no hace nada — invariante 5.
2. **PIN correcto** (validado localmente, `validarPin`) → panel
   `habilitado`, se identifica al operador. Se publica `auth` en MQTT
   siempre — válido o no, es la auditoría de todo intento.
3. **Botón de alarma presionado** (cualquiera de los 10 menos CANCELAR,
   incluido OK) → `confirmando`, arranca una cuenta regresiva de 5s
   (`CUENTA_REGRESIVA_MS` — valor del wireframe de pantalla, no confirmado
   con el cliente todavía, ver "Decisiones pendientes").
4. **CANCELAR durante la cuenta regresiva** → vuelve a `habilitado`, nada
   se publica — invariante 3, 100% local.
5. **Cuenta regresiva termina sin CANCELAR** → recién ahí se publica el
   evento DISPARADO real — invariante 1.
6. **Girar la llave a "bloqueado"** corta cualquier fase, incluida una
   cuenta regresiva en curso.

## Qué falta (a propósito)

- **Pantalla táctil** — sigue sin construirse. Ya existe un wireframe
  HTML/CSS/JS completo y clickeable (artifact "Consola Disparador",
  pensado para Chromium en modo kiosco) — el próximo paso natural es
  adaptar ESE wireframe a un servidor real en `index.ts`, no diseñar una
  UI nueva desde cero.
- **PIN por teclado numérico en pantalla** — hoy solo existe
  `leerPin()` por stdin, para desarrollo sin pantalla.
- **Tipo de evento de PROG1–4** — hoy se manda el nombre literal del
  botón (`"PROG1"`) como `tipo`; la asignación real (ej. PROG1 → "Viento")
  es una pantalla de configuración que todavía no existe. Sin esa
  asignación, el backend recibe un tipo que no matchea ningún
  `tipos_evento.nombre` y lo ignora (no rompe nada, pero tampoco hace
  nada).
- **Failover de conectividad** (Ethernet → WiFi → 4G) — no implementado,
  la librería `mqtt` reconecta sola al mismo host pero no rota entre
  interfaces de red.
- **Filesystem de solo lectura / boot por NVMe / UPS** — configuración de
  la Pi en sí, fuera del alcance de este paquete de software.

## Qué NO está validado

- **GPIO/UART real contra un ESP32 físico** — no hay hardware en este
  entorno de desarrollo. `esp32Serial.ts` está escrito contra la API
  documentada de `serialport`, y el protocolo de `esp32.ts` está diseñado
  acá (no hay firmware real todavía contra el cual confirmarlo) — ambos a
  validar en cuanto exista el ESP32 con su firmware.
- **El flujo interactivo por teclado de punta a punta** (girar la llave,
  tipear el PIN, presionar un botón) — `ClienteEsp32Simulado` exige una
  TTY real y este entorno de desarrollo no tiene una interactiva para un
  proceso en background.

## Validado de punta a punta (2026-08-28) contra backend-server + Mosquitto reales

Todo lo de abajo corrió el mismo código de producción (`reducirPanel`,
`validarPin`, `publicarEvento`, `publicarAuth`) — el flujo interactivo por
teclado no se pudo ejercitar (ver arriba), pero la lógica que ese teclado
dispararía sí, con un script que simula los eventos del ESP32
directamente:

- **Relé reacciona a `evento-activo` real** — disparado un evento real de
  Tóxico con `activa_rele: true`, el log mostró `[esp32-simulado] relé:
  🔴 ACTIVADO`; al cerrar con OK, `⚪ desactivado` + las 8 lámparas de
  alarma reseteadas.
- **PIN inválido durante `pidiendo_pin`** → panel se queda pidiendo PIN,
  se publicó `auth` con `resultado: invalido` y `operadorId: null` —
  confirmado en `auditoria_pin` de Supabase.
- **PIN válido → botón → CANCELAR (invariante 3)** → panel pasó por
  `habilitado` → `confirmando` → `habilitado` de nuevo. **Ninguna fila
  nueva en `eventos`** — confirmado contra Supabase que CANCELAR nunca
  llegó a publicar nada.
- **PIN válido → botón → cuenta regresiva terminada (invariante 1)** →
  se publicó el DISPARADO real; confirmado en `eventos` de Supabase la
  fila nueva con el `operador_id` real y `tipo_evento` correcto (Tóxico).
- **SQLite persistente**: el padrón real sincronizado desde Supabase (con
  el `id` real del operador) quedó en `padron.db`, consultado directo con
  `better-sqlite3` fuera del proceso para confirmarlo.

Operador de prueba, auditoría y eventos de prueba borrados al terminar.
`npm run typecheck` limpio, 25/25 tests (13 nuevos de `logic/panel.ts`, 8
de `lib/esp32.ts`, 4 de `logic/pin.ts` de la v1).

## Decisiones pendientes (para no perderlas de vista)

- **Duración de la cuenta regresiva** — 5s, tomado del wireframe de
  pantalla, no confirmado con el cliente como el valor real de producción.
- **¿El relé local se activa apenas se confirma el envío, o espera la
  confirmación del backend?** Hoy espera — más conservador (nunca suena
  antes de que el evento sea real), pero potencialmente más lento que lo
  que permitiría la "capa de seguridad independiente" si el ESP32 pudiera
  decidirlo solo. Sin resolver todavía.
- **Asignación de PROG1–4** — qué tipo de evento le corresponde a cada
  uno es una pantalla de configuración (rol admin) que no existe.
- **Qué pasa ante varios PIN incorrectos seguidos** — la propia
  Especificación lo deja como pendiente (bloqueo temporal, aviso al
  backend, o ambos) — no implementado.
