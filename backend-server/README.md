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
    despacho.ts              Arma el texto del push/SMS de un evento
  lib/
    db.ts                  Acceso a Supabase (service_role — bypasea RLS)
    mqtt.ts                Cliente MQTT y helpers de tópicos
    http.ts                 Servidor HTTP mínimo (POST /confirmaciones — Mobile)
    push.ts                 Wrapper de Firebase Cloud Messaging
    sms.ts                  Wrapper de Twilio
    despachador.ts           Decide push vs. SMS por persona y despacha
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

Para probar sin las consolas físicas: instalar Mosquitto local con el
plugin dynamic-security (ver "Autenticación de las consolas contra
Mosquitto" más abajo — ya no acepta anónimos) y publicar un mensaje de
prueba en el tópico `consolas/{id}/eventos` con `mosquitto_pub -u <id> -P
<password>` — el `{id}` tiene que ser el `id` real de una fila de la tabla
`consolas` en Supabase, provisionada con `scripts/provisionar-consola.sh`
(ver "Cómo se prueba sin la consola física" en `05.3-programacion.md`, que
sugiere el mismo enfoque para el lado de la Pi).

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
- **Despacho real de push/SMS** — ver "Despacho real de push/SMS" más abajo.
- **Autenticación de las consolas contra Mosquitto** — usuario/contraseña
  por consola vía dynamic-security; ver esa sección más abajo.
- **Marcar un simulacro como "no_realizado"** tras 1h sin dispararse —
  barrido periódico, ver esa sección más abajo.

### Despacho real de push/SMS

**Decisión tomada (2026-08-27): Firebase Cloud Messaging (push) + Twilio
(SMS)**. Reemplaza el `console.log` que antes solo contaba destinatarios —
ver `src/lib/push.ts`, `src/lib/sms.ts` (wrappers finos de cada SDK, mismo
criterio que `lib/db.ts` sobre `@supabase/supabase-js`), `src/lib/despachador.ts`
(decide push vs. SMS por persona con `canalDePersona`, ya existente) y
`src/logic/despacho.ts` (arma el texto — pura, testeada; la redacción es una
primera versión, no viene de ninguna ficha).

Se dispara desde `handlers/eventos.ts` en el mismo punto donde antes estaba
el log: al abrir un evento (no-OK), a cada persona activa del sitio, en
paralelo. Un fallo individual (token de push inválido, número que Twilio
rechaza, credenciales faltantes) no aborta el resto — se loguea por
persona y el evento sigue su curso normal (confirmaciones y puntos de
encuentro se crean igual). **Si `FIREBASE_*`/`TWILIO_*` no están en `.env`,
el servidor arranca igual** (loguea un warning una vez al boot) y cada
intento de despacho falla con un error explícito — a propósito, para que
el resto del backend no dependa de tener estas credenciales.

**Validado hasta ahora**: el camino de fallo gracioso (sin credenciales) —
confirmado que un evento real se abre, crea sus 2 confirmaciones, y reporta
`despachado a 0/2 destinatarios (2 fallidos)` con la razón exacta por
persona, sin afectar el resto del pipeline.

**Push (Firebase) — credenciales reales cargadas y probadas (2026-08-27):**
con el Service Account real del usuario, el evento se disparó contra el
personal de prueba (`push_token: "tok-abc"`, no un token de dispositivo
real). La respuesta fue un `400` de los servidores reales de Google
(`FirebaseMessagingError: messaging/invalid-argument`, `"The registration
token is not a valid FCM registration token"`) — **prueba que las
credenciales autentican correctamente**: un secreto mal armado da `401`,
no un rechazo de negocio sobre el token. Falta la prueba de un dispositivo
real (necesita la app de Mobile pidiendo un token FCM de verdad), pero la
integración con Firebase en sí ya está confirmada de punta a punta.

**SMS (Twilio) — todavía sin probar.** El usuario no pudo terminar de crear
la cuenta (se frena en la verificación de segundo factor de Twilio) — no es
un problema del código, sigue bloqueado del lado de la cuenta. El camino
de fallo gracioso (sin `TWILIO_*`) ya está validado igual que push.

**Nota aparte, encontrada al revisar este código (no se tocó todavía):**
la ficha dice que "OK es un tipo de evento real más, con despacho
completo" (ver comentario en `handlers/eventos.ts`), pero el código actual
—desde antes de este cambio— **no despacha nada cuando se procesa un OK**
(ni al cerrar un evento en curso, ni en el caso raro de un OK sin nada que
cerrar): ese bloque de despacho solo corre para el `abrir_evento` original,
no-OK. No lo cambié porque es una decisión de alcance aparte (¿"despacho
completo" de OK significa el mismo push/SMS que abrió el evento, o un
mensaje distinto tipo "todo despejado"?) — queda para la próxima vez que
se toque este ítem puntual.

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
Authorization: Bearer <JWT de Supabase Auth>

{
  "eventoId": "<uuid>",
  "estado": "ok" | "ayuda",
  "puntoId": "<uuid> | null",       // opcional
  "notaAyuda": "texto | null",       // opcional, solo tiene sentido con "ayuda"
  "ubicacionLat": <number> | null,   // opcional
  "ubicacionLng": <number> | null    // opcional
}
```

Nótese que **no hay `personaId` en el body** — se deriva del JWT (ver
"Autenticación" abajo), justamente para que nadie pueda confirmar en
nombre de otra persona con solo cambiar un campo del request.

Respuestas: `200` con la fila de `confirmaciones` actualizada · `400` si el
body no valida (campo faltante/tipo incorrecto) · `401` si falta el header
`Authorization` o el token es inválido/expiró · `403` si el token es válido
pero esa cuenta no está vinculada a ninguna persona del padrón · `404` si
el evento no existe, o si la persona no fue notificada de ese evento (no
hay fila `pendiente` para ese par) · `409` si el evento ya no está
`en_curso` (no tiene sentido de negocio seguir confirmando contra una
emergencia cerrada).

Probado de punta a punta contra el Supabase y el Mosquitto reales
(`test/confirmar.test.ts` para la validación pura + un ciclo manual con
`curl` cubriendo los 6 casos de respuesta posibles, incluido el `409` tras
cerrar el evento con OK) — ver sesión 2026-08-27.

#### Autenticación de `POST /confirmaciones`

**Decisión tomada (2026-08-27): JWT de Supabase Auth.** El backend no
verifica la firma a mano (evita depender de si el proyecto usa un secreto
HS256 compartido o claves asimétricas/JWKS — de hecho este proyecto ya usa
claves asimétricas, `alg: ES256`, se confirmó al probarlo): en cambio llama
a `auth.getUser(token)` con el cliente `service_role` ya existente, que
valida contra el propio servidor de Auth de Supabase (`Db.verificarJwtMobile`).

Encontrado al implementar esto: la tabla `personas` (el padrón grande, a
diferencia de `operadores` que sí tenía `auth_user_id`) no tenía forma de
mapear una cuenta de Supabase Auth a una fila de `personas`. Se agregó
esta migración (aplicada directamente sobre el proyecto, no hay carpeta de
migraciones en este repo):

```sql
alter table public.personas
  add column auth_user_id uuid references auth.users(id);

create unique index personas_auth_user_id_key on public.personas (auth_user_id);
```

Nullable a propósito: no todas las personas tienen cuenta de Mobile
todavía (ej. `origen: alta_manual` sin autoregistro). `Db.getPersonaPorAuthUserId`
resuelve el `auth_user_id` del token a la fila de `personas` — si no hay
ninguna, `403`.

Validado de punta a punta con un usuario real: creado con
`admin.auth.admin.createUser` + `signInWithPassword` (vía el cliente
`anon`) para obtener un JWT real, vinculado a una persona de prueba, y
probados los 4 casos (sin header → `401`, token basura → `401`, token
válido sin persona vinculada → `403`, token válido + persona vinculada +
evento real → `200` con el `persona_id` correcto). Usuario y vínculo de
prueba borrados al terminar.

### Autenticación de las consolas contra Mosquitto

**Decisión tomada (2026-08-27): usuario/contraseña por consola**, vía el
plugin **dynamic-security** que ya viene con Mosquitto 2.x (sin bajar nada
de terceros — mismo criterio de "no traer infraestructura que no hace
falta" que el resto del proyecto). Se descartó certificado por dispositivo
(mTLS): mucha más infraestructura (CA propia, emisión/rotación de
certificados) para 5 consolas en 3 sitios.

**Hallazgo real al implementarlo:** el plan original era un solo rol
`consola` compartido, con ACLs con plantilla (`consolas/%u/eventos`, donde
`%u` se sustituye por el username al conectar — según la documentación de
dynamic-security). Probado de forma aislada (rol + cliente de prueba,
ACL `test/%u` vs. `test/literal`): **la sustitución `%u`/`%c` no se aplica
en Mosquitto 2.0.18** — la ACL con plantilla deniega siempre, la literal
funciona. Se pivotó a **un rol por consola** (`consola-{consolaId}`, con el
id ya resuelto en el tópico) — más roles, pero funciona de verdad y es
igual de simple de automatizar (ver `scripts/provisionar-consola.sh`).

**Bootstrap del broker (una sola vez, no está scripteado — es
infraestructura, no código de la app):**

```
# mosquitto.conf
listener 1883
protocol mqtt
allow_anonymous false      # false una vez que ya provisionaste todo

listener 9001
protocol websockets
allow_anonymous false

plugin /usr/lib/x86_64-linux-gnu/mosquitto_dynamic_security.so
plugin_opt_config_file /ruta/persistente/dynamic-security.json
```

```bash
# 1. Crea el archivo de config con un admin de dynsec (guardar esta
#    contraseña aparte — es la que abre/cierra todo lo demás).
mosquitto_ctrl dynsec init dynamic-security.json <admin-user> <admin-pass>

# 2. Con el broker ya corriendo con ese plugin+config, crear el rol del
#    propio backend (acceso amplio, pero acotado al árbol consolas/*) y su
#    cliente — MQTT_USERNAME/MQTT_PASSWORD del .env del backend salen de acá.
mosquitto_ctrl -u <admin-user> -P <admin-pass> dynsec createRole backend
mosquitto_ctrl -u <admin-user> -P <admin-pass> dynsec addRoleACL backend subscribePattern "consolas/+/eventos" allow
mosquitto_ctrl -u <admin-user> -P <admin-pass> dynsec addRoleACL backend subscribePattern "consolas/+/auth" allow
mosquitto_ctrl -u <admin-user> -P <admin-pass> dynsec addRoleACL backend subscribePattern "consolas/+/heartbeat" allow
mosquitto_ctrl -u <admin-user> -P <admin-pass> dynsec addRoleACL backend subscribePattern "consolas/+/estado" allow
mosquitto_ctrl -u <admin-user> -P <admin-pass> dynsec addRoleACL backend publishClientSend "consolas/+/padron" allow
mosquitto_ctrl -u <admin-user> -P <admin-pass> dynsec addRoleACL backend publishClientSend "consolas/+/simulacro" allow
mosquitto_ctrl -u <admin-user> -P <admin-pass> dynsec addRoleACL backend publishClientSend "consolas/+/evento-activo" allow
mosquitto_ctrl -u <admin-user> -P <admin-pass> dynsec addRoleACL backend publishClientSend "consolas/+/accountability/+" allow
mosquitto_ctrl -u <admin-user> -P <admin-pass> dynsec createClient backend -p <una-contraseña-random>
mosquitto_ctrl -u <admin-user> -P <admin-pass> dynsec addClientRole backend backend

# 3. Cada consola nueva (repetible):
DYNSEC_ADMIN_USER=<admin-user> DYNSEC_ADMIN_PASS=<admin-pass> \
  ./scripts/provisionar-consola.sh <consolaId>
```

`scripts/provisionar-consola.sh` crea el rol `consola-{id}` (las 8 ACLs:
publicar en sus 4 tópicos entrantes, suscribirse a sus 4 salientes), el
cliente con una contraseña generada, y se la asigna — la imprime una sola
vez (dynsec no la devuelve de nuevo; solo se puede resetear con
`setClientPassword`). Esa contraseña va en la config MQTT de la Pi de esa
consola, nunca en este repo.

`consola-simulador/` se actualizó para pedir esa contraseña antes de
conectar (ver su propio README) — ya no puede conectar anónimo.

**Validado de punta a punta:** con las 5 consolas reales del proyecto
provisionadas — publicar en el propio tópico funciona (el backend procesa
el evento normalmente); publicar en el tópico de OTRA consola con las
credenciales de la primera es denegado por el broker (`rc135`, `Denied
PUBLISH` en el log) sin llegar nunca al backend; un cliente sin
credenciales es rechazado en el `CONNECT` (`Connection Refused: not
authorised`); probado también desde la UI real de `consola-simulador`
(contraseña incorrecta → no conecta; correcta → ciclo completo, incluida
la recepción de `evento-activo`).

- **Marcar un simulacro como "no_realizado"** — `marcarSimulacrosVencidosComoNoRealizados`
  (`src/handlers/simulacro.ts`), enganchada a un `setInterval` en `index.ts`
  (cada 15 min, más una corrida al arrancar). **Decisión tomada
  (2026-08-27): margen de 1 hora** tras la `fecha_hora` programada — ver
  `logic/simulacro.ts`, `MARGEN_NO_REALIZADO_MS`. Mismo alcance que
  `elegirProximoSimulacro`: solo simulacros puntuales.

  Validado contra Supabase real: insertado un simulacro con `fecha_hora`
  2h en el pasado — al reiniciar el backend, el barrido inicial lo marcó
  `no_realizado` (`[simulacros] marcados no_realizado: 1`). Insertado un
  segundo con `fecha_hora` 30 min en el pasado (dentro del margen) — un
  segundo reinicio no lo tocó, confirma que el límite de 1h se respeta.

## Qué NO está implementado todavía (a propósito, ver la ficha)

- **Contador incremental de Accountability** — `calcularAccountability`
  recalcula desde `confirmaciones` completa cada vez; a la escala real
  (2000-4000 personas, ver "Escala esperada" de la ficha) esto necesita
  pasar a contadores que se actualizan por evento en vez de recontar filas
  en cada publicación — queda señalado en el propio código
  (`src/logic/accountability.ts`). **Revisado con el usuario (2026-08-27):
  confirmado que sigue sin ser prioridad** con los volúmenes de prueba
  actuales — se deja documentado, no se implementa todavía.

## Decisiones pendientes (para no perderlas de vista)

- Formato de la columna `recurrencia` (jsonb) de `simulacros_programados` —
  hasta que se defina, `elegirProximoSimulacro` (`src/logic/simulacro.ts`)
  no calcula la próxima ocurrencia de los simulacros recurrentes
  (`puntual: false`); esas filas simplemente no entran en la selección.
- Frecuencia de sincronización del padrón hacia las consolas (¿cada cuánto
  se llama `sincronizarPadronDeSitio`? ¿poll a intervalo fijo, o
  suscripción a cambios de Supabase Realtime sobre `operadores`?).
