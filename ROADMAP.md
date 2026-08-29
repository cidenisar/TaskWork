# Roadmap — qué falta implementar

Consolidado desde los 4 componentes del repo (cada uno mantiene su propia
sección de "Decisiones pendientes" / "Qué falta" más detallada — este
archivo es el índice para arrancar una sesión nueva sin tener que releer
los 4 READMEs enteros). Última actualización: 2026-08-29.

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

## 3. Frontend Web — arrancado (2026-08-29)

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
  backend-server y Supabase reales. Nota: solo la pestaña "Pendientes"
  del wireframe "Administración de Padrón de Personas" — Padrón/
  Importar/Códigos de acceso (las otras 3 pestañas de esa pantalla)
  siguen sin construir.
- ~~**Historial / cumplimiento de simulacros**~~ — **hecho
  (2026-08-29)**, `/simulacros/historial`, ver `frontend-web/README.md`.
  Armada como matriz de cumplimiento (sitio × tipo), no un log fila por
  fila — es lo que el endpoint real devuelve. De paso encontré y
  arreglé un hallazgo de seguridad real: `GET /simulacros/cumplimiento`
  sin `sitioId` filtraba el historial de simulacros de TODAS las
  organizaciones, no solo la del admin que llamaba — ver
  `backend-server/README.md`, "Hallazgo de seguridad". El programador
  de simulacros en sí (alta/edición/cancelación) sigue sin pantalla.
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
- **Gestión de sitios / consolas / PROG1-4 / Padrón (alta manual,
  importar)** — hoy todo por SQL directo, sin ninguna pantalla — ni
  falta ni sobra backend, es 100% trabajo de Frontend + escritura
  directa a Supabase (org_isolation ya lo permite para un admin).
- ~~**Alta y revocación de códigos de acceso**~~ — **hecho
  (2026-08-29)**, `/personas/codigos`, ver `frontend-web/README.md`.
  Reevaluación: resultó no necesitar backend nuevo — generar/revocar no
  usa `service_role`, es escritura directa (`org_isolation`). Validado
  con el circuito completo: un código generado por un admin real se
  canjeó de verdad desde Mobile (`POST /personas/canjear-codigo`).

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
  sin pendientes señalados.

## Próximo paso sugerido

- **Seguir con Frontend Web, pantalla por pantalla.** Con login +
  selector de sitio + Operadores + Pendientes + Accountability en vivo +
  Panorama + Historial + Códigos de acceso + Puntos de encuentro ya
  reales, lo que queda es: **Padrón** (alta manual + import CSV/Excel,
  las otras dos pestañas de "Administración de Padrón de Personas"),
  **Consolas** y **Sitios** (administración, no la vista en vivo — todo
  escritura directa, sin backend nuevo que armar), y el **Programador de
  Simulacros** (alta/edición/cancelación — Historial, la mitad de
  lectura, ya está). Nota: el gap de RLS del punto 2 es específico de
  **Mobile** (una sesión de `persona`, no de admin) — no bloqueó ninguna
  pantalla de Frontend Web construida hasta ahora, `org_isolation` ya le
  da a un admin lectura completa; sigue pendiente solo para cuando se
  arranque Mobile de verdad. También queda pendiente la deuda de
  colisiones CSS globales notada en `frontend-web/README.md`
  (`.field` duplicado entre Login y Accountability con reglas
  distintas) — conviene resolverla la próxima vez que se toque una de
  esas dos pantallas.
- Si se prioriza field-testing (avanzar consola física en preparación
  para probarla) en cambio, confirmar con el cliente los valores
  marcados como "no confirmados" arriba (pinout, timings, duración de
  cuenta regresiva) antes de tocar hardware real.
