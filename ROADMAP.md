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

## 2. Gap real encontrado hoy: Mobile no puede leer casi nada por RLS

Al revisar qué le falta a Mobile para funcionar de punta a punta,
encontré que **`puntos_encuentro`, `eventos`, `confirmaciones`,
`eventos_puntos_estado`, `sitios` y `tipos_evento` solo tienen la
política `org_isolation`** (admin-only, vía
`internal.auth_organizacion_id()`) — igual que estaban antes de agregar
`personas_self_read`. Una sesión de Mobile (persona, no operador) no
puede leer ninguna de esas tablas.

Para la alerta en sí no es un problema — `armarMensajeDespacho` ya manda
`eventoId`, `tipo` y `sitioId` resueltos como texto plano dentro del
`data` del push. **Pero para que la persona pueda elegir a qué punto de
encuentro se dirige y confirmar `POST /confirmaciones` con un `puntoId`
real, hoy no tiene forma de enterarse de la lista de puntos habilitados
de ese evento.** Tampoco puede ver su propio historial de
confirmaciones pasadas.

Dos formas de cerrarlo (a decidir cuando se arranque Mobile de verdad):

- Política RLS nueva, tipo `puntos_encuentro_lectura_publica_del_sitio` /
  `confirmaciones_self_read` (mismo patrón que `personas_self_read`).
- O un endpoint de lectura dedicado (`GET /eventos/:id/puntos`,
  `GET /personas/:id/confirmaciones`) — más control, pero un ida y
  vuelta más contra el backend en vez de ir directo a Supabase.

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

## 4. Mobile — no existe código todavía

Backend listo para: sesión anónima de Supabase Auth (`signInAnonymously()`,
ya habilitado), `POST /personas/reclamar`, `/autoregistro`,
`/canjear-codigo`, `/push-token`, lectura de la propia fila
(`personas_self_read`), recepción de push (FCM) y `POST /confirmaciones`.

Pendiente antes de poder construir la app de punta a punta: el gap de
RLS del punto 2 (elegir punto de encuentro, ver historial propio).

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

- **Frontend Web — todas las pantallas base del wireframe unificado ya
  están construidas** (login + selector de sitio + Operadores + Padrón
  de Personas completo + Accountability en vivo + Panorama + Historial +
  Puntos de encuentro + Programador de Simulacros + Configuración +
  Sitios + Consolas). Lo que sigue es elegir entre: (a) las ideas
  superadoras charladas para SMS (aviso de recordatorio, WhatsApp
  Business API — ver sección 3), (b) empezar Mobile (sección 4, no
  existe código todavía), o (c) las notas pendientes de abajo, ninguna
  bloquea nada de lo anterior:
  - El gap de RLS del punto 2 es específico de **Mobile** (una sesión de
    `persona`, no de admin) — sigue pendiente solo para cuando se
    arranque Mobile de verdad.
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
