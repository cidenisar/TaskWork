# Roadmap — qué falta implementar

Consolidado desde los 4 componentes del repo (cada uno mantiene su propia
sección de "Decisiones pendientes" / "Qué falta" más detallada — este
archivo es el índice para arrancar una sesión nueva sin tener que releer
los 4 READMEs enteros). Última actualización: 2026-08-30.

Orden de prioridad acordado con el cliente: **backend pulido primero,
después Frontend Web + Mobile, consola física al final** (ya bastante
avanzada, ver más abajo).

## 1. Backend-server — prácticamente al día

No hay ningún endpoint roto ni a medio hacer. Lo único deliberadamente
diferido:

- **Auto-disparo de un simulacro sorpresa por el propio backend** — hoy
  sigue dependiendo de un humano que lo dispare desde una consola a la
  hora exacta (ver backend-server/README.md, "Decisiones pendientes").
  Cambio de arquitectura más grande, no bloquea nada de lo que sigue.
- **Límite de Gmail (500 envíos/día)** para las invitaciones de
  operadores — alcanza para el volumen actual; si crece, pasar a un
  proveedor transaccional (Resend, SendGrid).
- **Rate limiting en memoria, un solo proceso** — si algún día hay más
  de una instancia de `backend-server` detrás de un balanceador, hay
  que mover esto a Redis/Postgres.
- **CAPTCHA de Supabase (hCaptcha/Turnstile)** para Anonymous Sign-ins —
  capa opcional de defensa en profundidad, no configurada.
- **`personas.estado = 'vencido'` nunca se pone solo** (hallazgo
  2026-08-29, construyendo Padrón de Personas en Frontend Web) — el
  enum lo tiene, pensado para personal eventual pasado su vencimiento,
  pero no hay ningún barrido periódico que lo aplique (a diferencia de
  `simulacros_programados`, que sí tiene uno). Como el despacho de
  alertas filtra por `estado === 'activo'`, una persona eventual con el
  contrato vencido sigue recibiendo alertas reales indefinidamente
  hasta que un admin la dé de baja a mano. Arreglo: un barrido
  periódico nuevo en `backend-server` (mismo patrón que el de
  simulacros vencidos), que marque `vencido` cuando
  `vencimiento < hoy` para `tipo = 'eventual' AND estado = 'activo'`.

## 2. ~~Gap: Mobile no podía leer casi nada por RLS~~ — cerrado (2026-08-30)

Al revisar qué le faltaba a Mobile para funcionar de punta a punta, se
había encontrado que `puntos_encuentro`, `eventos`, `confirmaciones`,
`eventos_puntos_estado` y `tipos_evento` solo tenían la política
`org_isolation` (admin-only) — una sesión de Mobile (persona, no
operador) no podía leer ninguna de esas tablas, así que no podía elegir
a qué punto de encuentro dirigirse durante un evento real ni ver su
propio historial de confirmaciones pasadas.

**Resuelto con la primera opción de las dos que estaban anotadas:**
políticas RLS nuevas (`confirmaciones_self_read`,
`eventos_notificado_lectura`, `eventos_puntos_estado_lectura_notificado`,
`puntos_encuentro_lectura_sitio_propio`, `tipos_evento_lectura_persona`)
en vez de un endpoint de lectura dedicado — mismo patrón directo-a-Supabase
que ya usa Frontend Web, sin ida y vuelta extra contra el backend. Ver
`backend-server/README.md`, "RLS: Mobile puede leer puntos de encuentro,
eventos y su propio historial" para el detalle completo — incluye un
hallazgo real de recursión infinita en política (`confirmaciones` ↔
`eventos`) encontrado al validar contra Supabase real, y su arreglo
(función `SECURITY DEFINER`, mismo patrón que ya usaba
`internal.auth_organizacion_id()`). Validado con clientes `anon` reales,
positivos y negativos (aislamiento entre personas/organizaciones/sitios
ajenos confirmado vacío en los 5 casos).

## 3. Frontend Web — pantallas base completas (2026-08-30)

Nuevo componente `frontend-web/` (Vite + React + TS, CSS plano portado
de los wireframes de Cowork — ver `frontend-web/README.md`). El backend
ya soporta estas pantallas (según los wireframes de Cowork leídos hasta
ahora); falta construir el resto del Frontend:

- ~~**Login + selector de sitio**~~ — **hecho (2026-08-29)**, contra
  Supabase real (Auth + resolución de operador + alcance de sitios).
  `npm run typecheck`/`build` limpios; falta la prueba con un browser
  real de punta a punta (sin headless disponible en este entorno).
- ~~**Panorama de Sitios**~~ — **hecho (2026-08-29)**, `/panorama`, ver
  `frontend-web/README.md`. Validado contra Supabase real (3 sitios
  reales, uno con evento armado a propósito). Gaps deliberados: sin el
  mapa esquemático ilustrativo del wireframe (usaba posiciones
  inventadas, no las coordenadas reales de `sitios.lat/lng`) ni "último
  simulacro" para sitios sin evento (eso es de Historial).
- ~~**Administración de operadores**~~ — **hecho (2026-08-29)**, ver
  `frontend-web/README.md`. Validado además contra backend-server y
  Supabase reales (no solo compilación). Gap conocido: no hay forma de
  invitar por email a un operador que ya existe (solo al crearlo).
- ~~**Aprobar/rechazar autoregistro**~~ — **hecho (2026-08-29)**,
  `/personas/pendientes`, ver `frontend-web/README.md`. Validado contra
  backend-server y Supabase reales.
- ~~**Padrón (alta manual) e Importar (CSV)**~~ — **hecho
  (2026-08-29)**, `/personas/padron` y `/personas/importar`, ver
  `frontend-web/README.md`. Con esto "Administración de Padrón de
  Personas" queda completa (4/4 pestañas). Import es CSV real (no
  .xlsx), parseado y diffeado de verdad contra Supabase — no una
  simulación como el wireframe. Validado con 14 chequeos de lógica pura
  (parseo/diff, sin red) + 10 chequeos reales contra Supabase (alta,
  DNI duplicado, edición, baja/reactivación, aislamiento de
  organización). De paso, encontrado y corregido un hallazgo real de
  colisión CSS (`.status-pill.vencido` con significados opuestos en dos
  pantallas — ver `frontend-web/README.md`), y encontrado (sin
  corregir, es trabajo de backend) el gap de `personas.estado =
  'vencido'` documentado arriba en la sección 1.
- ~~**Historial / cumplimiento de simulacros**~~ — **hecho
  (2026-08-29)**, `/simulacros/historial`, ver `frontend-web/README.md`.
  Armada como matriz de cumplimiento (sitio × tipo), no un log fila por
  fila — es lo que el endpoint real devuelve. De paso encontré y
  arreglé un hallazgo de seguridad real: `GET /simulacros/cumplimiento`
  sin `sitioId` filtraba el historial de simulacros de TODAS las
  organizaciones, no solo la del admin que llamaba — ver
  `backend-server/README.md`, "Hallazgo de seguridad".
- ~~**Accountability en vivo durante un evento**~~ — **hecho
  (2026-08-29)**, `/sitio/:id`, ver `frontend-web/README.md`. Validado
  contra Supabase real, incluido confirmar que el trigger de Postgres
  puebla `accountability_contadores` solo. Gaps conocidos, deliberados:
  sin deshabilitar/rehabilitar puntos de encuentro por evento (necesita
  diseño de backend propio) ni "marcar visto" (no hay ese campo en el
  esquema); refresco por polling cada 10s, no Realtime; el strip de
  consolas no muestra batería/camino de red/firmware (no se sincronizan
  a Supabase hoy).
- ~~**Puntos de encuentro**~~ — **hecho (2026-08-29)**,
  `/puntos-encuentro`, ver `frontend-web/README.md`. Sin coordenadas ni
  mapa (no existen en el esquema real). Selector de sitio ya filtrado
  por el alcance real del admin (mismo criterio que Panorama), a
  diferencia del wireframe que usaba un mapa de sitios fijo. Validado
  contra Supabase real, incluido confirmar que RLS bloquea insertar/leer
  puntos de otra organización. De paso se hoistearon a
  `styles/tokens.css` varias clases CSS duplicadas entre pantallas
  (`.toolbar`/`.list`/`.toolbar-right`) que colisionaban silenciosamente
  en el bundle global — ver nota en `frontend-web/README.md` sobre la
  deuda restante (`.field` sigue duplicado con reglas distintas entre
  Login y Accountability).
- ~~**Programador de Simulacros (alta/edición/cancelación)**~~ —
  **hecho (2026-08-29)**, `/simulacros/programador`, ver
  `frontend-web/README.md` y `backend-server/README.md`. A diferencia
  de la mayoría de las pantallas de administración, esta SÍ necesitó
  backend nuevo (`POST/PATCH/DELETE /simulacros`) — no por RLS, sino
  porque la fecha inicial de un simulacro recurrente necesita el mismo
  motor de fechas que ya usa el backend (nueva función
  `primeraOcurrenciaDesde`, ver `logic/recurrencia.ts`) y porque hay
  que re-publicar `consolas/{id}/simulacro` al toque (el cliente MQTT
  solo vive en backend-server). Validado con 24 chequeos reales contra
  un backend corriendo de verdad + 6 tests unitarios nuevos del motor
  de fechas (108/108 pasando). De paso, notada (no corregida, fuera de
  alcance) una inconsistencia real de zona horaria:
  `lib/tiempoRelativo.ts` en Frontend Web formatea fechas con el huso
  del navegador en vez de UTC, mientras que todo el sistema (incluida
  esta pantalla nueva) trata `fecha_hora` como UTC literal sin
  conversión — inofensivo hoy (solo se ve la fecha, no la hora, y
  Argentina está a 3hs de UTC) pero podría mostrar el día equivocado
  cerca de medianoche UTC. Ver `frontend-web/README.md`.
- ~~**Gestión de sitios / consolas / PROG1-4**~~ — **hecho
  (2026-08-30)**, `/sitios` (solo alcance organización) y `/consolas`,
  ver `frontend-web/README.md` ("Administración de Sitios y Consolas").
  Confirmó la hipótesis: no hizo falta backend nuevo, 100% escritura
  directa a Supabase. Deliberadamente acotado: Sitios es solo
  nombre (sin mapa/geofence/adaptador de control de accesos — columnas
  reales pero sin ningún código que las lea) y sin baja (no hay columna
  de estado); PROG1-4 sigue sin disparo puntual, llega por el mismo
  barrido de 5 min que el padrón (límite conocido, no nuevo). De paso,
  el link de nav "Sitios" (que apuntaba al Selector de Sitio) pasó a
  llamarse "Inicio" para liberar el nombre para la pantalla nueva.
- ~~**Alta y revocación de códigos de acceso**~~ — **hecho
  (2026-08-29)**, `/personas/codigos`, ver `frontend-web/README.md`.
  Reevaluación: resultó no necesitar backend nuevo — generar/revocar no
  usa `service_role`, es escritura directa (`org_isolation`). Validado
  con el circuito completo: un código generado por un admin real se
  canjeó de verdad desde Mobile (`POST /personas/canjear-codigo`).
- ~~**Configuración de organización — toggle de SMS**~~ — **hecho
  (2026-08-30)**, `/configuracion`, ver `frontend-web/README.md` y
  `backend-server/README.md` ("Toggle de SMS por organización") para el
  porqué completo (costo real de SMS masivo, ~USD 0,064/mensaje).
  Surgieron dos ideas superadoras en la misma charla, **ninguna
  construida todavía**, quedan para cuando se prioricen:
  - **Aviso de recordatorio** ("mandar SMS solo a quien no confirmó")
    — hoy el despacho es un único envío al abrir el evento, sin
    reintento; esto necesitaría una feature nueva de recordatorio
    pasado un tiempo, no un simple filtro sobre el envío inicial (en el
    primer envío nadie confirmó todavía).
  - **Super admin de plataforma** — no existe hoy (cada admin está
    acotado a una `organizacion_id`, confirmado). El usuario confirmó
    que el plan real es multi-tenant (varias organizaciones/clientes
    distintos) — cuando eso pase de verdad, un rol por encima de
    `operadores.rol='admin'` va a tener sentido genuino. No se
    construyó porque hoy sigue siendo una sola organización real en
    producción.
  - (También se charló WhatsApp Business API como canal alternativo al
    SMS, más barato/rico — sin investigar todavía.)

## 4. Mobile — primera versión real (2026-08-30)

Nuevo componente `mobile/` (Expo + React Native + TS, ver
`mobile/README.md` para el porqué del stack). Backend listo para todo lo
que necesita: sesión anónima de Supabase Auth (`signInAnonymously()`, ya
habilitado), `POST /personas/reclamar`, `/autoregistro`,
`/canjear-codigo`, `/push-token`, lectura de la propia fila
(`personas_self_read`), lectura de puntos/eventos/historial propio (ver
punto 2, cerrado 2026-08-30), recepción de push (FCM) y
`POST /confirmaciones`. Ya no queda ningún gap conocido de backend/RLS
bloqueando construir la app de punta a punta.

Construido: sesión anónima automática (sin login), los **tres** flujos
de registro ("ya estoy en el padrón", "tengo un código", "soy nuevo" —
ver abajo), pantalla de estado de cuenta (pendiente/rechazado/de
baja/vencido), "Mis alertas" (historial + confirmar una alerta en curso
eligiendo punto de encuentro), registro del token de push. Validado de
punta a punta contra Supabase/backend-server reales (mismo mecanismo
que `consola-virtual.html` para disparar un evento real) — ver
`mobile/README.md`, "Validado".

**Autoregistro** ("no me encontraron, pido el alta") — **resuelto
(2026-08-30)**. La decisión pendiente (cómo sabe la app qué sitios
existen antes de tener una persona vinculada) se resolvió al preguntarle
al usuario: reveló una restricción real que cambió el plan — los
teléfonos de la planta tienen políticas de MDM que no dejan instalar
APKs sueltos, hace falta pasar por una tienda de apps de verdad, lo que
descartaba "un build por organización" como única salida práctica.
Se construyó en cambio **una sola app + un código de organización**
(`organizaciones.codigo_acceso_app`, que un admin comparte con su
personal, configurable desde Frontend Web/Configuración) — ver
`backend-server/README.md`, "Autoregistro: código de organización",
para el detalle completo (incluido el endpoint nuevo,
`POST /organizaciones/resolver-codigo`).

Falta a propósito, ver `mobile/README.md` para el detalle completo:

- **Push real** (recepción en segundo plano) — necesita un development
  build de Expo y un teléfono físico, no se pudo probar en este
  sandbox. El registro del token en sí (`POST /personas/push-token`) sí
  está validado de punta a punta con un token inventado. Dato relevante
  para cuando se priorice: la restricción de MDM de arriba también
  aplica acá — Expo Go no sirve para probar push reales, y el build
  final tiene que salir por una tienda de apps igual.

## 5. Consola física — dejada para el final, pero ya bastante avanzada

- **`consola-pi`** (Node/TS, corre en la Raspberry Pi): flujo completo
  llave→PIN→botón→cuenta regresiva→envío, bloqueo temporal de PIN,
  timeout de heartbeat del ESP32, pantallas de Historial/Diagnóstico/
  Configuración. Pendiente:
  - Failover de conectividad (Ethernet→WiFi→4G) — hoy solo reconecta al
    mismo host, no rota de interfaz.
  - Batería/UPS real en Diagnóstico — muestra "N/D", necesita hardware.
  - Filesystem de solo lectura / boot por NVMe / UPS — configuración de
    la Pi física, fuera del alcance del software.
  - Duración de la cuenta regresiva (5s) y si el relé local espera la
    confirmación del backend o no — valores sin confirmar con el
    cliente.
- **`esp32-firmware`** (C++/PlatformIO): pendiente confirmar pinout
  exacto contra el DevKit real, sentido del selector de llave/polaridad
  del relé, y los timings (`DEBOUNCE_MS`/`BLINK_MS`/`HEARTBEAT_MS`) —
  todo sin hardware real todavía para probarlo.
- **`consola-simulador`** (HTML/JS, para probar sin hardware): al día,
  sin pendientes señalados. Sumada (2026-08-30)
  **`consola-virtual.html`** — a diferencia de `index.html` (un
  formulario crudo de MQTT), es la experiencia real de la consola física
  (llave → PIN → botón → cuenta regresiva → envío) 100% en el navegador,
  puerto fiel de la máquina de estados de
  `consola-pi/src/logic/panel.ts`. Trae su propio broker MQTT local sin
  autenticación (`broker-local.mjs`, `aedes` puro Node — sin Mosquitto,
  sin herramientas de compilación en Windows) para no depender de
  infraestructura externa. Validada de punta a punta: un evento
  disparado desde ahí llega real a `backend-server` y a Supabase. Ver
  `consola-simulador/README.md`.
  - **Hallazgo real, encontrado al armar esto (ya corregido y pusheado,
    2026-08-30)**: los botones físicos **MÉDICO** y **TÓXICO** de la
    consola se perdían en silencio — `Db.getTipoEventoPorNombre`
    comparaba con `.ilike()` (case-insensitive, pero no ignora acentos)
    el `tipo` ASCII fijo del firmware ("MEDICO") contra
    `tipos_evento.nombre` real, que tiene acentos ("Médico") — cero
    matches, evento descartado sin avisarle a nadie. Ver
    `backend-server/README.md`, sección del hallazgo, para el detalle
    completo y la corrección.

## Próximo paso sugerido

- **Frontend Web completo, Mobile con una primera versión real** (ver
  secciones 3 y 4). Lo que sigue es elegir entre: (a) cerrar la decisión
  de Autoregistro en Mobile (necesita al usuario — ver
  `mobile/README.md`, "Qué falta"), (b) las ideas superadoras charladas
  para SMS (aviso de recordatorio, WhatsApp Business API — ver sección
  3), o (c) las notas pendientes de abajo, ninguna bloquea nada de lo
  anterior:
  - El gap de `personas.estado = 'vencido'` (sección 1, arriba) es
    trabajo de `backend-server` (un barrido periódico nuevo).
  - La inconsistencia de zona horaria en `lib/tiempoRelativo.ts`
    (sección 3, Programador de Simulacros) — usa el huso del navegador
    en vez de UTC, inofensivo hoy pero vale la pena corregirlo la
    próxima vez que se toque esa función.
  - La deuda de colisiones CSS globales notada en
    `frontend-web/README.md` (`.field` duplicado entre Login y
    Accountability con reglas distintas) — conviene resolverla la
    próxima vez que se toque una de esas dos pantallas.
- Si se prioriza field-testing (avanzar consola física en preparación
  para probarla) en cambio, confirmar con el cliente los valores
  marcados como "no confirmados" arriba (pinout, timings, duración de
  cuenta regresiva) antes de tocar hardware real.
