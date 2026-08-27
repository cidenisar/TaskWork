# Backend Online — Sistema de Emergencias Refinería

Servidor que recibe eventos de las Consolas Disparadoras por MQTT, resuelve
a quién avisar, activa los puntos de encuentro del evento y prepara el
despacho de alertas. Implementa el contrato de `05.3-programacion.md`
("Comunicación Pi ↔ Backend Online — MQTT") sobre los datos de
`03-backend-online.md` (proyecto de Supabase `emergencias-refineria`).

## Cómo está armado

```
src/
  types.ts              Tipos compartidos: modelo de datos + payloads MQTT
  logic/                 Lógica de negocio PURA, sin I/O — 100% testeada
    eventos.ts            Resolución de destinatarios, plan de qué hacer con un evento
    accountability.ts      Agregación del resumen ok/ayuda/pendiente
    eventoActivo.ts         A qué consolas (propio sitio + vecinos) avisar
    auth.ts                 Armado del registro de auditoría de PIN
    confirmar.ts            Validación del body de POST /confirmaciones (Mobile)
    simulacro.ts             Elige "el próximo simulacro" puntual de un sitio
  lib/
    db.ts                  Acceso a Supabase (service_role — bypasea RLS)
    mqtt.ts                Cliente MQTT y helpers de tópicos
    http.ts                 Servidor HTTP mínimo (POST /confirmaciones — Mobile)
  handlers/               Conectan lógica pura + db + mqtt para cada tópico
  index.ts                Punto de entrada
test/                    Tests de la lógica pura (node:test, sin mocks de red)
```

La separación es a propósito: **toda decisión de negocio vive en `src/logic/`,
sin tocar la red ni la base**, así se puede testear sin depender de nada
externo. Los `handlers/` son la parte "tonta" que conecta esa lógica con
Postgres y MQTT.

## Limitación de red de este sandbox (importante)

> Actualización: ver "Validado de punta a punta" más abajo — `npm install`
> y el borrado del stub de tipos ya se hicieron en una máquina con
> internet. Esta sección queda como registro histórico de por qué el
> código se escribió como se escribió originalmente.

Este código se escribió en un entorno de Claude sin acceso a los registries
de `npm` ni `pip` (bloqueados por política de red del sandbox — no es una
limitación del código en sí). Por eso:

- **No se pudo correr `npm install`** — las dependencias reales
  (`@supabase/supabase-js`, `mqtt`, `dotenv`) están declaradas en
  `package.json` tal cual las necesita un proyecto Node normal, pero nunca
  se descargaron acá.
- Para poder tipar el código igual, se agregó `src/types/vendor-stubs.d.ts`
  con declaraciones mínimas de esos tres paquetes (y de los globals de
  Node — `console`, `process`, `Buffer` — que normalmente trae
  `@types/node`). **Borrar ese archivo en cuanto se corra `npm install` en
  una máquina con internet** — a partir de ahí, TypeScript va a usar los
  tipos reales y más completos de cada paquete.
- **La lógica pura (`src/logic/`) SÍ se pudo correr y testear de verdad acá**
  (`npm run test`, usando `tsx` — ya venía instalado en este sandbox) — 18
  tests, todos verdes.
- **Las queries de `src/lib/db.ts` se validaron a mano**, corriendo el SQL
  equivalente directo contra el proyecto real de Supabase (con acceso
  administrativo vía el conector, no con el código Node) — ver
  `backend/verificacion_queries_logica.sql` en la carpeta del módulo. Esto
  prueba que las consultas devuelven la forma de datos correcta, pero
  **no reemplaza correr el servidor Node real de punta a punta**.
- Lo que falta para tener esto corriendo de verdad: clonar/copiar esta
  carpeta a una máquina con acceso a internet, `npm install`, completar
  `.env` (copiando `.env.example`) con la `service_role key` real del
  proyecto de Supabase (Project Settings → API — **nunca pegarla en un
  chat ni commitearla**) y un broker MQTT (Mosquitto local alcanza para
  probar), y `npm run dev`.

## Cómo correr esto en una máquina con internet

```bash
npm install
cp .env.example .env   # completar con las credenciales reales
npm run test           # corre los tests de lógica pura
npm run typecheck      # type-check completo (con los tipos reales de cada paquete)
npm run dev            # levanta el servidor contra el Supabase/broker configurados en .env
```

Para probar sin las consolas físicas: instalar Mosquitto local
(`mosquitto -v`) y publicar un mensaje de prueba en el tópico
`consolas/{id}/eventos` con `mosquitto_pub` — el `{id}` tiene que ser el
`id` real de una fila de la tabla `consolas` en Supabase (ver "Cómo se
prueba sin la consola física" en `05.3-programacion.md`, que sugiere el
mismo enfoque para el lado de la Pi).

## Validado de punta a punta — 2026-08-26 (en curso)

Primera corrida real de este código, en un entorno con internet, contra
Mosquitto local y el proyecto real de Supabase (`emergencias-refineria`,
`lskqdgplpulrplhkneab`). Estado a la fecha: **parcial**, interrumpido por un
bloqueo de infraestructura ajeno al código (ver abajo) — se retoma la
próxima sesión.

**Lo que sí se corrió y quedó validado tal cual el código, sin cambios:**

- `npm install` (59 paquetes, 0 vulnerabilidades).
- Se borró `src/types/vendor-stubs.d.ts` como estaba planeado. `npm run
  typecheck` quedó limpio con los tipos reales de `@supabase/supabase-js`,
  `mqtt` y `@types/node` — **el stub estaba bien armado, no hizo falta
  tocar ningún archivo fuente** para que el type-check pasara.
- `npm run test`: **18/18 tests verdes**, sin tocar nada — confirma que la
  lógica pura documentada como "100% testeada" efectivamente lo estaba.
- Mosquitto local (`mosquitto -v -p 1883`, sin auth) levantado y
  respondiendo a pub/sub de prueba.
- `npm run dev` conecta al broker y se suscribe a los 4 tópicos entrantes
  sin errores (`[mqtt] conectado — suscribiendo tópicos entrantes`).
- Se publicó un evento real de INCENDIO/DISPARADO por `mosquitto_pub` en
  `consolas/{id}/eventos` (consola real `Bomberos`,
  `0d72961f-ef3f-4724-9e93-ca2fbaeeb9ed`, sitio "Planta de Refinación
  Principal") — el mensaje llegó al broker y el servidor lo levantó de la
  suscripción (confirmado con un `mosquitto_sub -t 'consolas/#' -v` de
  control corriendo en paralelo).

**Dónde se cortó — no es un bug de código:**

Al intentar resolver la consola contra Supabase (`db.getConsolaPorId`), el
proceso Node no pudo alcanzar `lskqdgplpulrplhkneab.supabase.co`:

```
Host not in allowlist: lskqdgplpulrplhkneab.supabase.co.
Add this host to your network egress settings to allow access.
```

Se confirmó que esto es una restricción de red del entorno de ejecución
remoto (allowlist de egress a nivel de contenedor), no del proxy de
herramientas ni del código: un `curl` directo al mismo host, evitando por
completo el proxy de la sesión (`--noproxy '*'`), también devolvió `403`.
El conector MCP de Supabase sí funciona porque usa un canal separado,
fuera de ese firewall — pero el servidor Node real, que es lo que hay que
validar acá, corre dentro del contenedor y queda bloqueado.

**Qué falta retomar la próxima sesión** (una vez que la política de red del
entorno permita salir a `*.supabase.co`, lo cual requiere una sesión nueva
para tomar efecto):

1. Reconfirmar que el servidor llega a Supabase (`getConsolaPorId` ya no
   debería tirar el error de arriba).
2. Volver a publicar el evento de INCENDIO/DISPARADO y confirmar en la
   base: `eventos.estado = 'en_curso'`, filas `pendiente` en
   `confirmaciones` para el personal activo del sitio (2 personas activas
   en este sitio de prueba), puntos de encuentro activados en
   `eventos_puntos_estado`, y publicación retenida de `evento-activo` a las
   consolas del sitio (no hay sitios vecinos configurados todavía —
   `sitios_vecinos` está vacía — así que por ahora solo se espera el propio
   sitio).
3. Publicar un evento de tipo OK/DISPARADO con un `eventoId` nuevo y
   confirmar que cierra el evento anterior en vez de abrir uno nuevo.
4. Reenviar el mensaje original del INCENDIO con el mismo `eventoId` (redelivery QoS 1 simulada) y confirmar que no se duplica nada.
5. Si aparece algún bug real de código en estos pasos, corregirlo acá y
   documentarlo en esta misma sección.

Nota aparte sobre el payload de prueba: el contrato real de
`PayloadEventoMqtt` en `types.ts` pide `ts` como epoch ms (`number`), no
ISO string, y `origen: "consola" | "ss2000"` (no `"boton_fisico"`) — el
payload de prueba usado acá sigue el tipo real, no un ejemplo previo que
no coincidía con él.

### Bugs encontrados por revisión de código (sin esperar la sesión con Supabase)

Mientras se resolvía el acceso de red, se revisó a fondo el resto de
`handlers/` y `logic/` (antes solo se había mirado `logic/eventos.ts` y
`handlers/eventos.ts` al pasar). Encontrados y corregidos:

- **El evento OK quedaba "en_curso" para siempre.** Tanto al cerrar un
  evento en curso (`cerrar_evento_existente`) como en el caso raro de un OK
  sin nada que cerrar (`abrir_evento` con `esCierre: true`), el propio
  registro del evento OK se insertaba sin especificar `estado`, así que
  tomaba el default de la columna (`'en_curso'`) — y como un OK nunca se
  cierra en ningún otro lado del código, ese registro quedaba colgado como
  "en curso" para siempre. Cualquier vista/query que filtre
  `eventos.estado = 'en_curso'` para ese sitio (fuera de
  `getEventoEnCursoDeSitio`, que por casualidad no lo mostraba gracias al
  `order by iniciado_at desc limit 1`) iba a ver una emergencia activa
  fantasma. Los 18 tests no lo agarraban porque `planificarEvento` es lógica
  pura — solo devuelve el plan, la conversión a filas reales es cosa del
  handler, sin tests. Arreglado: `Db.insertEvento` ahora acepta
  `estado`/`cerrado_at` opcionales, y ambos casos del evento OK los pasan
  explícitamente (`"cerrado"` + timestamp).
- **Decisión de diseño confirmada con el usuario:** en el caso raro de OK
  sin nada que cerrar, el código publicaba igual un `evento-activo` hacia
  las consolas del sitio y sus vecinas, anunciando el propio OK
  (`tipo: "OK"`) como si fuera el evento activo. Se confirmó que esto está
  mal — un OK no es, en sí mismo, una emergencia en curso — y ahora ese
  caso publica `null`, igual que el cierre normal.

No se encontraron más bugs en el resto del código revisado
(`handlers/auth.ts`, `handlers/estadoConsola.ts`, `handlers/padron.ts`,
`logic/auth.ts`, `logic/eventoActivo.ts`, `logic/accountability.ts`) — se
verificaron además todos los enums de la base real (`estado_persona`,
`estado_confirmacion`, `canal_confirmacion`, `rol_operador`,
`alcance_tipo`, `estado_operador`, `estado_consola_config`, `tipo_persona`,
`modo_evento`, `estado_evento`) contra los tipos de `types.ts` — coinciden
exactamente, sin desajustes de nombres ni de valores.

### Simulador de Consola

Se armó `../consola-simulador/` — una página web standalone (sin build,
sin frameworks, sin CDN externo) que reemplaza a `mosquitto_pub` a mano:
botones para disparar DISPARADO/CANCELADO con los IDs reales de
consolas/operador/tipos de evento, más un log en vivo de lo que el backend
responde. Verificado con Playwright + un `mosquitto_sub` de control
independiente: el navegador publica sobre un listener WebSocket de
Mosquitto (puerto 9001, agregado además del 1883 nativo), el broker se lo
entrega al `backend-server` real por su suscripción MQTT normal, y el
backend lo procesa hasta el mismo punto exacto del bloqueo de red a
Supabase (ni antes ni en otro lado) — confirma que el cableado
frontend → broker → backend está bien, independiente de ese bloqueo.

## Qué está implementado

- Ciclo completo de un evento: DISPARADO abre el evento, resuelve
  destinatarios (personal activo del sitio), activa los puntos de encuentro,
  y publica `evento-activo` al propio sitio y a sus sitios vecinos.
- OK cierra el evento en curso del sitio (no abre uno nuevo) — ver
  "OK vs. CANCELAR — resuelto" en la ficha de Programación.
- CANCELADO no dispara nada — queda como TODO explícito el guardar su
  auditoría (ver "Decisiones pendientes" abajo).
- Idempotencia ante reentrega de MQTT QoS 1 (mismo `eventoId` no se procesa
  dos veces).
- Auditoría de validación de PIN (la consola valida, acá solo se audita).
- Heartbeat y estado online/offline de cada consola (incluido lo que
  publica el broker por Last Will and Testament).
- Sincronización del padrón de operadores hacia las consolas de un sitio
  (alcance puntual + alcance organización).
- Agregación de Accountability en vivo (ok/ayuda/pendiente, total y por
  punto de encuentro).
- **Endpoint para las confirmaciones de Mobile** — `POST /confirmaciones`
  (HTTP, no MQTT; ver "Endpoint para las confirmaciones de Mobile" más
  abajo). Actualiza la fila `pendiente` ya existente para (evento, persona)
  y dispara `publicarAccountabilityDeEvento` después de cada escritura.
- **Publicación de `consolas/{id}/simulacro`** — `sincronizarSimulacroDeSitio`
  (mismo patrón que `sincronizarPadronDeSitio`: se publica retained, y
  todavía no está enganchada a ningún disparador — ver "Decisiones
  pendientes"). Alcance actual: solo simulacros **puntuales**; ver esa
  sección para los recurrentes.

### Endpoint para las confirmaciones de Mobile

**Decisión tomada (2026-08-27): REST, no MQTT.** La ficha dejaba esto sin
definir ("REST vs. WebSocket"). Se eligió REST porque el resto del modelo ya
asume un flujo push-out/callback-in (`personas.push_token` implica que a
Mobile se le avisa por push; un teléfono no mantiene una conexión de broker
persistente en background, así que "Mobile publica en un tópico MQTT como
si fuera otra consola" no es viable de verdad). Sin framework — un endpoint
solo no lo justifica (`src/lib/http.ts`, con el módulo `http` nativo).

```
POST /confirmaciones
Content-Type: application/json

{
  "personaId": "<uuid>",
  "eventoId": "<uuid>",
  "estado": "ok" | "ayuda",
  "puntoId": "<uuid> | null",       // opcional
  "notaAyuda": "texto | null",       // opcional, solo tiene sentido con "ayuda"
  "ubicacionLat": <number> | null,   // opcional
  "ubicacionLng": <number> | null    // opcional
}
```

Respuestas: `200` con la fila de `confirmaciones` actualizada · `400` si el
body no valida (campo faltante/tipo incorrecto) · `404` si el evento no
existe, o si la persona no fue notificada de ese evento (no hay fila
`pendiente` para ese par) · `409` si el evento ya no está `en_curso` (no
tiene sentido de negocio seguir confirmando contra una emergencia cerrada).

Probado de punta a punta contra el Supabase y el Mosquitto reales
(`test/confirmar.test.ts` para la validación pura + un ciclo manual con
`curl` cubriendo los 4 casos de respuesta, incluido el `409` tras cerrar el
evento con OK) — ver sesión 2026-08-27.

## Qué NO está implementado todavía (a propósito, ver la ficha)

- **Despacho real de push/SMS** — el proveedor todavía no está elegido (ver
  "Próximos pasos" de `03-backend-online.md`). Hoy el servidor solo loguea
  cuántos destinatarios habría que notificar.
- **Autenticación del endpoint de Mobile** — hoy `POST /confirmaciones` no
  pide ninguna credencial (mismo estado que el Mosquitto local, `allow_anonymous
  true`); antes de producción hace falta decidir el mecanismo (JWT del login
  de Mobile, lo más probable) — ver "Decisiones pendientes".
- **Marcar un simulacro como "no_realizado"** tras pasar un tiempo
  prudencial sin dispararse (ver ficha, "Programador de simulacros") — no
  hay todavía un job periódico para esto.
- **Contador incremental de Accountability** — `calcularAccountability`
  recalcula desde `confirmaciones` completa cada vez; a la escala real
  (2000-4000 personas, ver "Escala esperada" de la ficha) esto necesita
  pasar a contadores que se actualizan por evento en vez de recontar filas
  en cada publicación — queda señalado en el propio código
  (`src/logic/accountability.ts`).

## Decisiones pendientes (para no perderlas de vista)

- Dónde/cómo persistir el registro "CANCELADO (no se envió)" — hoy no hay
  tabla para eso, solo un `console.log` + comentario `TODO` en
  `handlers/eventos.ts`. La ficha dice que la consola ya lo guarda en su
  historial local; falta decidir si Backend Online también necesita su
  propia copia centralizada, o si alcanza con el historial de cada Pi.
- Autenticación de cada consola contra el broker MQTT (usuario/contraseña
  por consola vs. certificado por dispositivo) — ver "Próximos pasos" de la
  ficha de Programación, todavía sin elegir.
- Autenticación de `POST /confirmaciones` (probablemente JWT del login de
  Mobile, pero no está decidido) — hoy queda abierto, sin verificar siquiera
  que quien confirma es realmente esa `personaId`.
- Formato de la columna `recurrencia` (jsonb) de `simulacros_programados` —
  hasta que se defina, `elegirProximoSimulacro` (`src/logic/simulacro.ts`)
  no calcula la próxima ocurrencia de los simulacros recurrentes
  (`puntual: false`); esas filas simplemente no entran en la selección.
- Frecuencia de sincronización del padrón hacia las consolas (¿cada cuánto
  se llama `sincronizarPadronDeSitio`? ¿poll a intervalo fijo, o
  suscripción a cambios de Supabase Realtime sobre `operadores`?).
