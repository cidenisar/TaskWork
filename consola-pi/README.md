# Consola Disparadora — software real (Pi)

El programa que corre en la Raspberry Pi de cada sitio: habla MQTT con
`backend-server`, valida el PIN del operador localmente contra el padrón
cacheado, maneja el ciclo llave→PIN→botón→cuenta regresiva→envío de un
evento real, y sirve la pantalla táctil (adaptada del wireframe de
Cowork) con el estado en vivo. Historial/diagnóstico/configuración de la
pantalla siguen sin construir — ver "Qué falta" más abajo.

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
  y relé se loguean por consola. El PIN **no** se pide por teclado — se
  tipea en la pantalla táctil real (ver siguiente punto), en modo
  simulado igual que en la Pi real.
- **`lib/pantalla.ts` + `pantalla/index.html`** — el servidor de la
  pantalla táctil: sirve el HTML (adaptado del wireframe "Consola
  Disparador" de Cowork, mismos colores/tipografía) y lo mantiene al día
  con Server-Sent Events (`GET /eventos`). Dos rutas de entrada nada más
  — `POST /pin` (identifica al operador) y `POST /cancelar` (mismo efecto
  100% local que el botón físico, invariante 3) — ninguna otra ruta
  existe que pueda disparar un evento, la pantalla no tiene forma de
  violar el invariante 1 aunque quisiera.
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
  hace que pase), y el servidor de la pantalla (`pantalla.notificar()`
  después de cualquier cambio relevante — dispatch del panel, mensaje
  MQTT entrante).

## Cómo correr esto en Windows sin la Pi

```bash
npm install
cp .env.example .env   # completar CONSOLA_ID + MQTT_PASSWORD (provisionar-consola.sh en backend-server)
npm run dev
```

En una terminal interactiva (no en background) para que la botonera
simulada por teclado funcione. Necesita un broker Mosquitto (el mismo que
ya usa `backend-server`/`consola-simulador`). Abrir
`http://localhost:8080` (o el puerto de `PUERTO_PANTALLA`) en un
navegador para ver la pantalla — es la misma UI que correría en la Pi
real en Chromium modo kiosco.

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

- **Batería/UPS real en Diagnóstico** — la fila existe en la pantalla pero
  muestra "N/D" a propósito: no hay forma de leer esto sin el hardware de
  la Pi real (UPS HAT o similar), fuera del alcance de este paquete de
  software puro.
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
  presionar un botón) — `ClienteEsp32Simulado` exige una TTY real y este
  entorno de desarrollo no tiene una interactiva para un proceso en
  background. La pantalla en sí (servidor + HTML + PIN por HTTP) **sí**
  se validó de punta a punta — ver abajo — solo el teclado del ESP32
  simulado queda sin poder probarse acá.

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

## Validado visualmente (2026-08-28) — la pantalla táctil

Mismo problema que el teclado del ESP32 simulado: no hay una TTY real acá
para tipear un PIN en la pantalla como lo haría un operador. Se validó
igual, con Playwright, contra el mismo servidor y el mismo HTML de
producción (`lib/pantalla.ts` + `pantalla/index.html`) — un script de
prueba llama a `reducirPanel` directo (el mismo camino que tomaría el
callback de eventos del ESP32 en `index.ts`) para ir avanzando el estado,
y en cada paso Playwright saca una captura real del navegador:

1. **Bloqueado** — "PANEL BLOQUEADO — GIRE LA LLAVE".
2. **Pidiendo PIN** — teclado numérico 0-9, puntos de PIN.
3. **Habilitado** — pantalla principal con modo, sirena, padrón, operador
   identificado (legajo + rol) y próximo simulacro.
4. **Aviso de evento en otra consola** — banner informativo (azul,
   "sitio vecino") superpuesto sin bloquear la pantalla principal —
   invariante de la Especificación de que este aviso nunca bloquea nada.
5. **Confirmando** — cuenta regresiva con el botón CANCELAR y el mensaje
   real que se enviaría (`EV_MENSAJES`).
6. **Enviado** — accountability en vivo (ok/ayuda/pendiente).
7. **Menú** — navegación a Historial/Diagnóstico/Configuración.

Las 7 capturas se revisaron una por una — coinciden con el diseño del
wireframe de Cowork. Servidor de prueba y capturas borrados al terminar.

## Historial, Diagnóstico y Configuración PROG1–4 (2026-08-28)

Las tres secciones que quedaban en "no construido todavía" ya muestran
datos reales:

- **Historial** — bitácora local de esta consola (`lib/historialLocal.ts`,
  SQLite propio, misma tabla que sobrevive un restart que `padronCache`).
  Se registra una fila en `index.ts` en los dos puntos donde
  `logic/panel.ts` produce un resultado terminal: al publicar un evento
  (`resultado: "enviado"`, mismo `eventoId`/`ts` que el MQTT real) y al
  cancelar una cuenta regresiva (`resultado: "cancelado_local"`,
  `eventoId` propio porque invariante 3 dice que ese camino nunca genera
  un evento real). Más recientes primero, límite 20.
- **Diagnóstico** — conectividad con el backend (`mqttConectado`, de los
  eventos `connect`/`close` del cliente MQTT), heartbeat del ESP32 (ya
  existía), un botón "PROBAR" que pulsa el relé 500ms
  (`POST /diagnostico/sirena` → `probarSirena()` en `index.ts` — **no** es
  un disparo: no pasa por `reducirPanel`, no genera evento, no toca MQTT,
  invariante 1 intacta) y batería/UPS mostrado honestamente como "N/D"
  (ver "Qué falta").
- **Configuración PROG1–4** — de solo lectura, refleja
  `consolas/{id}/prog` (ver backend-server README, "Sincronización de
  PROG1-4"). **Decisión tomada:** no se construye un teclado táctil para
  editar esto en la consola — la asignación se administra centralizada
  (hoy por SQL, mañana por una pantalla de administración en Frontend
  Web) y llega sola por MQTT retained, igual que el padrón. La consola
  solo la muestra y la usa.
- **`tipoEventoDeBoton`** (`index.ts`) ahora resuelve PROG1–4 contra el
  `prog` cacheado — si hay una asignación manda el nombre real del tipo
  de evento; sin asignar (o para los botones fijos INCENDIO/SISMO/MEDICO/
  TOXICO/OK) sigue mandando el nombre literal del botón, como antes.

Validado contra Supabase + Mosquitto reales (ver backend-server README,
"Sincronización de PROG1-4"): con PROG1 → Tóxico asignado temporalmente en
Bunker, confirmado que el mensaje retained en `consolas/{id}/prog` llegó
con `{"prog1":"Tóxico", ...}` — la lógica de `tipoEventoDeBoton` se
ejercitó leyendo ese mismo payload (no hace falta hardware para probar una
función pura). Historial y Diagnóstico/Configuración se validaron
visualmente con Playwright contra el `lib/pantalla.ts` +
`pantalla/index.html` reales (mismo criterio que las 7 pantallas
anteriores): `HistorialLocal` real contra un SQLite temporal con dos filas
insertadas por su propia API (una "enviado", una "cancelado_local"),
`prog` con PROG1 asignado, `mqttConectado: true`. Confirmado en las
capturas: Historial muestra ambas filas con su resultado y legajo
correctos; Diagnóstico muestra "CONECTADO"/"OK" y, tras tocar PROBAR,
"ULTIMA PRUEBA: OK"; Configuración muestra "PROG1 → Tóxico" y
"PROG2/3/4 → sin asignar". Ninguna de las tres dice ya "no construido
todavía". Dato de prueba de Bunker (`prog_config`) revertido a `null` al
terminar — confirmado el retained volviendo a todo `null`. `npm run
typecheck` limpio, 25/25 tests (sin tests nuevos: todo lo agregado es
wiring de I/O en `index.ts`/`pantalla.ts`/HTML, no lógica pura nueva —
`HistorialLocal` y el mapeo PROG ya se ejercitaron contra infra real
arriba).

### Decisión de diseño encontrada al adaptar el wireframe

El wireframe original tenía un ícono de candado en la pantalla que se
podía tocar para simular girar la llave — eso viola el invariante 5
("el PIN es la única autoridad para habilitar el panel", y la llave es
física). En la pantalla real ese ícono es **puramente informativo** — no
tiene `data-act`, no hace nada al tocarlo. También se sacó la sección de
"panel físico" que el wireframe dibujaba debajo de la pantalla (los 10
botones + la llave, para mostrar cómo se ve el mueble completo en la
demo) — la pantalla real solo sirve la pantalla, el panel físico existe
de verdad al lado, no hace falta dibujarlo.

## Timeout del heartbeat del ESP32 (2026-08-28)

Encontrado al escribir `esp32-firmware/` (el firmware real): `esp32.onEvento`
solo actualizaba `esp32HeartbeatOk` cuando LLEGABA un heartbeat — si el
ESP32 se cuelga o se desconecta el UART (deja de mandar heartbeats por
completo, no manda uno con `ok:false`), `esp32HeartbeatOk` se quedaba
pegado en el último valor conocido para siempre, y tanto Diagnóstico
(pantalla) como el heartbeat MQTT de la propia consola seguían
reportando "OK" de mentira.

Agregado `logic/heartbeatEsp32.ts` (`heartbeatEsp32Vencido`, pura) +
`chequearHeartbeatEsp32Vencido` en `index.ts` — un `setInterval` cada 1s
que, si `esp32HeartbeatOk` está en `true` pero pasaron más de
`ESP32_HEARTBEAT_TIMEOUT_MS` (6s = 3x el intervalo con el que manda su
heartbeat el firmware real, `HEARTBEAT_MS=2000` en
`esp32-firmware/src/main.cpp`) desde el último heartbeat recibido, lo
pasa a `false` y notifica a la pantalla. Margen de 3x para tolerar 1-2
heartbeats perdidos por ruido en el UART sin marcar "sin respuesta" de
más.

4 tests nuevos en `logic/heartbeatEsp32.ts` (null siempre vencido, dentro
del umbral, pasado el umbral, exactamente en el límite). El wiring en sí
(dos líneas: guardar el timestamp al recibir un heartbeat, llamar a la
función pura desde el `setInterval`) no se validó contra un proceso
corriendo — el estado (`esp32HeartbeatOk`, `ultimoHeartbeatEsp32Ts`) es
privado a `index.ts` y exponerlo solo para este test no se justificaba;
la lógica de decisión en sí, que es donde está el riesgo real, sí está
100% cubierta por los 4 tests. `npm run typecheck` limpio, 29/29 tests.

## Decisiones pendientes (para no perderlas de vista)

- **Duración de la cuenta regresiva** — 5s, tomado del wireframe de
  pantalla, no confirmado con el cliente como el valor real de producción.
- **¿El relé local se activa apenas se confirma el envío, o espera la
  confirmación del backend?** Hoy espera — más conservador (nunca suena
  antes de que el evento sea real), pero potencialmente más lento que lo
  que permitiría la "capa de seguridad independiente" si el ESP32 pudiera
  decidirlo solo. Sin resolver todavía.
- **Asignación de PROG1–4 — resuelto (2026-08-28):** se administra
  centralizada (por ahora SQL directo sobre `consolas.prog_config`, ver
  backend-server README), no desde la consola — la pantalla de
  Configuración es de solo lectura. Queda pendiente, del lado del backend,
  construir la pantalla de administración real en Frontend Web (hoy fuera
  de este repo).
- **Qué pasa ante varios PIN incorrectos seguidos** — la propia
  Especificación lo deja como pendiente (bloqueo temporal, aviso al
  backend, o ambos) — no implementado.
