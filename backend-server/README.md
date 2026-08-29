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
    simulacro.ts             "Próximo simulacro", vencidos, y la fila siguiente al resolverse uno recurrente
    recurrencia.ts            Motor de recurrencia: calcula la próxima ocurrencia de una regla
    despacho.ts              Arma el texto del push/SMS de un evento
    cumplimiento.ts           Agrupa el historial de simulacros por (sitio, tipo) y calcula alDia
  lib/
    db.ts                  Acceso a Supabase (service_role — bypasea RLS)
    mqtt.ts                Cliente MQTT y helpers de tópicos
    http.ts                 Servidor HTTP mínimo (POST /confirmaciones, GET /simulacros/cumplimiento)
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

> **Actualización (2026-08-27):** se le agregó un panel "Estado en vivo de
> la consola" — lámpara de relé/sirena, escenario del evento activo y
> próximo simulacro programado, más un campo para ligar el disparo a un
> `simulacroProgramadoId` real — así se puede probar de punta a punta
> simulacro sorpresa/escenario/relé desde el navegador, no solo con
> `mosquitto_pub`/`curl` a mano. Ver `../consola-simulador/README.md`.

## Qué está implementado

- Ciclo completo de un evento: DISPARADO abre el evento, resuelve
  destinatarios (personal activo del sitio), activa los puntos de encuentro,
  y publica `evento-activo` al propio sitio y a sus sitios vecinos.
- OK cierra el evento en curso del sitio (no abre uno nuevo) — ver
  "OK vs. CANCELAR — resuelto" en la ficha de Programación.
- CANCELADO no dispara nada — solo se audita (log). **Decisión tomada con
  el usuario (2026-08-27): no hace falta una tabla centralizada en Backend
  Online para esto** — el historial local de cada consola ya lo guarda, y
  es donde tiene sentido consultarlo (es 100% local a la consola que lo
  generó); ver `handlers/eventos.ts`.
- Idempotencia ante reentrega de MQTT QoS 1 (mismo `eventoId` no se procesa
  dos veces).
- Auditoría de validación de PIN (la consola valida, acá solo se audita).
- Heartbeat y estado online/offline de cada consola (incluido lo que
  publica el broker por Last Will and Testament).
- Sincronización del padrón de operadores hacia las consolas de un sitio
  (alcance puntual + alcance organización) — **enganchada a un barrido
  periódico (cada 5 min) además del disparo puntual**, ver "Sincronización
  periódica del padrón" más abajo.
- Agregación de Accountability en vivo (ok/ayuda/pendiente, total y por
  punto de encuentro) — **con contador incremental**, ver "Contador
  incremental de Accountability" más abajo.
- **Endpoint para las confirmaciones de Mobile** — `POST /confirmaciones`
  (HTTP, no MQTT; ver "Endpoint para las confirmaciones de Mobile" más
  abajo). Actualiza la fila `pendiente` ya existente para (evento, persona)
  y dispara `publicarAccountabilityDeEvento` después de cada escritura.
- **Publicación de `consolas/{id}/simulacro`** — `sincronizarSimulacroDeSitio`
  (mismo patrón que `sincronizarPadronDeSitio`, retained) **ahora enganchada
  en dos caminos**: al resolver cualquier simulacro (evento-driven, ver
  `resolverSimulacroProgramado`) y un barrido periódico de respaldo cada 15
  min — ver "Sincronización de 'próximo simulacro'" más abajo.
- **Despacho real de push/SMS** — ver "Despacho real de push/SMS" más abajo.
- **Autenticación de las consolas contra Mosquitto** — usuario/contraseña
  por consola vía dynamic-security; ver esa sección más abajo.
- **Marcar un simulacro como "no_realizado"** tras 1h sin dispararse —
  barrido periódico, ver esa sección más abajo.
- **Simulacro sorpresa, escenario y relé/sirena** — ver esa sección más abajo.
- **Vista de cumplimiento** — `GET /simulacros/cumplimiento`, ver esa sección más abajo.
- **Rotación de tipo de evento** — un programa recurrente puede ir
  rotando entre varios tipos en vez de quedar pegado siempre al mismo,
  ver esa sección más abajo.
- **Publicación de `consolas/{id}/prog`** — asignación de PROG1-4 a un
  tipo de evento (`consolas.prog_config`, retained), barrido periódico
  cada 5 min como el padrón; ver "Sincronización de PROG1-4" más abajo.
- **Alta de operadores y reseteo de PIN** — `POST /operadores` y
  `POST /operadores/:id/resetear-pin`, solo admins, ver esa sección más
  abajo. Es el primer endpoint pensado para que lo llame el Frontend
  Web (no Mobile ni las consolas).
- **Autoregistro de personas desde Mobile** — `POST /personas/reclamar`,
  `/autoregistro` y `/canjear-codigo`, ver esa sección más abajo. Sin
  email ni contraseña — la identidad del dispositivo es una sesión
  anónima de Supabase Auth que Mobile ya trae.
- **Que Mobile pueda ver su propio estado y registrar su push token** —
  política RLS `personas_self_read` (lectura directa contra Supabase,
  sin backend de por medio) + `POST /personas/push-token`, ver esa
  sección más abajo.
- **Rate limiting en los endpoints de autoregistro** — por IP en las
  tres rutas (`http.ts`) más un límite puntual por legajo+DNI en
  `/personas/reclamar` (`handlers/personas.ts`), ver "Precauciones al
  habilitar Anonymous Sign-ins" más abajo.

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
valida contra el propio servidor de Auth de Supabase (`Db.verificarJwt` —
renombrado más adelante, ver "Vista de cumplimiento": dejó de ser
específico de Mobile).

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
  `logic/simulacro.ts`, `MARGEN_NO_REALIZADO_MS`. Aplica a cualquier fila
  `programado` con `fecha_hora` — puntual o recurrente (ver "Motor de
  recurrencia" más abajo; antes solo cubría puntuales).

  Validado contra Supabase real: insertado un simulacro con `fecha_hora`
  2h en el pasado — al reiniciar el backend, el barrido inicial lo marcó
  `no_realizado` (`[simulacros] marcados no_realizado: 1`). Insertado un
  segundo con `fecha_hora` 30 min en el pasado (dentro del margen) — un
  segundo reinicio no lo tocó, confirma que el límite de 1h se respeta.

### Motor de recurrencia de simulacros

**Decisión tomada (2026-08-27), a partir de una sesión de "cómo hacer esto
más profesional":** dos formas de regla para `recurrencia` (jsonb),
guardadas en `types.ts` como `ReglaRecurrencia`, en vez de adoptar un
estándar completo tipo RRULE (mucha más potencia de la que hace falta acá)
o inventar algo ad-hoc sin estructura:

```ts
| { tipo: "intervalo"; unidad: "semanas" | "meses"; cada: number }
| { tipo: "posicion"; diaSemana: 0-6; posicion: 1 | 2 | 3 | 4 | -1; cadaMeses: number }
```

`"intervalo"` cubre "cada N semanas/meses" (mensual, trimestral,
semestral). `"posicion"` cubre "el N-ésimo día de semana del mes, cada N
meses" — para patrones tipo "el primer lunes de cada trimestre"
(`diaSemana: 1, posicion: 1, cadaMeses: 3`); `posicion: -1` = el último de
ese día en el mes. Entre las dos cubren los patrones reales de un
programa de simulacros de seguridad industrial. El cálculo de la próxima
fecha vive en `src/logic/recurrencia.ts` (`calcularProximaOcurrencia`,
pura, 7 tests — incluye cruce de fin de año y meses de distinta
duración), usando siempre métodos UTC de `Date` para no depender de la
zona horaria del proceso.

**Cambio de modelo que esto trajo:** antes, una fila recurrente
(`puntual: false`) se guardaba con `fecha_hora: null` — no había ancla
desde donde calcular nada. Ahora **toda fila `programado` tiene una
`fecha_hora` concreta**, puntual o recurrente; lo que distingue a una
recurrente es que además carga una `recurrencia` no-nula. Esto es lo que
permitió sacar el filtro `puntual` de `elegirProximoSimulacro` y de
`simulacrosVencidos` — antes ignoraban cualquier fila recurrente por
completo, ahora participan igual que las puntuales.

**Hallazgo real al revisar el código para esto:** `eventos.simulacro_programado_id`
se guardaba desde que se armó el modelo, pero **nada lo leía después** —
ninguna fila de `simulacros_programados` pasaba a `realizado` nunca, ni
aunque el simulacro se hubiera disparado de verdad. Con eso, el barrido de
`no_realizado` de ayer eventualmente iba a marcar como "no realizado"
simulacros que sí se hicieron. Arreglado: `handlers/eventos.ts` llama a
`resolverSimulacroProgramado(db, simulacroProgramadoId, "realizado")`
cada vez que se inserta un evento con ese id — en los dos lugares donde se
inserta un evento (abrir uno nuevo, o el propio OK que cierra).

**Auto-generación de la próxima ocurrencia:** `resolverSimulacroProgramado`
(`src/handlers/simulacro.ts`) es el único punto por el que un simulacro
pasa a un estado terminal — lo llaman tanto el barrido de vencidos
(`no_realizado`) como el enganche nuevo en `handlers/eventos.ts`
(`realizado`). Si la fila resuelta tiene `recurrencia`, genera y guarda la
fila de la próxima ocurrencia con la misma regla (`logic/simulacro.ts`,
`proximaFilaSimulacro` — pura, calcula desde la fecha de ESTA ocurrencia,
no desde "ahora", para que un atraso puntual no corra todo el programa
hacia adelante). Así, `simulacros_programados` deja de ser una lista que
alguien tiene que rellenar a mano fila por fila — un programa recurrente
se auto-perpetúa solo.

Validado de punta a punta contra Supabase y Mosquitto reales, los dos
caminos de resolución:
- Insertado un recurrente (`cada: 3 meses`) con `fecha_hora` 2h en el
  pasado → el barrido al reiniciar lo marcó `no_realizado` y generó la fila
  siguiente exactamente 3 meses después, `programado`, misma regla.
- Disparado un evento real (modo `SIMULACRO`) con ese `simulacroProgramadoId`
  apuntando a la fila recién generada → pasó a `realizado` y generó OTRA
  fila 3 meses después de esa. El programa se auto-perpetuó en cadena por
  los dos caminos. Datos de prueba limpiados.

### Simulacro sorpresa, escenario y relé/sirena

Tres columnas nuevas en `simulacros_programados` (`sorpresa` bool,
`escenario` text, ambas nullable/con default) y una en `tipos_evento`
(`activa_rele` bool) — decisiones tomadas con el usuario (2026-08-27), a
partir de una sesión de "cómo hacer el programador de simulacros más
profesional":

- **`sorpresa`**: el simulacro no se incluye en el broadcast anticipado
  de `consolas/{id}/simulacro` (ver `elegirProximoSimulacro`, que ahora
  filtra `!s.sorpresa` además del resto de condiciones) — nadie en el
  sitio sabe que viene. Sigue siendo alguien quien lo dispara físicamente
  desde una consola (no hay auto-disparo por el backend — eso sería un
  cambio de arquitectura más grande, ver "Decisiones pendientes"); lo
  único que cambia es que no hay aviso previo público. `sorpresa` se
  hereda a la próxima ocurrencia si el simulacro es recurrente (un
  programa sorpresa sigue siendo sorpresa).

- **`escenario`**: narrativa puntual de un simulacro (ej. "Se rompió una
  válvula, hay derrame de líquido tóxico en Zona B"). Se suma al mensaje
  de push/SMS (`logic/despacho.ts`, `armarMensajeDespacho` — antes
  genérico, ahora "`{escenario}` Diríjase a un punto de encuentro...") y
  al payload de `evento-activo` que ve la consola. **No se hereda** a la
  próxima ocurrencia de un recurrente — repetir la misma narrativa cada
  vez no tiene sentido; alguien tiene que escribir una fresca cuando
  corresponda.

- **`tipos_evento.activa_rele`**: por tipo de evento — decisión ampliada
  respecto de lo que se pidió originalmente (solo para "simulacro
  sorpresa"): aplica a **eventos reales y a simulacros por igual**, un
  Tóxico real también amerita sirena, no solo el simulacro de Tóxico. Se
  manda como `activarRele` en `PayloadEventoActivoMqtt` — es el contrato
  MQTT que el firmware de la consola (Raspberry Pi/ESP32) va a necesitar
  el día que se escriba, para drivear un relé conectado a una sirena o a
  una entrada del SS2000. **Ese firmware no existe todavía en ningún
  repo** — acá solo se armó y probó el contrato del lado del backend; la
  parte de hardware (relé físico, cableado, GPIO) es trabajo de otro
  proyecto.

Validado de punta a punta contra Supabase y Mosquitto reales: un
simulacro sorpresa con `fecha_hora` más próxima que uno anunciado — el
broadcast de "próximo simulacro" trajo el anunciado, no el sorpresa
(confirma el filtro). Tipo "Tóxico" marcado `activa_rele: true`, evento
real disparado contra ese simulacro sorpresa → el `evento-activo`
resultante trajo `activarRele: true` y el `escenario` completo; la fila
pasó a `realizado` en la base. Datos y flag de prueba revertidos al
terminar.

### Vista de cumplimiento

`GET /simulacros/cumplimiento` (`?sitioId=<uuid>` opcional, omitir para
todos los sitios) — la pieza que le permite a un responsable de seguridad
mirar el estado real del programa de simulacros, no solo consultarlo fila
por fila en la base.

**Granularidad: (sitio, tipo de evento), no por sitio a secas** — un sitio
puede tener su programa de Incendio al día y el de Tóxico completamente
vencido; mezclarlos en un solo estado por sitio escondería justo lo que
importa ver. Por cada par devuelve: el último simulacro que se resolvió
(`realizado` o `no_realizado`, con fecha), el próximo programado si el
programa sigue vivo, y `alDia` — true solo si el último resuelto fue
`realizado`. **Sin historial cuenta como NO al día**, a propósito: no hay
evidencia de que se haya probado nunca, y eso es justo lo que un auditor
necesita ver marcado, no que se lo salteen en silencio. Cálculo puro en
`src/logic/cumplimiento.ts` (`calcularCumplimiento`, 8 tests).

**Auth: JWT de Supabase Auth, igual que `POST /confirmaciones`, pero
resuelve a un OPERADOR (no a una persona) y exige `rol: admin`** — esto es
una vista de gestión/auditoría, no algo que use el personal general.
`operadores.auth_user_id` ya existía en el esquema (no hizo falta
migración, a diferencia de `personas`). `Db.verificarJwtMobile` se
renombró a `Db.verificarJwt` — no era específico de Mobile, ahora lo
reusan los dos endpoints.

Validado de punta a punta contra Supabase real, los 4 casos de respuesta:
sin header → `401` · token inválido → `401` · operador válido pero sin
rol `admin` → `403` · admin con datos reales (un sitio con Incendio
`realizado`+`programado` y Tóxico solo `no_realizado`) → `200` con
`alDia: true`/`false` correctos para cada tipo. Datos, operador y
usuarios de prueba borrados al terminar.

### Rotación de tipo de evento

`simulacros_programados.rotacion_tipos` (`uuid[]`, nullable) — una lista
ordenada de `tipo_evento_id`. Sin rotación configurada (null o vacía), un
programa recurrente sigue con el mismo tipo para siempre, como antes. Con
rotación: `proximoTipoEvento` (`logic/simulacro.ts`) avanza al siguiente
de la lista cada vez que se genera una ocurrencia nueva, volviendo al
principio al llegar al final. Si el tipo actual no está en la lista (ej.
se cambió la rotación a mitad del programa), arranca de nuevo desde el
primero en vez de romper — no hay una posición "correcta" que inferir
ahí. La lista se hereda igual que `sorpresa` y `recurrencia` — un
programa con rotación sigue rotando indefinidamente.

Validado contra Supabase real: programa recurrente (mensual) con rotación
`[Incendio, Sismo, Médico]`, arrancando en Incendio y vencido — el
barrido lo marcó `no_realizado` y generó la fila siguiente con tipo
**Sismo** (el que sigue en la lista, no Incendio de nuevo), fecha +1 mes
exacto, misma rotación heredada. Datos de prueba limpiados.

### Contador incremental de Accountability

Hasta acá, cada escritura en `confirmaciones` (una confirmación real desde
Mobile, o el alta inicial `pendiente` al abrir un evento) disparaba
`publicarAccountabilityDeEvento`, que traía **todas** las confirmaciones
del evento (`getConfirmacionesDeEvento`) y las recontaba en JS
(`calcularAccountability`). A la escala real (2000-4000 personas, ver
"Escala esperada" de la ficha), en una evacuación real las confirmaciones
llegan en ráfaga — cientos casi simultáneas — y cada una disparaba ese
recount completo de nuevo, justo en el momento donde el sistema tiene que
responder más rápido.

**Decisión tomada (2026-08-27): trigger de Postgres + tabla de
contadores**, no un contador mantenido a mano desde la app. Se prefirió
sobre la alternativa (actualizar el contador en la misma función de
TypeScript que escribe la confirmación) porque el trigger es correcto
pase lo que pase toque `confirmaciones` — incluida una corrección manual
por SQL — mientras que un contador de app se desincroniza en cuanto algo
escribe la tabla por otro lado. El costo es tener lógica en PL/pgSQL en
vez de TypeScript, que se valida contra Supabase real en vez de con
`node:test` (mismo criterio que el resto de `db.ts`).

- **`accountability_contadores`** (migración `accountability_contadores`)
  — una fila por `(evento_id, punto_id)`, más una fila con `punto_id NULL`
  para las confirmaciones sin punto de encuentro asignado (que igual
  cuentan para el total del evento). La unicidad usa
  `UNIQUE NULLS NOT DISTINCT` (Postgres 15+, este proyecto está en 17) para
  que el bucket `NULL` también sea una fila única por evento, no una por
  cada INSERT.
- **`trg_confirmaciones_accountability`** — trigger `AFTER INSERT OR
  UPDATE OR DELETE` sobre `confirmaciones`, `fn_accountability_actualizar_contador`.
  En un INSERT suma 1 al bucket que corresponda; en un DELETE resta 1; en
  un UPDATE, si cambió `estado` y/o `punto_id`, resta del bucket viejo y
  suma al nuevo (soporta que una confirmación cambie de punto, no solo de
  estado). Si no cambió nada relevante, no toca la tabla.
- **`armarAccountabilityDesdeContadores`** (`logic/accountability.ts`,
  pura) — arma el mismo `PayloadAccountabilityMqtt` de siempre, pero
  sumando las pocas filas de `accountability_contadores` en vez de filtrar
  miles de confirmaciones. `calcularAccountability` (el recount completo)
  **se mantiene** como referencia: los tests nuevos comparan que ambas
  formas den el mismo resultado partiendo del mismo fixture, no que una
  reemplace a la otra en el código de test.
- `Db.getContadoresAccountability` reemplaza a `getConfirmacionesDeEvento`
  en el único lugar que la usaba (`publicarAccountabilityDeEvento`,
  `handlers/eventos.ts`) — `getConfirmacionesDeEvento` se deja en `db.ts`
  sin usar en producción, la sigue necesitando `calcularAccountability`
  como referencia si alguna vez hace falta re-auditar un evento a mano.

Validado en dos niveles contra Supabase real:
- **El trigger solo, con SQL a mano** — insertados 3 confirmaciones (dos
  con punto, una sin), verificados los contadores; actualizada una a
  `ok` y otra a `ayuda` **cambiando de punto** (para ejercitar el camino
  menos común), verificado que decrementó el bucket viejo e incrementó el
  nuevo correctamente; borrada una fila, verificado el decremento.
- **El camino completo, de punta a punta** — creado un usuario real de
  Supabase Auth vinculado a una persona de prueba (mismo patrón que
  "Endpoint para las confirmaciones de Mobile"), disparado un evento real
  por `mosquitto_pub` (2 personas activas → 2 `pendiente` iniciales, el
  trigger las contó bien desde el INSERT en lote), y confirmado un
  `POST /confirmaciones` real con ese JWT — el mensaje MQTT en
  `consolas/{id}/accountability/{eventoId}` salió con
  `notificados: 2, ok: 1, ayuda: 0, pendiente: 1` y el desglose por punto
  correcto (el punto sin nadie confirmado mostró 0, no un error).

Usuario, vínculo y datos de prueba borrados al terminar. `npm run
typecheck` limpio, 70/70 tests (3 nuevos: contadores vs. recount con el
mismo fixture, punto sin fila en contadores, bucket `puntoId: null`).

### Sincronización periódica del padrón

`sincronizarPadronDeSitio` (`src/handlers/padron.ts`) existía desde antes y
publicaba correctamente el padrón de un sitio hacia sus consolas — pero
nunca se llamaba desde ningún lado. En la práctica el padrón solo se
actualizaba si algo puntual lo disparaba (nada lo hacía todavía), así que
una consola podía quedar arbitrariamente desactualizada frente a altas,
bajas o reseteos de PIN.

**Decisión tomada (2026-08-27): barrido cada 5 minutos, mismo criterio que
el barrido de simulacros vencidos.** El padrón cambia con poca frecuencia
(altas/bajas de operadores, reset de PIN) — 5 min de rezago es más que
suficiente y no vale la pena algo más fino (ej. Supabase Realtime sobre
`operadores`/`operadores_sitios`) para el volumen actual; queda anotado
como mejora futura en "Decisiones pendientes" de más arriba si hiciera
falta reaccionar en tiempo real.

`sincronizarPadronDeTodosLosSitios` (nueva, `src/handlers/padron.ts`) itera
todos los sitios (`Db.getTodosLosSitiosIds`, nuevo) y llama a
`sincronizarPadronDeSitio` para cada uno; un fallo en un sitio se loguea y
no frena a los demás — un sitio con problemas no debería dejar sin padrón
actualizado al resto. Enganchada en `index.ts` con el mismo patrón que el
barrido de simulacros: corre una vez al arrancar (para no esperar 5 min
tras un restart) y después cada 5 min vía `setInterval`.

Validado contra Supabase y Mosquitto reales: suscripto como la consola
"Bunker" a `consolas/{id}/padron`, reiniciado el backend para forzar la
corrida de arranque, y capturado el mensaje retained publicado con el
operador real de prueba ("Admin Test", legajo 9001, rol admin) — el
padrón llegó solo, sin ningún disparo manual.

> **Actualización (2026-08-28):** `OperadorPadron` no traía `id` — la
> consola podía validar el PIN localmente contra `pinHash`, pero no tenía
> forma de reportar el `operadorId` real en `PayloadAuthMqtt`/
> `PayloadEventoMqtt` (los dos lo piden), solo el legajo. Encontrado al
> diseñar el firmware real de la consola (`consola-pi/`). Agregado `id` al
> payload y a `Db.getOperadoresActivosDeSitio`. Validado contra Supabase y
> Mosquitto reales: el mensaje retained en `consolas/{id}/padron` ahora
> incluye el `id` real del operador.

### Sincronización de "próximo simulacro"

`sincronizarSimulacroDeSitio` existía desde la sesión anterior (motor de
recurrencia) pero, a diferencia de la de padrón, no tenía ningún camino
que la disparara — quedó señalado explícitamente como pendiente. Al
retomarlo para poder probar simulacro sorpresa/escenario/relé de punta a
punta desde el simulador de consola, se enganchó por dos caminos en vez
de copiar directo el patrón de polling del padrón:

1. **Evento-driven (el camino principal):** `resolverSimulacroProgramado`
   — el único punto por el que un simulacro pasa a un estado terminal — ya
   sabe todo lo que hace falta para decidir si cambió el "próximo" del
   sitio (se resolvió uno, y si era recurrente se generó el siguiente), así
   que ahora re-publica ahí mismo en vez de esperar a un poll. Se
   actualiza en el momento, no con hasta 5-15 min de rezago.
2. **Barrido periódico de respaldo** (`sincronizarSimulacroDeTodosLosSitios`,
   cada 15 min, mismo intervalo que el chequeo de vencidos) — red de
   seguridad para el único caso que el camino 1 no cubre: alguien edita
   `simulacros_programados` directo en la base (alta, cambio de fecha)
   sin pasar por `resolverSimulacroProgramado`.

Se prefirió esto a copiar el polling de 5 min del padrón porque acá, a
diferencia del padrón, **casi todos los cambios reales ya pasan por un
punto único en el propio backend** — no hacía falta esperar a un poll
para algo que el código ya sabe que acaba de pasar.

Validado de punta a punta contra Supabase y Mosquitto reales: programado
un simulacro puntual de Tóxico con escenario ("se rompió una válvula...")
y `activa_rele` temporalmente en `true` para ese tipo — (a) reiniciado el
backend, el barrido de arranque publicó el "próximo simulacro" correcto
en `consolas/{id}/simulacro`; (b) disparado el evento real vía
`mosquitto_pub` con ese `simulacroProgramadoId` (mismo flujo que un
simulacro real disparándose) — `evento-activo` salió con `activarRele:
true` y el `escenario` correcto, y `consolas/{id}/simulacro` se
re-publicó solo, sin ningún poll de por medio, con `null` (no quedaba
otro programado). Datos y `activa_rele` de prueba revertidos al terminar.

### Sincronización de PROG1-4

Los botones PROG1–4 del panel físico (ver `consola-pi/`) son genéricos —
qué tipo de evento dispara cada uno se decide por sitio/consola, no está
fijo en el firmware. Se guarda en `consolas.prog_config` (jsonb, columna
nueva, migración `consolas_prog_config`: `{prog1, prog2, prog3, prog4}`,
cada valor el `id` de `tipos_evento` o `null` = sin asignar) y se publica
a la consola como `consolas/{id}/prog` (retained) con los **nombres** de
tipo ya resueltos, no los ids — la consola nunca necesita consultar
`tipos_evento`, solo manda el nombre tal cual le llegó en
`PayloadEventoMqtt.tipo` cuando se presiona ese botón.

Sin UI de administración todavía (Frontend Web no forma parte de este
repo) — `prog_config` se completa a mano por SQL hasta que exista esa
pantalla; `Db.getProgConfigDeConsola` resuelve los ids a nombres en el
momento de publicar, así que un cambio en el nombre de un tipo de evento
se refleja solo, sin tocar `prog_config`.

**Mismo patrón que el padrón** (`handlers/prog.ts`,
`sincronizarProgDeTodasLasConsolas` + `barridoPorSitio`, cada 5 min,
corre una vez al arrancar): no hay ningún evento en la app que lo dispare
puntualmente porque, sin pantalla de administración, tampoco hay desde
dónde editarlo — el barrido periódico es el único camino por ahora. Si el
día de mañana existe esa pantalla, lo natural es agregar el disparo
puntual igual que tiene el padrón (`sincronizarPadronDeSitio` llamado
desde el alta/baja de un operador) y dejar el barrido como red de
seguridad.

Validado de punta a punta contra Supabase y Mosquitto reales: aplicada la
migración, asignado temporalmente PROG1 → Tóxico en la consola "Bunker"
(`prog_config: {"prog1": "<id de Tóxico>", "prog2": null, "prog3": null,
"prog4": null}`), disparado el barrido manualmente — el mensaje retained
en `consolas/{id}/prog` salió `{"prog1":"Tóxico","prog2":null,"prog3":null,
"prog4":null}` (nombre resuelto, no el id). Del lado de `consola-pi/`
(ver su README) se validó que ese mapeo efectivamente cambia el `tipo`
publicado en `PayloadEventoMqtt` cuando se presiona PROG1, y que un
PROG sin asignar sigue mandando el nombre literal del botón
("PROG2", etc.). Dato de prueba revertido a `null` al terminar — el
retained volvió a `{"prog1":null,"prog2":null,"prog3":null,"prog4":null}`.

### RLS: auditoría de seguridad antes de arrancar Frontend Web (2026-08-29)

Antes de construir nada para Frontend Web, se auditó el estado de Row
Level Security del proyecto (`get_advisors`, `pg_policies`) — encontrados
y corregidos dos problemas reales, no cosméticos:

1. **`accountability_contadores` tenía RLS deshabilitado por completo**
   — quedaba expuesta a los roles `anon`/`authenticated` vía PostgREST,
   cualquiera con la clave pública del proyecto podía leer o escribir la
   tabla entera. Habilitado RLS + agregada la misma política
   `org_isolation` que ya usan las otras 16 tablas (vía
   `evento_id → eventos.organizacion_id`, igual que la política de
   `confirmaciones`). De paso, el trigger que la mantiene
   (`fn_accountability_actualizar_contador`) tenía `search_path`
   mutable (otro advisory de seguridad) — corregido fijándolo a
   `'public', 'pg_temp'`, mismo criterio que ya usaba
   `internal.auth_organizacion_id()`. Los dos advisories de seguridad
   quedaron en cero.
2. **RLS aislaba por organización pero no por rol.** `internal.auth_organizacion_id()`
   (la función de la que dependen las 17 políticas `org_isolation`) resolvía
   la organización de CUALQUIER `operadores.auth_user_id` vinculado, sin
   mirar `rol` ni `estado` — un operador `rol: "operador"` (o uno dado de
   baja que conservara el vínculo) tenía lectura+escritura completa sobre
   toda la organización vía Supabase directo: podía editar otros
   operadores (autopromoverse a admin), sitios, consolas, `prog_config`,
   lo que fuera. **Decisión tomada con el usuario (2026-08-29): el login
   de Frontend Web es solo para admins activos.** Un `rol: "operador"`
   nunca necesita cuenta de Supabase Auth — se autentica con PIN directo
   en la consola física; `auth_user_id` es exclusivamente para el login
   del Frontend Web, que es de gestión/administración. Corregida la
   función:
   ```sql
   -- antes: select organizacion_id from operadores where auth_user_id = auth.uid() limit 1;
   select organizacion_id from operadores
   where auth_user_id = auth.uid() and rol = 'admin' and estado = 'activo'
   limit 1;
   ```
   Esto cierra los dos problemas a la vez con un solo cambio: un
   `rol: "operador"` nunca deriva una organización (cero acceso por RLS
   aunque alguien le vinculara `auth_user_id` a mano), y dar de baja a un
   admin (`estado = 'de_baja'`) le corta el acceso al instante sin
   depender de que alguien se acuerde de desvincular su cuenta de Auth.

### Alta de operadores y login web para admins (2026-08-29)

El wireframe de Cowork "Administración de Operadores" (alta/baja/rol/PIN)
no muestra ningún campo de email — es la pantalla del padrón de PIN de
la consola física. Pero el esquema ya tenía `operadores.auth_user_id`
para vincular una cuenta de Supabase Auth, y el wireframe "Login y
Selector de Sitio" es login por email+contraseña. **Decisión tomada con
el usuario: es la misma fila de `operadores`, con dos accesos** — el PIN
(siempre) y, opcional, un login web (solo tiene sentido con
`rol: "admin"`, ver sección anterior).

Crear un operador o resetearle el PIN **no queda como una escritura
directa de Frontend contra Supabase**, aunque RLS técnicamente se lo
permitiría (`org_isolation` es `FOR ALL`) — las dos acciones necesitan
generar y hashear un PIN nuevo (`bcryptjs`, mismas rondas que
`consola-pi` usa para comparar) y, si corresponde, invitar por email a
través de la Admin API de Supabase Auth (`service_role`, que el
navegador nunca tiene). Dos endpoints nuevos, ambos solo-admin (mismo
mecanismo de auth que `GET /simulacros/cumplimiento`: JWT → operador →
chequeo de `rol`):

- **`POST /operadores`** — `{ nombre, legajo, rol, alcanceTipo,
  sitiosIds, email }`. Genera un PIN de 4 dígitos (`node:crypto
  randomInt`, no `Math.random` — es el PIN que habilita una emergencia
  real), lo hashea, crea el operador **en la organización del admin que
  llama** (nunca la que mande el body — este endpoint usa
  `service_role`, así que la restricción de organización es manual, no
  algo que RLS esté aplicando acá). Si `alcanceTipo` es `"sitio"`,
  valida que los `sitiosIds` pertenezcan de verdad a esa organización
  antes de vincularlos (`400` si no). Si viene `email`, invita después
  de crear el operador (no antes: así una invitación fallida no deja un
  operador a medio crear) — la invitación puede fallar sola sin tirar
  abajo el alta entera: devuelve `201` igual, con `invitado: false` y
  `errorInvitacion` con el detalle, para que Frontend pueda mostrar
  "operador creado, pero la invitación falló — reintentar" sin
  ambigüedad. Responde el PIN en texto plano **una sola vez**, igual que
  el wireframe.
- **`POST /operadores/:id/resetear-pin`** — mismo mecanismo, genera y
  hashea un PIN nuevo para un operador existente. `404` tanto si el id
  no existe como si es de otra organización (no hay que darle a un
  admin de otra organización ninguna pista de que ese id existe en
  algún lado).
- Dar de baja un operador, o editar nombre/legajo/rol/alcance sin tocar
  el PIN, **no necesita ninguno de estos dos endpoints** — es una
  escritura directa de Frontend contra Supabase, ya cubierta por
  `org_isolation` (RLS) sin ningún dato sensible de por medio.
- **`scripts/provisionar-admin.mjs`** — bootstrap del primerísimo admin
  de una organización (mismo problema que resuelve
  `provisionar-consola.sh` para la primera consola: `POST /operadores`
  necesita estar autenticado como un admin que ya existe, así que el
  primero no puede pasar por ahí). Node plano (no `tsx` — un script de
  bootstrap no debería depender del toolchain de TypeScript del
  proyecto), mismo criterio de generación de PIN + invitación por email.

Validado de punta a punta contra Supabase real (JWT real, mismo patrón
que `POST /confirmaciones`: `admin.auth.admin.createUser` +
`signInWithPassword` vía `anon` para conseguir el token): sin
`Authorization` → `401`; token basura → `401`; un operador `rol:
"operador"` con login → `403` al intentar crear otro operador; alta sin
email (PIN generado, valida contra el hash guardado con `bcrypt.compare`,
`auth_user_id` queda `null`); alta con `alcanceTipo: "sitio"` contra un
sitio real (queda vinculado en `operadores_sitios`) y contra un sitio
inventado (`400`); `resetear-pin` sobre un operador real (el `pin_hash`
cambia, el PIN nuevo valida) y sobre un id inexistente (`404`). Operadores
y cuentas de Auth de prueba borrados al terminar — `getOperadorPorAuthUserId`
de "Admin Test" quedó revertido a `auth_user_id: null` como estaba.

**Actualización (2026-08-29) — SMTP propio configurado y probado con un
envío real.** En la validación original de esta sección, el proyecto no
tenía SMTP propio y `inviteUserByEmail` devolvía `"email rate limit
exceeded"` en cada intento (el límite integrado de Supabase sin SMTP
propio es muy bajo). El usuario configuró Gmail como proveedor SMTP
(`smtp.gmail.com`, contraseña de aplicación — no la contraseña de la
cuenta). Primer intento con SMTP ya activo: `535 5.7.8 Username and
Password not accepted` (la contraseña de aplicación mal cargada);
corregido, reintentado: `inviteUserByEmail` devolvió `error: null` con
el usuario creado, confirmado también contra `auth_logs`
(`path: "/invite", status: 200`) — y el usuario confirmó haber recibido
el mail de verdad en su casilla. Cuenta de invitación de prueba borrada
después de confirmar la recepción (dejar una invitación real sin usar
colgando no tenía sentido). El camino de degradación (SMTP fallando →
operador creado igual, `invitado: false` + `errorInvitacion` con el
detalle) ya se había validado antes y sigue vigente para cuando el
límite de envío de Gmail se agote o el SMTP falle por otra razón.

`npm run typecheck` limpio, 84/84 tests (14 nuevos: validación pura del
body + generación de PIN, ver `test/operadores.test.ts`).

### Autoregistro de personas (Mobile) (2026-08-29)

El esquema ya tenía `codigos_acceso`/`codigos_acceso_usos` y
`personas.origen`/`estado` con los valores para esto
(`pendiente_aprobacion`, `rechazado`, `autoregistro`, `codigo_acceso`)
pero sin ningún código que los usara. El wireframe de Cowork "Mobile —
App de Personal" (pantallas "registro") resolvió la duda: **no hay
ningún campo de email ni contraseña en los tres flujos** — la identidad
del dispositivo es el JWT que Mobile ya trae en el header
`Authorization`, de una sesión anónima de Supabase Auth
(`supabase.auth.signInAnonymously()`, invisible en el wireframe porque
no hace falta ninguna pantalla para eso — "no hace falta volver a
loguearte" dice la pantalla de "te encontramos", justo porque la sesión
ya existía). Estos tres endpoints no crean ninguna cuenta — solo
vinculan o crean la fila de `personas` que le corresponde a la sesión
que ya tiene el JWT.

Tres endpoints, cualquier JWT válido alcanza (a diferencia de
`/operadores`, acá no hace falta ningún rol — una sesión anónima
alcanza, es justamente el punto):

- **`POST /personas/reclamar`** — "soy personal fijo, ya estoy en el
  padrón" (pantalla `screenRegLoginFijo` del wireframe). `{ legajo,
  dni }` → busca una `personas` existente con ese legajo+dni exactos.
  `404` si no hay match (Mobile pasa a autoregistro). Si hay match: si
  ya estaba vinculada a la MISMA sesión, `200` idempotente
  (`yaEstabaVinculada: true`); si estaba sin vincular, la vincula y
  devuelve `200`; si ya estaba vinculada a OTRA sesión, `409` — nunca
  pisar silenciosamente a quien la reclamó primero, le robaría las
  alertas.
- **`POST /personas/autoregistro`** — "no me encontraron, pido el
  alta" (pantalla `screenRegAltaFijo`, personal fijo no encontrado en
  el padrón — típico de una incorporación reciente). `{ nombre, dni,
  legajo, telefono, sitioId }` → crea la persona con
  `estado: "pendiente_aprobacion"`, `origen: "autoregistro"`, vinculada
  a la sesión. **No se acepta automático a propósito** — el wireframe
  lo dice explícito: "no se acepta automáticamente, porque esto dispara
  alertas reales de seguridad". Un admin la aprueba después (cambiar
  `estado` a `"activo"` o `"rechazado"` — eso sí es una escritura
  directa de Frontend contra Supabase, `org_isolation` alcanza, no hay
  nada sensible de por medio). `409` si la sesión ya tiene una persona
  vinculada (evita duplicados por reintento/doble tap).
- **`POST /personas/canjear-codigo`** — "soy eventual/contratista,
  tengo un código" (pantalla `screenRegCodigo`). `{ codigo, nombre,
  telefono, dni }` (`dni` opcional — solo se cruza contra el DNI propio
  del código si es de tipo `"individual"` y lo trae cargado) → valida
  el código (existe, `estado: "vigente"`, no vencido, cupo disponible)
  y crea la persona **activa al instante** (`estado: "activo"`,
  `origen: "codigo_acceso"`, `tipo: "eventual"`) — sin aprobación,
  también a propósito ("se valida solo, al instante, sin que nadie
  tenga que aprobarlo", dice el wireframe: poseer el código pre-generado
  por un admin YA es la autorización). Consume un uso del código
  (`codigos_acceso.usos_actuales += 1`, fila nueva en
  `codigos_acceso_usos`) — **de forma atómica**, ver
  `fn_intentar_usar_codigo` (migración aplicada directamente, no hay
  carpeta de migraciones en este repo): un solo `UPDATE ... WHERE
  usos_actuales < tope_usos RETURNING *` en vez de "leer, chequear en
  JS, escribir" — dos personas canjeando el mismo código de lote al
  mismo tiempo no pueden pasar las dos el chequeo antes de que ninguna
  escriba (TOCTOU); Postgres serializa las filas que toca el UPDATE
  solo. El código pasa a `"agotado"` solo cuando el uso que se acaba de
  consumir llega al tope, en el mismo UPDATE.

Validado de punta a punta contra Supabase real. **Con una salvedad
real: `signInAnonymously()` está deshabilitado en el proyecto de este
entorno** (`"Anonymous sign-ins are disabled"`, `422
anonymous_provider_disabled`) — **hay que habilitarlo a mano en el
dashboard de Supabase (Authentication → Providers → Anonymous
Sign-ins) antes de que Mobile pueda usar esto de verdad.** El código de
los tres handlers no distingue una sesión anónima de una con
email/contraseña (`auth.getUser(token)` no mira `is_anonymous`), así
que la lógica sí se validó de punta a punta — sustituyendo la sesión
anónima por el mismo patrón `createUser` + `signInWithPassword` ya
usado para el admin de prueba —, pero la capacidad de Supabase en sí
(`signInAnonymously()` funcionando) no se pudo probar acá. Casos
cubiertos: sin `Authorization` → `401` en las tres rutas; `reclamar`
sin match → `404`, con match sin vincular → `200`, reintento misma
sesión → `200` idempotente, desde otra sesión → `409`; `autoregistro`
crea con `pendiente_aprobacion` y los campos correctos, repetido desde
la misma sesión → `409`, con `sitioId` inventado → `400`; `canjear-codigo`
con un código real de tope 2: primer y segundo uso `201` (el segundo
deja el código en `"agotado"`), tercer intento → `400`, código
inventado → `404`; **y la prueba que de verdad importaba**: dos
canjes disparados en simultáneo (`Promise.all`) contra un código de
`tope_usos: 1` — terminó exactamente un `201` y un `400`, y
`usos_actuales` en `1`, no `2`, confirmando que `fn_intentar_usar_codigo`
evita la carrera de verdad, no solo en la teoría. Personas, códigos y
cuentas de Auth de prueba borrados al terminar. `npm run typecheck`
limpio, 96/96 tests (12 nuevos: validación pura de los tres bodies, ver
`test/personas.test.ts`).

### Que Mobile pueda ver su propio estado y registrar su push token (2026-08-29)

Hallazgo al terminar el autoregistro: una `persona` no tenía **ningún**
acceso de lectura por RLS. Las 17 políticas `org_isolation` dependen de
`internal.auth_organizacion_id()`, que solo resuelve consultando
`operadores` — para una sesión de Mobile (vinculada vía
`personas.auth_user_id`, nunca aparece en `operadores`) esa función
siempre da `null`, así que `organizacion_id = null` nunca es cierto
para ninguna fila. Sin esto, Mobile no tenía forma de consultar directo
contra Supabase si ya la aprobaron tras un autoregistro (`personas.estado`)
— la única foto que tenía era la del momento exacto de la respuesta de
`POST /personas/autoregistro`.

**Política nueva, `personas_self_read`** (además de `org_isolation` —
son permisivas, se combinan con OR): una persona puede leer **su
propia fila, nada más** — ni la de nadie más, ni escribir nada (`FOR
SELECT` únicamente). Un admin sigue viendo toda la organización como
antes, vía `org_isolation`.

Deliberadamente **no** se agregó una política de auto-escritura — una
persona pudiendo tocar cualquier columna de su propia fila es un riesgo
real: nada le impediría escribir `estado: "activo"` a mano y
auto-aprobarse el autoregistro, o cambiarse el `dni`. Para lo único que
Mobile necesita escribir (renovar su token de FCM cuando rota) hay un
endpoint aparte, **`POST /personas/push-token`** — `{ pushToken }`,
cualquier JWT válido con una persona vinculada, solo puede tocar
`push_token`/`push_token_actualizado_at`, ninguna otra columna.

Validado contra Supabase real, con clientes `anon` reales (no
`service_role`) para probar la política de RLS tal cual la vería
Mobile: una sesión lee su propia fila con su `estado` real; no puede
leer la fila de otra persona (`null`); haciendo `select()` de toda la
tabla ve exactamente una fila, la suya; un intento de `UPDATE` sobre la
fila ajena afecta 0 filas. `POST /personas/push-token` actualiza
`push_token` sin tocar ningún otro campo, `401` sin auth, `404` sin
persona vinculada. Confirmado además que la política nueva no rompió
nada existente: un admin real sigue viendo las dos personas de su
organización vía `org_isolation`, sin cambios. Personas y cuentas de
Auth de prueba borradas al terminar. `npm run typecheck` limpio, 98/98
tests.

### Precauciones al habilitar Anonymous Sign-ins (2026-08-29)

Los tres endpoints de autoregistro (`/personas/reclamar`,
`/autoregistro`, `/canjear-codigo`) piden solo un JWT válido — sin
ningún rol particular, a propósito, porque Mobile los llama desde una
sesión anónima de Supabase Auth (`signInAnonymously()`, ver
"Autoregistro de personas (Mobile)" más arriba). Habilitar Anonymous
Sign-ins en el dashboard es lo que hace que eso funcione — pero también
significa que **cualquiera puede conseguir un JWT válido gratis, sin
verificar absolutamente nada** (ni email, ni teléfono, ni CAPTCHA por
default). Antes de habilitarlo hacía falta cerrar lo que eso abre.

**Lo que NO cambia**: ninguna política RLS se vuelve más permisiva por
tener "cualquier sesión autenticada" — `org_isolation` sigue exigiendo
`operadores.rol='admin'` y `personas_self_read` sigue exigiendo
`auth_user_id = auth.uid()` de la propia fila. Una sesión anónima no
gana acceso a nada ajeno solo por existir.

**El riesgo real que sí abre**: sin ningún límite, alguien con una
sesión anónima gratis puede scriptear intentos contra los tres
endpoints:

- **`/personas/reclamar`** — adivinar `legajo` + `dni` de una persona
  real y vincular esa sesión a su fila. Es el de mayor riesgo de los
  tres: en un sistema de emergencias, eso significa empezar a recibir
  y poder confirmar **las alertas de otra persona** en su lugar — un
  problema de suplantación de identidad, no solo de datos.
- **`/personas/canjear-codigo`** — probar códigos de acceso hasta
  acertar uno vigente.
- **`/personas/autoregistro`** — de menor riesgo (cada intento exitoso
  solo crea una fila `pendiente_aprobacion`, un admin la revisa antes
  de que haga nada), pero igual vale acotar el volumen.

**Qué se construyó**: `src/lib/rateLimit.ts` — limitador en memoria,
ventana fija por clave (`permitirIntento(clave, maxIntentos, ventanaMs)`),
sin librería externa (mismo criterio de "no traer algo más para esto"
del resto del repo). Aplicado en dos capas:

- **Por IP** (`http.ts`, `limitarPorIp`), en las tres rutas — la
  protección general contra cualquier script insistiendo: 20
  intentos/15min en `reclamar` y `canjear-codigo`, 10/hora en
  `autoregistro`. Números elegidos para tolerar una IP compartida real
  (wifi del sitio, NAT corporativo — varias personas registrándose el
  mismo rato desde la misma IP) sin frenar el uso legítimo, pero
  cortando un script insistente mucho antes de que tenga chance de
  acertar nada. Usa `req.socket.remoteAddress` — no `X-Forwarded-For`,
  porque no hay proxy inverso delante en este entorno y confiar en un
  header que el cliente puede mandar directamente sería falso; si el
  día de mañana hay un balanceador delante, esto tiene que pasar a
  confiar en ese header SOLO cuando lo pone el proxy conocido.
- **Por objetivo puntual, solo en `reclamar`** (`handlers/personas.ts`) —
  además del límite por IP, un límite de 10 intentos/30min por
  `legajo+dni` exacto. Es la protección extra para el endpoint de mayor
  riesgo: sin esto, alguien con muchas sesiones anónimas distintas (o
  detrás de muchas IPs) podría seguir probando contra la MISMA persona
  ajena sin que el límite por IP lo frene. **Decisión deliberada**: no
  se agregó el equivalente en `canjear-codigo` — ahí el código mismo ya
  se autolimita por `tope_usos` (una vez agotado, `fn_intentar_usar_codigo`
  deja de aceptar usos sin importar cuántos JWTs distintos lo intenten)
  y el límite por IP alcanza para el riesgo que queda.

**Limitación conocida**: el estado vive en memoria de un solo proceso
— no se comparte entre instancias. Alcanza para el tamaño actual de
este despliegue (un único proceso de `backend-server`); si en algún
momento hay más de una instancia corriendo en paralelo detrás de un
balanceador, esto necesitaría moverse a Redis o Postgres para que el
límite sea real entre todas.

**Validado**: 4 tests nuevos para `rateLimit.ts` (102/102 en total,
`npm run typecheck` limpio) más una prueba end-to-end contra Supabase
real — 10 intentos contra el mismo legajo+DNI inventado se aceptan, el
11° devuelve `429`, y un legajo+DNI distinto en paralelo no se ve
afectado (las claves no se cruzan). Todas las cuentas de Auth de prueba
borradas al terminar.

**Opcional, no configurado por mí**: Supabase tiene su propio soporte
de CAPTCHA (hCaptcha/Turnstile) para `signInAnonymously()` y el resto
de los flujos de Auth, bajo Authentication → Attack Protection en el
dashboard. Es una capa adicional independiente de esto — vale la pena
como defensa en profundidad si el volumen de abuso real lo justifica,
pero no la habilité ni la probé; queda como decisión del usuario.

## Qué NO está implementado todavía (a propósito, ver la ficha)

Nada por ahora — el último ítem señalado acá (el contador incremental de
Accountability) se implementó el 2026-08-27, ver "Contador incremental de
Accountability" más abajo.

## Revisión de código (2026-08-27)

Pasada de code review sobre los 11 commits de la sesión (todo desde
`POST /confirmaciones` hasta la rotación de tipo). 5 hallazgos, los 5
reales, los 5 corregidos:

1. **Fecha de recurrencia mensual desbordaba de mes** (`logic/recurrencia.ts`)
   — `setUTCMonth` sobre el día original de un simulacro programado el 29,
   30 o 31 se salteaba el mes siguiente entero cuando este tenía menos
   días: "31 de enero + 1 mes" daba **3 de marzo**, no fin de febrero.
   Arreglado recortando al último día real del mes destino (mismo criterio
   que cualquier librería de fechas seria). 3 tests de regresión nuevos
   (incluido un año bisiesto).
2. **`evento-activo` (dispara la sirena vía `activarRele`) quedaba
   bloqueado detrás del despacho completo de push/SMS** (`handlers/eventos.ts`)
   — con miles de personas activas, el aviso a las demás consolas del
   sitio (y su relé físico) esperaba a que terminaran TODOS los
   push/SMS individuales antes de publicarse. Reordenado: `evento-activo`
   se publica antes de empezar el despacho, no después.
3. **`puntoId` de una confirmación no se validaba contra los puntos
   habilitados del evento** (`handlers/confirmaciones.ts`) — un cliente
   podía mandar cualquier string como `puntoId` y se guardaba tal cual;
   contaba para el total `ok`/`ayuda` pero desaparecía del desglose por
   punto en `calcularAccountability`, un descuadre silencioso en medio de
   una evacuación real. Agregada `Db.getPuntosHabilitadosDeEvento` +
   validación (`400` si no es uno de los puntos activos de ese evento).
4. **`POST /confirmaciones` bufferaba el body sin límite de tamaño**
   (`lib/http.ts`) — un body arbitrariamente grande se acumulaba entero en
   memoria antes de siquiera intentar parsearlo, en el único proceso Node
   que también maneja todo el tráfico MQTT. Límite de 64KB (de sobra para
   el body más grande real), `413` si se excede. Al arreglar esto se
   encontró un segundo bug en el propio fix: destruir el socket antes de
   escribir la respuesta mandaba la conexión vacía en vez del `413` —
   corregido el orden (responder primero, cortar después).
5. **La ruta de `GET /simulacros/cumplimiento` matcheaba con `startsWith`**
   (`lib/http.ts`) — `/simulacros/cumplimientoXYZ` (typo, scanner, ruta
   futura sin relación) se procesaba igual que la ruta real en vez de caer
   al 404. Cambiado a comparar `url.pathname` exacto, parseado una sola
   vez arriba en vez de comparar `req.url` crudo en cada rama.

Los 5 probados de punta a punta contra Supabase y Mosquitto reales, no
solo con tests: fechas de fin de mes con los tests unitarios nuevos; el
resto con curl/mosquitto_pub contra el servidor corriendo — `puntoId`
inventado → `400`, uno real → `200`; body de 100KB → `413` limpio; ruta
con prefijo parecido → `404`. Datos de prueba limpiados. 67/67 tests,
typecheck limpio.

## Revisión de código (2026-08-28)

Segunda pasada, sobre lo que se sumó desde la revisión anterior: barridos
de padrón y "próximo simulacro", panel del simulador de consola, y el
contador incremental de Accountability. 3 hallazgos, los 3 reales:

1. **`marcarSimulacrosVencidosComoNoRealizados` sin `try/catch` por ítem**
   (`handlers/simulacro.ts`) — al enganchar el broadcast de "próximo
   simulacro" dentro de `resolverSimulacroProgramado` (ver "Sincronización
   de próximo simulacro"), esa función pasó a hacer I/O extra (una query +
   una publicación MQTT) dentro del loop de vencidos, sin la protección
   que si tienen los otros dos barridos del mismo lote
   (`sincronizarPadronDeTodosLosSitios`, `sincronizarSimulacroDeTodosLosSitios`).
   Un fallo transitorio en un solo simulacro (ej. el broadcast) frenaba el
   resto del `for` y dejaba sin marcar todo lo que venía después en la
   lista, no solo lo que falló. Agregado el mismo `try/catch` por ítem que
   ya usan los otros barridos.
2. **Barridos por sitio secuenciales en vez de paralelos**
   (`sincronizarPadronDeTodosLosSitios`, `sincronizarSimulacroDeTodosLosSitios`)
   — cada sitio es independiente y ya estaba aislado por su propio
   `try/catch`, pero se recorrían uno por uno con un `for` — con N sitios,
   la latencia del barrido crece con N sin necesidad. Cambiado a
   `Promise.allSettled`.
3. **El patrón de barrido estaba duplicado** entre `padron.ts` y
   `simulacro.ts` (recorrer sitios, aislar fallos, loguear). Unificado en
   `lib/barrido.ts` (`barridoPorSitio`), que de paso resuelve el hallazgo
   2 (usa `Promise.allSettled` internamente) — los dos handlers ahora lo
   llaman en vez de repetir el loop.

Validado contra Supabase y Mosquitto reales: insertados 2 simulacros
vencidos en el mismo sitio, reiniciado el backend — el log confirmó
`marcados no_realizado: 2` (contador que ahora solo suma los que
efectivamente se resolvieron, no el tamaño de la lista de vencidos) y
ambos quedaron `no_realizado` en la base. `npm run typecheck` limpio,
70/70 tests. Datos de prueba limpiados.

## Decisiones pendientes (para no perderlas de vista)

- Auto-disparo de un simulacro sorpresa por el propio backend (sin que un
  humano tenga que apretar nada en la consola a la hora exacta) — quedó
  descartado por ahora por ser un cambio de arquitectura más grande (hoy
  TODO evento nace de un mensaje MQTT que manda una consola; esto
  necesitaría que el backend genere el evento él mismo). Ver README,
  "Simulacro sorpresa" — se optó por seguir dependiendo de un humano
  (que sabe la fecha aunque el resto del sitio no) para disparar.
- ~~Configurar un proveedor SMTP propio en Supabase~~ — **resuelto
  (2026-08-29)**: Gmail vía contraseña de aplicación, probado con un
  envío real que llegó a destino (ver "Alta de operadores y login web
  para admins"). Ojo con el límite de envío de Gmail (500/día en
  cuentas normales) si esto crece — para volumen más alto conviene
  pasar a un proveedor transaccional (Resend, SendGrid, etc.).
- ~~Autoregistro de `personas` por código de acceso~~ — **resuelto
  (2026-08-29)**, ver "Autoregistro de personas (Mobile)". El paso
  manual pendiente (habilitar "Anonymous Sign-ins" en el dashboard de
  Supabase) ya se hizo — y con eso habilitado se cerró primero el rate
  limiting de los tres endpoints, ver "Precauciones al habilitar
  Anonymous Sign-ins".
- **Aprobar/rechazar un autoregistro** (`personas.estado:
  "pendiente_aprobacion" → "activo"/"rechazado"`) no tiene una pantalla
  ni un endpoint propio todavía — es una escritura directa de Frontend
  contra Supabase (misma lógica que dar de baja un operador, ver "Alta
  de operadores"), pero ninguna pantalla de Cowork la cubre puntualmente
  todavía. Cuando exista, avisarle a la persona que ya puede usar la
  app (push, si para entonces ya tiene `push_token`) es la parte que sí
  necesitaría lógica de backend.
