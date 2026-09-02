# Simulador de Consola

Dos herramientas de desarrollo, sin build, para probar `backend-server/`
sin la Raspberry Pi/ESP32 físicos:

- **`index.html`** — formulario crudo (dropdowns, sin UX de consola real)
  que reemplaza a `mosquitto_pub` a mano: dispara eventos reales por MQTT
  sobre WebSocket y muestra en vivo lo que el backend responde
  (`evento-activo`, `accountability/#`, `simulacro`, `padron`). Pensado
  para iterar rápido sobre el ciclo de eventos, no para verlo "andar".
- **`consola-virtual.html`** (2026-08-30) — la experiencia real de la
  consola física (llave → PIN → botón → cuenta regresiva → envío), pero
  100% en el navegador: puerto fiel de la máquina de estados de
  `consola-pi/src/logic/panel.ts`. Pensada para *ver* el flujo completo
  funcionando sin ningún hardware — ver más abajo.

Ninguna de las dos es un frontend de producción.

## Panel "Estado en vivo de la consola"

Además del log crudo de la actividad del broker, hay un panel del medio
que traduce los payloads a lo que una consola física haría con ellos —
agregado (2026-08-27) para poder probar de punta a punta el simulacro
sorpresa/escenario/relé de `backend-server` sin tener que leer JSON a
mano:

- **Lámpara de relé/sirena** — se enciende (roja, parpadeando) cuando el
  último `evento-activo` recibido trae `activarRele: true`; simula la
  salida física que en la consola real se conectaría a una sirena o a una
  entrada del SS2000 (ver `backend-server/README.md`, "Simulacro
  sorpresa, escenario y relé/sirena").
- **Evento activo** — si el `evento-activo` tiene `escenario` (la
  narrativa que carga quien programa el simulacro), se muestra en un
  recuadro destacado arriba de la ficha del evento.
- **Próximo simulacro programado** — lo que llega por
  `consolas/{id}/simulacro` (retained). Los simulacros `sorpresa` nunca
  aparecen acá (el backend los excluye a propósito de este broadcast
  anticipado — ver `elegirProximoSimulacro`), así que no hay riesgo de
  arruinar la sorpresa mostrándola en este panel.

Para probar el flujo completo de un simulacro programado disparándose de
verdad (no solo un evento suelto), el formulario de la izquierda tiene un
campo **"ID de simulacro programado"** — completarlo con el `id` real de
una fila de `simulacros_programados` liga el evento a ella: el backend la
marca `realizado`, genera la próxima ocurrencia si es recurrente, y usa
su `escenario`/tipo para `evento-activo` (relé incluido, si el tipo lo
tiene configurado).

## Cómo correr `index.html` (el formulario crudo)

Necesita Mosquitto con un listener de **WebSocket**, no solo el 1883 nativo
que usa `backend-server`. Ejemplo de config (`mosquitto -c archivo.conf -v`):

```
listener 1883
protocol mqtt

listener 9001
protocol websockets

plugin /usr/lib/x86_64-linux-gnu/mosquitto_dynamic_security.so
plugin_opt_config_file /ruta/a/dynamic-security.json
```

**Desde que se agregó autenticación (ver `backend-server/README.md`,
"Autenticación de las consolas contra Mosquitto"), ya no acepta anónimos.**
Cada consola es su propia identidad MQTT — usuario = su `id` (el mismo de
la tabla `consolas`), contraseña la que haya dado
`backend-server/scripts/provisionar-consola.sh` para esa consola. La
página pide esa contraseña antes de conectar (botón "Conectar"); para
simular otra consola, recargar la página y elegir otra del `<select>`.

Con Mosquitto corriendo así, servir esta carpeta como estático (cualquier
server sirve, por ejemplo `python3 -m http.server 8080` parado acá
adentro) y abrir `http://localhost:8080` en el navegador.

## Cómo correr `consola-virtual.html` (la experiencia real, sin hardware)

A propósito **no** pide la autenticación por usuario/contraseña de
Mosquitto que pide `index.html` — está pensada para levantarse rápido en
la máquina de cualquiera (sin instalar/configurar Mosquitto a mano), así
que trae su propio broker mínimo **sin autenticación**, `broker-local.mjs`
(`aedes`, puro Node, sin dependencias nativas — corre en Windows sin
herramientas de compilación):

```bash
cd consola-simulador
npm install
npm run broker    # deja corriendo mqtt://localhost:1883 (TCP, para backend-server) y ws://localhost:9001 (WS, para el navegador)
```

En otra terminal, `backend-server` apuntado al mismo broker (su
`.env.example` ya trae `MQTT_URL=mqtt://localhost:1883` por default, no
hace falta tocar nada):

```bash
cd ../backend-server
npm run dev
```

Y en una tercera, esta carpeta servida como estático (igual que arriba):

```bash
cd ../consola-simulador
python3 -m http.server 8080
```

Abrir `http://localhost:8080/consola-virtual.html`. Trae un operador de
prueba real ya cargado (PIN `1234`, vinculado a la consola "Bomberos" de
"Planta de Refinación Principal" — org real `emergencias-refineria`) —
girar la llave a "Habilitado", tipear el PIN, apretar un botón, esperar
la cuenta regresiva. El evento que dispara es **real**: llega a
`backend-server`, crea una fila de verdad en `eventos`, genera
`confirmaciones` para el personal del sitio, etc. — se recomienda modo
`SIMULACRO` (selector arriba de la página) para no confundirlo con una
emergencia real en el historial.

**`broker-local.mjs` es solo para desarrollo/demo local — nunca para
producción** (sin autenticación, sin TLS, pensado para correr en la
misma máquina que lo prueba). La autenticación real de una consola
física sigue siendo Mosquitto + dynamic-security, como documenta
`backend-server/README.md`.

Validado de punta a punta (2026-08-30): un evento disparado desde
`consola-virtual.html` contra este broker llegó real a Supabase (fila en
`eventos`, `confirmaciones` generadas) — datos de prueba borrados
después de confirmar.

`mqtt.min.js` (usado por ambas páginas) es el bundle de browser de la
librería `mqtt` (la misma que usa `backend-server`, copiado de su
`node_modules/mqtt/dist/mqtt.min.js`) — así no depende de ningún CDN
externo.

## Qué IDs usa

Los de las filas reales de `consolas`/`operadores`/`tipos_evento` del
proyecto Supabase `emergencias-refineria` (datos de prueba ya cargados).
Si se agregan más consolas u operadores de prueba, hay que sumarlos a mano
en los `<select>`/config de `index.html`/`consola-virtual.html` — es
intencional que sea así de simple, no vale la pena traer un framework
para esto.
