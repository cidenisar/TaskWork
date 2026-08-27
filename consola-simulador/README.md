# Simulador de Consola

Página estática (sin build, sin dependencias de servidor) que reemplaza a
`mosquitto_pub` a mano para probar `backend-server/` — dispara eventos
reales por MQTT sobre WebSocket y muestra en vivo lo que el backend
responde (`evento-activo`, `accountability/#`, `simulacro`, `padron`).

No es un frontend de producción — es una herramienta de desarrollo para
iterar más rápido sobre el ciclo de eventos.

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

## Cómo correrlo

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

`mqtt.min.js` es el bundle de browser de la librería `mqtt` (la misma que
usa `backend-server`, copiado de su `node_modules/mqtt/dist/mqtt.min.js`)
— así no depende de ningún CDN externo.

## Qué IDs usa

Los de las filas reales de `consolas`/`operadores`/`tipos_evento` del
proyecto Supabase `emergencias-refineria` (datos de prueba ya cargados).
Si se agregan más consolas u operadores de prueba, hay que sumarlos a mano
en los `<select>` de `index.html` — es intencional que sea así de simple,
no vale la pena traer un framework para esto.
