# Frontend Web — Emergencias Refinería

Panel de administración para HSE/operadores admin: login, selector de
sitio, y (a medida que se construyan) las pantallas de gestión —
operadores, personal/padrón, sitios, consolas, simulacros,
accountability en vivo. Ver `../ROADMAP.md` para el estado de todo el
proyecto y qué falta acá puntualmente.

## Stack y por qué

- **Vite + React 18 + TypeScript.** SPA de verdad (routing, estado,
  formularios, tablas) — a diferencia de `backend-server/lib/http.ts`
  (un puñado de rutas, sin framework se justifica), acá SÍ hace falta
  algo con componentes y manejo de estado.
- **CSS plano, sin Tailwind ni UI kit** — los wireframes de Cowork
  (Login y Selector de Sitio, Wireframe unificado) ya vienen con un
  sistema de diseño completo en CSS plano (variables de color,
  tipografías, componentes) — portarlo tal cual es más fiel y más
  rápido que traducirlo a utility classes. Ver `src/styles/tokens.css`
  para las variables compartidas; cada pantalla nueva debería reusarlas
  en vez de inventar colores.
- **`@supabase/supabase-js`, siempre con la clave `anon`** — nunca
  `service_role` (esa vive solo en `backend-server`, del lado del
  servidor). Todo lo que esta app lee/escribe directo contra Supabase
  pasa por RLS.
- **react-router-dom** para las rutas — nada exótico, `BrowserRouter` +
  `Routes`.

## Sistema de diseño

Copiado de los wireframes de Cowork ("Login y Selector de Sitio",
"Emergencias Refinería — Wireframe unificado"): control-room oscuro por
default (con variante clara vía `prefers-color-scheme` o
`data-theme="light"`), acento naranja, **Big Shoulders Display** para
títulos, **IBM Plex Sans** para el cuerpo, **IBM Plex Mono** para
números/datos tabulares. Las variables viven en `src/styles/tokens.css`
— cualquier pantalla nueva las reusa (`var(--accent)`,
`var(--surface)`, etc.) en vez de hardcodear colores.

## Auth (2026-08-29)

Frontend Web es **solo para admins activos** (decisión tomada con el
usuario, ver `backend-server/README.md`, "RLS: auditoría de seguridad
antes de arrancar Frontend Web"): un operador `rol: "operador"` nunca
tiene login web, se autentica con PIN directo en la consola física.

Flujo real (`src/lib/auth.tsx`, `AuthProvider`):

1. `supabase.auth.signInWithPassword({ email, password })`.
2. Si el login de Auth funciona, se busca la fila de `operadores` con
   `auth_user_id` igual al usuario logueado (`select ... .eq("auth_user_id", ...)`).
   Esto pasa por RLS (`org_isolation`) — que exige `rol: "admin"` **y**
   `estado: "activo"` para dejar leer la fila (ver
   `internal.auth_organizacion_id()`). Un operador no-admin, de baja, o
   sin ninguna fila vinculada da el mismo resultado: **cero filas** —
   indistinguible desde acá, y a propósito (no delatar por qué).
3. **Sin fila de operador → se cierra la sesión de Auth de inmediato**
   y se muestra "Esta cuenta no tiene acceso a Frontend Web." — no
   queda una sesión autenticada pero inútil colgada en el navegador.
4. Con fila de operador, se resuelve el alcance de sitios
   (`src/lib/sitios.ts`): `alcance_tipo: "organizacion"` → todos los
   sitios de la organización; `alcance_tipo: "sitio"` → los de
   `operadores_sitios` para ese operador. Un sitio → redirección directa
   (sin selector); más de uno → grilla de sitios, con el estado
   "Evento real"/"Sin novedades" resuelto contra `eventos.estado`.

Todavía no probado contra Supabase real con `npm run dev` de verdad (sin
navegador headless disponible en este entorno) — sí validado por
lectura: los nombres de columna/tabla usados en `auth.tsx` y `sitios.ts`
se confirmaron contra el esquema real vía `execute_sql` antes de
escribir las queries (`operadores`, `operadores_sitios`, `sitios`,
`eventos`, `tipos_evento`, y los valores de los enums `rol_operador`,
`estado_operador`, `alcance_tipo`, `estado_evento`). `npm run typecheck`
y `npm run build` sí corridos y limpios acá — ver más abajo. Falta la
prueba real con un admin/browser antes de darlo por verificado del
todo.

## Rutas

- `/login` — pública. Si ya hay sesión con operador resuelto, redirige
  a `/`.
- `/` — protegida (`ProtectedRoute`, ver `src/components/`). Selector
  de sitio; auto-resuelve a una sola opción con CTA si el alcance es un
  único sitio.
- `/operadores` — protegida. Alta/edición/baja-reactivación/reseteo de
  PIN, ver "Administración de Operadores (2026-08-29)" más abajo.
- `/panorama`, `/sitio/:id` — protegidas, **todavía stubs**
  (`src/routes/Placeholder.tsx`) — el Panorama de Sitios y el
  Accountability en vivo reales no están construidos aún, ver
  `../ROADMAP.md`.

Nav mínima en el `<Topbar>` (Inicio / Operadores / Personas / Simulacros /
Puntos / Consolas / Sitios* / Configuración, *solo alcance organización)
— un rail lateral de verdad queda para cuando haya más pantallas que lo
justifiquen (ver `../ROADMAP.md`).

## Administración de Operadores (2026-08-29)

Ver Cowork "Administración de Operadores". Alta, edición, baja/
reactivación y reseteo de PIN de operadores — mismo criterio de
"backend solo donde hace falta" que ya documenta
`backend-server/README.md`:

- **Alta** (`POST /operadores`) y **reseteo de PIN**
  (`POST /operadores/:id/resetear-pin`) pasan por `backend-server` —
  necesitan generar y hashear un PIN, e invitar por email si
  corresponde, ninguna de las dos cosas es posible desde el navegador.
- **Editar** (nombre/legajo/rol/alcance) y **dar de baja/reactivar**
  son escritura directa contra Supabase — `org_isolation` ya se lo
  permite a un admin, y no necesitan generar nada del lado del
  servidor.

**Deviación deliberada del wireframe**: el wireframe no tiene campo de
email en el formulario de alta — acá se agregó uno opcional ("Email
para login web"), visible solo cuando el rol es Admin, porque
`POST /operadores` sí soporta invitar por email en el momento de
crear, y sin el campo esa capacidad quedaba inalcanzable desde la UI.

**Gap conocido, no resuelto acá** (ver `../ROADMAP.md`): no hay forma
de invitar por email a un operador que ya existe — la Admin API de
Supabase solo se llama desde `POST /operadores`, en el momento de
crearlo. Si se edita un operador para pasarlo a rol Admin más tarde,
esta pantalla no le da login web automáticamente; haría falta un
endpoint nuevo del lado del backend.

**Validado contra Supabase y backend-server reales** (no solo
compilación): con un admin de prueba (JWT real) se probaron las mismas
queries/llamadas que usa `lib/operadores.ts`/`lib/sitios.ts` —
`listarSitiosDeOrganizacion`, `listarOperadores` (incluido el join con
`operadores_sitios`), `POST /operadores` real (devuelve un PIN de 4
dígitos), `POST /operadores/:id/resetear-pin` real (da un PIN distinto
al anterior), edición y baja/reactivación por escritura directa
(confirmadas releyendo después de cada escritura), y el caso de error
real (`sitiosIds` vacío con `alcanceTipo: "sitio"` → `400`). Todo el
dato de prueba borrado al terminar. `npm run typecheck` y
`npm run build` limpios.

## Pendientes de aprobación (2026-08-29)

Ver Cowork "Administración de Padrón de Personas" (pestaña "Pendientes
de aprobación") — **solo esa pestaña**, no la pantalla completa de
Padrón (que también tiene Padrón/Importar/Códigos, ver "Qué falta" más
abajo). Ruta `/personas/pendientes`.

- **Listar** — lectura directa contra Supabase (`org_isolation` ya le
  permite a un admin leer cualquier `persona` de su organización, con
  `estado: "pendiente_aprobacion"`), con el nombre del sitio embebido
  vía la FK (`sitios(nombre)`).
- **Aprobar/rechazar** — `POST /personas/:id/aprobar` y `/rechazar`
  reales, sin paso de confirmación intermedio (mismo criterio que el
  wireframe: es una cola chica que un admin revisa seguido, no una baja
  destructiva). Aprobar muestra si el aviso por push llegó a intentarse
  o no (`notificado`/`errorNotificacion` que devuelve el backend).

Validado contra Supabase y backend-server reales: dos personas de
prueba en `pendiente_aprobacion`, `listarPendientes` las trae con el
nombre de sitio resuelto, `rechazar` real pasa una a `rechazado`,
`aprobar` real (sin `push_token`) pasa la otra a `activo` con
`notificado: false` sin error, y un re-listado confirma que ninguna
sigue apareciendo como pendiente. Todo el dato de prueba borrado al
terminar. `npm run typecheck`/`build` limpios.

De paso: `.intro`/`.empty` (usados por las tres pantallas hasta ahora)
pasaron a `styles/tokens.css`, y `.btn-ok`/`.icon-btn.good`/`.bad`
(variantes de color para aprobar/reactivar) se sumaron ahí también.

## Accountability en vivo (2026-08-29)

Ver Cowork "Accountability en Vivo". La pantalla real detrás de
`/sitio/:id` — hasta ahora era el stub `Placeholder.tsx` desde el
primer corte de login + selector. Reusa el `<Topbar>` compartido de la
app (nav + logout) en vez del rail/topbar propios del wireframe; la
franja de evento (tipo, quién lo disparó, reloj transcurrido) se agrega
debajo, no en vez de la nav.

Todo lectura directa contra Supabase — **cero llamadas a
backend-server**, `org_isolation` ya le da a un admin acceso completo a
`eventos`/`confirmaciones`/`accountability_contadores`/
`puntos_encuentro`/`consolas` de su organización:

- **Franja de evento** — tipo, operador que lo disparó, consola de
  origen, modo (real/simulacro) y reloj transcurrido (tick cada
  segundo, calculado client-side desde `iniciado_at`).
- **KPIs + puntos de encuentro** — leídos de
  `accountability_contadores` (el contador incremental que ya mantiene
  un trigger de Postgres, no hace falta recontar `confirmaciones` a
  mano). Se muestran TODOS los puntos activos del sitio, no solo los
  que ya tienen gente. Clic en un punto filtra la tabla de al lado.
- **Tabla de personal** — de `confirmaciones` con `personas` y
  `puntos_encuentro` embebidos; filtro por estado (chips) + búsqueda
  por nombre/DNI/legajo, clic en una fila abre el drawer compartido con
  el detalle (incluida la nota si pidió ayuda) y un link `tel:` para
  llamar.
- **Consolas del sitio** — nombre, en línea/sin conexión, último
  heartbeat. Simplificado respecto al wireframe: batería, camino de red
  activo y firmware no se sincronizan a Supabase hoy (viven solo en la
  Pi/ESP32), ver `../ROADMAP.md`.
- **Refresco por polling cada 10s**, no Supabase Realtime — para no
  sumar una dependencia nueva en este primer corte. Queda anotado como
  posible mejora.
- **"Sin evento en curso"** — estado propio, no está en el wireframe
  (que asume que siempre hay un evento activo para poder mostrar la
  pantalla armada).

**Deliberadamente no construido** (ver el wireframe completo y
`../ROADMAP.md`): deshabilitar/rehabilitar un punto de encuentro con
aviso a las personas — necesita diseño de backend propio
(`puntos_encuentro.activo` ya existe pero es un flag permanente, no
"deshabilitado para ESTE evento"); "marcar visto" desde la ficha de una
persona — no hay ningún campo de "visto" en el esquema. **Frontend Web
nunca dispara ni cierra eventos** — eso lo sigue haciendo solo la
consola física (ver Cowork "Panorama de Sitios"), por eso no hay ningún
botón de cerrar evento acá.

Validado contra Supabase real: evento `en_curso` real (tipo, operador,
consola reales) más 3 confirmaciones de prueba (ok/ayuda con
nota/pendiente) — confirmado que **el trigger de Postgres pobló
`accountability_contadores` solo**, sin insertarlo a mano; los
totales agregados, el desglose por punto, los embeds de
`personas`/`puntos_encuentro` en el detalle, y el listado real de
consolas del sitio, todos correctos. Datos de prueba borrados al
terminar. `npm run typecheck`/`build` limpios.

## Panorama de Sitios (2026-08-29)

Ver Cowork "Panorama de Sitios". Ruta `/panorama` — el otro destino que
ya linkeaba el Selector de Sitio (`panorama-cta`), hasta ahora un stub.
Reusa `getEventoActivo`/`getContadores` de `lib/accountability.ts` y
`listarConsolas` de `lib/consolas.ts`: es literalmente la misma
pregunta ("¿este sitio tiene un evento en curso, y cómo va?") hecha
para todos los sitios de la organización a la vez.

- **Solo para admins de alcance `"organizacion"`** — un admin de
  alcance `"sitio"` ni ve el CTA hacia acá en el Selector, pero nada le
  impide teclear `/panorama` directo; `org_isolation` técnicamente lo
  dejaría (no distingue `alcance_tipo`, ver `backend-server/README.md`),
  así que el guardado (`<Navigate to="/" />` si `alcanceTipo !==
  "organizacion"`) se hace a nivel de aplicación — el alcance es un
  límite de producto, no solo de RLS.
- **Grilla de tarjetas por sitio** — evento activo con sus KPIs (mismos
  cuatro números que la franja de Accountability, resumidos) o "sin
  novedades"; clic en una tarjeta navega a `/sitio/:id`.
- **De paso**: `.sites-grid`/`.site-card`/`.status-pill` (base) —
  duplicados entre esta pantalla y el Selector de Sitio — pasaron a
  `styles/tokens.css`. `<Topbar>` suma un prop `extra` opcional (usado
  acá para el badge "Solo monitoreo").

**Deliberadamente no construido**: el "mapa esquemático" ilustrativo
del wireframe (usa posiciones x/y inventadas para dibujar pines, no
ligadas a `sitios.lat`/`lng` reales — portarlo tal cual habría sido
fiel al wireframe pero falso a los datos reales; usar las coordenadas
reales necesitaría una librería de mapas, fuera de alcance de este
corte) y el texto de "último simulacro" para sitios sin evento activo
(eso es terreno de Historial, todavía sin construir, ver `../ROADMAP.md`).

Validado contra Supabase real: los 3 sitios reales de la organización,
uno con un evento real armado a propósito — confirmado que aparece
como activo con sus totales agregados correctos, que los otros dos NO
muestran ningún evento fantasma, y que cada sitio trae sus consolas
reales. Datos de prueba borrados al terminar. `npm run typecheck`/
`build` limpios.

## Historial de simulacros (2026-08-29)

Ver Cowork "Programador de Simulacros" (sección "Historial de
cumplimiento") y `backend-server/README.md` ("Vista de cumplimiento").
Ruta `/simulacros/historial`. A diferencia de las pantallas anteriores,
pasa por **backend-server** (`GET /simulacros/cumplimiento`), no
lectura directa — la granularidad real (por `(sitio, tipo de evento)`,
no un log de cada ocurrencia pasada) ya la calcula
`logic/cumplimiento.ts` del backend; replicarla en el cliente sería
duplicar esa lógica.

**Deviación deliberada del wireframe**: "Programador de Simulacros"
muestra un log fila por fila de cada ocurrencia pasada, de un sitio a
la vez (con un selector de sitio). El endpoint real da un resumen por
`(sitio, tipo)` — el último resuelto, el próximo programado, y si está
al día — no un historial completo fila por fila. Portar el wireframe
tal cual hubiera significado inventar datos que el backend no
devuelve; en cambio se armó como una **matriz de cumplimiento**
(tabla, filtrable por sitio y por "al día"/"vencidos"), que es lo que
el dato real permite mostrar bien — y calza con lo que el propio
comentario de `logic/cumplimiento.ts` dice que le importa a un
responsable de seguridad. El programador de simulacros en sí (alta,
edición, cancelación) no está en esta pantalla, ver `../ROADMAP.md`.

**Hallazgo real en el camino**: al leer `db.ts` para armar esta
pantalla, encontré que `GET /simulacros/cumplimiento` sin `sitioId`
(el caso normal acá — un admin viendo el cumplimiento de todos sus
sitios) devolvía el historial de **todas las organizaciones** del
proyecto, no solo la del admin que llamaba — corregido del lado del
backend antes de construir esta pantalla, ver
`backend-server/README.md`, "Hallazgo de seguridad".

Validado contra backend-server y Supabase reales: tres filas de prueba
para el mismo `(sitio, tipo)` — un `no_realizado` viejo, un
`realizado` más reciente, y un `programado` a futuro — confirmado que
`ultimoResuelto` elige el más reciente por fecha (no por orden de
inserción), `alDia` da `true` porque el último resuelto fue
`realizado`, y `proximoProgramado` no es `null`. Todo el dato de
prueba borrado al terminar. `npm run typecheck`/`build` limpios.

## Códigos de acceso (2026-08-29)

Ver Cowork "Administración de Padrón de Personas" (pestaña "Códigos de
acceso"). Ruta `/personas/codigos`. Un código generado acá es lo que
alguien ingresa en Mobile (`POST /personas/canjear-codigo`, construido
en una sesión anterior) para autoregistrarse al instante.

**Reevaluación de `../ROADMAP.md`**: decía "acá sí falta backend". Al
diseñar esta pantalla encontré que no es así — generar y revocar un
código no necesita `service_role` (no hay PIN que hashear ni email que
invitar), `org_isolation` ya le permite a un admin escribir en
`codigos_acceso` directo. Es escritura directa contra Supabase, mismo
criterio que editar/dar de baja un operador.

- **Formato del código** — `EMPRESA-XXXX` (3 letras + 4 hex mayúsculas),
  mismo formato que el wireframe, pero generado con
  `crypto.getRandomValues` en vez de `Math.random()` — es un código que
  le da acceso real a alguien para empezar a recibir alertas, mismo
  criterio que el PIN de operadores.
- **Unicidad** — hay un índice único real `(organizacion_id, codigo)`
  en la base; si un intento choca (2^16 combinaciones por prefijo, muy
  improbable pero real), se reintenta con un código nuevo en vez de
  fallar.
- **Individual** (atado a un DNI, `tope_usos: 1`) vs. **lote/cuadrilla**
  (`tope_usos` configurable, compartido) — mismo drawer con un toggle,
  igual que el wireframe.

Validado contra Supabase y backend-server reales, con el circuito
**completo**, no solo la escritura: un admin real generó un código
individual (formato confirmado `EMPRESA-XXXX`), y ese mismo código se
canjeó de verdad desde una sesión de Mobile real
(`POST /personas/canjear-codigo`) — la persona quedó `activo` y el
código quedó `agotado` con `usos_actuales: 1`. También validado
`listarCodigos` (embed `sitios(nombre)`) y `revocarCodigo` (escritura
directa, confirmada al releer). Todo el dato de prueba borrado al
terminar. `npm run typecheck`/`build` limpios.

De paso: `.confirm-row`/`.cr-text`/`.cr-actions` (ya duplicados entre
Operadores y esta pantalla) y un `.row-actions` genérico (antes
`.op-actions`/`.p-actions`, dos nombres para lo mismo) pasan a
`styles/tokens.css`, junto con `.seg-toggle` (antes `.role-toggle`/
`.scope-toggle` en Operadores) y `.btn-secondary`.

## Hallazgo de seguridad: Accountability en vivo no respetaba el alcance del admin (2026-08-29)

Encontrado en una revisión general del proyecto (no al construir una
pantalla nueva). `/sitio/:id` (Accountability en vivo) tomaba el
`sitioId` de la URL y consultaba Supabase directo, sin chequear que ese
sitio estuviera dentro del **alcance** del admin logueado. El Selector
de Sitio y Panorama de Sitios sí filtran qué sitios *mostrar* — pero
nada impedía **teclear la URL directo** con el id de otro sitio de la
misma organización. Y no era solo un problema de "la pantalla no lo
esconde": **RLS tampoco lo frena** — `org_isolation` exige rol admin +
organización, pero no distingue `alcance_tipo` (ver
`backend-server/README.md`), así que un admin de alcance `"sitio"`
podía ver el accountability en vivo completo (nombres, DNI, teléfonos,
estado del evento) de un sitio ajeno a su alcance, dentro de su propia
organización.

**Corregido**: nueva `sitioEstaEnAlcance(operador, sitioId)` en
`lib/sitios.ts` — mismo criterio que ya usa Panorama para admins de
alcance `"sitio"` (`org_isolation` es un límite de organización, el
alcance es un límite de producto que hay que aplicar en la
aplicación). Accountability la llama antes de cargar cualquier dato;
si el sitio no está en el alcance, redirige a `/` sin haber pedido
nada más. Ante un error de la consulta de alcance en sí, **no
autoriza** — nunca al revés.

Validado contra Supabase real: un admin de prueba con alcance
`"sitio"` vinculado a un único sitio — confirmado que
`sitioEstaEnAlcance` da `true` para su propio sitio y `false` para
otro sitio real de la misma organización, y confirmado además que
**RLS sí deja leer ese sitio ajeno** (prueba de que el gate de
aplicación es la única protección real, no un refuerzo redundante).
Datos de prueba borrados al terminar. `npm run typecheck` limpio.

## Administración de Puntos de Encuentro (2026-08-29)

`/puntos-encuentro`, ver Cowork "Administración de Puntos de
Encuentro". Alta, edición y baja de los puntos de encuentro de un
sitio — nombre + descripción/ubicación en texto libre, sin coordenadas
ni mapa (no hay ese campo en el esquema real de `puntos_encuentro`:
`id, sitio_id, nombre, descripcion, activo, created_at, updated_at`).
"Dar de baja" acá es alta/baja de **configuración permanente**,
distinto del "Deshabilitar punto" temporal del dashboard de
Accountability en vivo (dura lo que dura un evento) — la pantalla deja
esa aclaración explícita, igual que el wireframe.

Desvío deliberado del wireframe: ahí el selector de sitio era un mapa
`SITIOS` fijo con 3 sitios hardcodeados; acá sale de
`listarSitiosVisibles(operador)` (la misma función que ya usan
Panorama y el Selector de Sitio), o sea **ya filtrado por el alcance
real del admin logueado** — no por elección de estilo, sino porque
`org_isolation` en `puntos_encuentro` solo verifica el límite de
ORGANIZACIÓN (`sitio_id IN (select id from sitios where
organizacion_id = auth_organizacion_id())`), igual que el resto de las
tablas — no distingue `alcance_tipo` (mismo hallazgo que
Accountability en vivo). Como acá no hay forma de llegar a un
`sitioId` por URL (a diferencia de `/sitio/:id`), alcanza con que el
selector nunca ofrezca un sitio fuera de alcance — no hace falta un
gate explícito adicional.

Validado contra Supabase real (RLS, no mocks): un admin real de
alcance `"sitio"` vinculado a un sitio real —
crear/listar/editar/dar de baja/reactivar un punto en su propio sitio,
todo OK; intento de **insertar** un punto en el sitio de **otra
organización** bloqueado por RLS (`org_isolation` hereda el `USING`
como `WITH CHECK` al no tener uno propio); intento de **leer** un
punto de otra organización devuelve vacío. Datos de prueba borrados al
terminar. `npm run typecheck`/`build` limpios.

De paso, revisando las pantallas ya construidas para sumar esta,
encontré (no en esta pantalla, en las anteriores) **colisiones reales
de nombres de clase CSS** — todo el CSS es global (no hay CSS Modules
ni scoping), así que dos pantallas con la misma clase pero reglas
distintas chocan en el bundle final según orden de import, no según
qué pantalla está montada. Concretamente: `.toolbar`/`.toolbar
.tb-count`/`.list`/`.toolbar-right` estaban duplicados (con pequeñas
diferencias) en Operadores/Códigos/Pendientes/Historial — ya se
hoistearon a `styles/tokens.css` (dejando solo el delta real en cada
pantalla, ej. `justify-content` o `gap`), lo que de paso corrige una
colisión silenciosa: Historial heredaba sin querer `justify-content:
space-between` de Operadores.css (invisible en la práctica porque
`margin-right:auto` en `.tb-count` ya consumía todo el espacio, pero
accidental igual). También noté que `.field` está definido de formas
incompatibles en `Login.css` y `Accountability.css` (mismo nombre,
layouts distintos) — no lo toqué porque no lo necesitaba para esta
pantalla (usé `.site-picker`, nombre nuevo, para el selector de sitio
en el `<Topbar>`), pero **queda como deuda real para la próxima vez
que se agregue o edite una pantalla con un campo de formulario suelto
fuera de un drawer** — conviene resolverlo entonces, revisando las dos
pantallas a la vez en lugar de adivinar cuál "gana" en el bundle.
También agregué `.info-box` (paleta info/azul) a tokens.css en vez de
reusar `.note-box` (que ya existe en Accountability.css con paleta de
ayuda/rojo) — incluso siendo la primera reutilización, nombres iguales
con reglas distintas es exactamente el problema de arriba, así que
esta vez el nombre nuevo fue a propósito, no un descuido.

## Padrón de Personas: pestañas "Padrón" e "Importar" (2026-08-29)

`/personas/padron` y `/personas/importar` — las dos pestañas que
faltaban de "Administración de Padrón de Personas" (las otras dos,
Pendientes y Códigos de acceso, ya estaban). Con esto la pantalla del
wireframe queda completa. Cambio de estructura: las 4 pestañas ahora
comparten una tira `<PersonasTabs>` (nuevo componente) debajo del
`<Topbar>` — antes cada una tenía su propio título de página suelto sin
ninguna señal visual de que son parte de la misma sección. Desvío
deliberado del wireframe: ahí las 4 pestañas viven en una sola pantalla
con estado en memoria (SPA de una sola página); acá siguen siendo 4
rutas separadas (mismo patrón que el resto de Frontend Web) con la tira
de pestañas como nexo visual — y por eso solo se muestra el contador en
la pestaña **activa**, no en las 4 a la vez: mostrarlo en las otras 3
pediría cargar sus datos de antemano solo para un número. La nav
principal del `<Topbar>` también se simplificó: "Pendientes" y
"Códigos" (que apuntaban cada una a su propia ruta) se unificaron en un
solo link "Personas" → `/personas/padron`, resaltado en cualquiera de
las 4 subrutas.

**Padrón** (`Padron.tsx`/`lib/personas.ts`): lista con
búsqueda/filtros (tipo, estado), alta manual, editar, dar de
baja/reactivar — mismo patrón que Operadores, todo escritura directa
(`org_isolation` ya se lo permite a un admin, sin filtrar por sitio —
consistente con Pendientes/Códigos, que son pestañas de la misma
pantalla). Solo personal **fijo**: el eventual/contratista entra por
código de acceso, nunca desde acá. El DNI es la clave real de identidad
— hay un índice único `(organizacion_id, dni)` en la base (confirmado
contra el esquema real), así que dos personas nunca pueden compartir
DNI en la misma organización sin importar el tipo; el alta/edición
atrapa el `23505` de Postgres y lo muestra como un mensaje claro en vez
de un error crudo.

**Importar** (`Importar.tsx`/`lib/importarPadron.ts`): desvío
deliberado grande del wireframe, documentado en detalle en el propio
archivo. Ahí "importar" es un botón que simula subir un archivo fijo
(`padron_agosto.xlsx`) con datos inventados; acá se sube un **CSV real**
(no el binario de Excel — se rechaza un .xlsx/.xls con un mensaje
pidiendo exportarlo como CSV primero) que se parsea y se diffea de
verdad contra el padrón real: parser CSV propio (RFC 4180 simplificado,
delimitador coma o punto y coma, campos con o sin comillas — sin sumar
una librería nueva solo para esto), upsert por DNI. El diff separa 5
casos: **altas** (DNI nuevo), **cambios** (teléfono/legajo/sitio/nombre
distintos), **posibles bajas** (fijo activo que no aparece en el
archivo), **conflictos** (el DNI ya pertenece a alguien no-fijo — el
import no lo puede "convertir" a fijo sin que un admin lo decida a
propósito) y **errores de sitio** (el nombre de sitio del archivo no
coincide con ninguno real). "Confirmar import" aplica altas y cambios
fila por fila (no en una sola transacción, para que un problema puntual
en una fila no tire abajo el resto); las posibles bajas **nunca se
aplican solas** — quedan en la misma pantalla de resultado, cada una
con su propio botón de "Dar de baja", hasta que un admin resuelve cada
una a mano (desvío del wireframe: prometía que reaparecerían en la
pestaña Padrón para revisar más tarde, pero no hay ningún campo en el
esquema para persistir "no apareció en el último import" — prometer
esa persistencia hubiera sido deshonesto, así que quedan resueltas ahí
mismo en el momento en lugar de diferidas).

**Hallazgo real, de paso**: revisando el esquema para diseñar esto
encontré que `personas.estado` tiene un valor `'vencido'` en el enum,
pensado para personal eventual pasado su fecha de vencimiento — pero
**nada en `backend-server` lo pone nunca en `'vencido'` automáticamente**
(a diferencia de `codigos_acceso`, que si vence lo refleja al leerlo, y
de `simulacros_programados`, que tiene un barrido periódico real). Y la
lógica de despacho de alertas (`logic/eventos.ts`) filtra estrictamente
por `estado === 'activo'` — así que hoy, una persona eventual cuyo
contrato venció sigue recibiendo alertas reales indefinidamente si
nadie la da de baja a mano. No lo arreglé acá (es trabajo de
`backend-server`: un barrido periódico nuevo, mismo patrón que el de
simulacros vencidos) — lo dejo anotado en `../ROADMAP.md`. La pantalla
de Padrón igual puede mostrar y filtrar por `vencido` si algún día algo
lo pone en ese estado (reutiliza el `.status-pill.vencido` ya existente
de Historial, ver más abajo).

**Otro hallazgo, de una colisión de CSS YA EXISTENTE** (no introducida
acá, pero encontrada al ir a reusar `.status-pill.vencido` para esta
pantalla): `.status-pill.vencido` estaba declarado dos veces con
significados **opuestos** — en `Codigos.css` como gris/apagado (un
código vencido/agotado/revocado, mismo tratamiento que "inactivo") y en
`Historial.css` como rojo/alerta (un simulacro vencido, requiere
atención). Como el CSS es global y `Codigos.css` se importa después que
`Historial.css` en el bundle, la regla gris ganaba siempre — el
"Vencido" de Historial se veía gris en vez de rojo, sin que nadie lo
hubiera notado. Corregido escopeando la de Códigos a `.code-row
.status-pill.vencido` (mayor especificidad, sin tocar el JSX). De paso
se hoistearon a `styles/tokens.css`: `.status-pill.active`/`.inactive`
(Operadores + Padrón), `.p-id`/`.p-av`/`.p-name`/`.p-sub`/
`.site-chip-sm` (Pendientes + Padrón — `.p-av` sin color propio a
propósito, cada pantalla define el suyo), `.tipo-pill` base (Códigos +
Padrón), `.search`/`.fselect` (Operadores/Historial + Padrón),
`.import-note` (nuevo, Padrón + Importar), y la tira `.tabs`/`.tab-btn`/
`.tab-count` (las 4 pestañas).

Validado contra Supabase real (no mocks), en dos partes:
- **Lógica pura de parseo/diff** (`lib/importarPadron.ts`, sin ningún
  import de Supabase a propósito — se puede probar sin red ni
  credenciales): parseo con delimitador coma/punto y coma, comillas con
  delimitador embebido, encabezado incompleto, filas con datos
  faltantes, y los 5 casos del diff (alta/cambio/posible
  baja/conflicto/error de sitio) — 14 chequeos contra el módulo real,
  todos pasaron.
- **Escritura real contra Supabase** (RLS): alta manual, DNI duplicado
  en la misma organización → `23505` real, editar, dar de baja/
  reactivar, alta con `origen: 'import'`, `listarPadron` incluye
  activo/de_baja pero **excluye** `pendiente_aprobacion` (confirmando
  que la separación entre pestañas Padrón/Pendientes es real, no solo
  visual), y aislamiento de organización (no se puede leer ni escribir
  una persona en el sitio de otra organización) — 10 chequeos, todos
  pasaron. Datos de prueba borrados al terminar.

`npm run typecheck`/`build` limpios.

## Programador de Simulacros (2026-08-29)

`/simulacros/programador` — alta/edición/cancelación de simulacros
programados (puntuales o recurrentes), ver Cowork "Programador de
Simulacros" y `lib/programador.ts`. Cierra el par con
`/simulacros/historial` (ya construida antes — la mitad de lectura de
la misma wireframe): cada pantalla tiene un link a la otra en su
`intro`, en vez de repetir la sección de historial acá también (el
wireframe sí la repite, porque es una SPA de una sola pantalla en
memoria — acá hubiera sido la misma agregación mostrada dos veces).

Desvíos deliberados del wireframe:
- El selector de sitio (en el `<Topbar>`, reusando `.site-picker` ya
  hoisteado por Puntos de encuentro) sale de `listarSitiosVisibles`
  (alcance real del admin), no de una lista fija — mismo criterio que
  Puntos de encuentro, mismo motivo (`org_isolation` en
  `simulacros_programados` solo valida organización, no `alcance_tipo`,
  vía join a `sitios`).
- El tipo de evento sale de `tipos_evento` real de la organización
  (Incendio/Médico/Sismo/Tóxico/OK en los datos reales de prueba), no
  del mapa `INCENDIO/SISMO/MEDICO/TOXICO/VIENTO` fijo del wireframe —
  con color de badge por nombre normalizado y un gris de default para
  cualquier tipo que no esté en la lista de colores conocidos (ej.
  "OK").
- Solo se expone la recurrencia "posición" (Ocurrencia + Día, ej.
  "Primer Lunes de cada mes", mensual) — el esquema real también
  soporta "intervalo" (cada N semanas/meses) y una `cadaMeses`
  configurable, pero el wireframe tampoco los ofrece.
- La hora se pide y se muestra en UTC explícito, con una aclaración en
  el formulario ("Hora UTC — este sistema no ajusta por huso horario
  del sitio") — el sistema entero trata `fecha_hora` como UTC literal,
  sin conversión de zona horaria por sitio en ningún lado (confirmado
  en `backend-server/src/logic/recurrencia.ts`). De paso, esto expuso
  una inconsistencia real (no introducida acá, ya existente):
  `lib/tiempoRelativo.ts` (`formatearFecha`, usado por Historial) formatea
  con `toLocaleDateString`, que usa el huso del navegador — inofensivo
  hoy porque solo muestra la fecha sin hora y Argentina está a solo 3
  horas de UTC, pero técnicamente incorrecto y podría mostrar el día
  equivocado cerca de medianoche UTC. No lo corregí (cambiaría el
  comportamiento visible de una pantalla ya validada, fuera del alcance
  de esta) — queda anotado en `../ROADMAP.md`.

A diferencia de Puntos de encuentro, programar/editar/cancelar pasan
por **backend-server** (`POST/PATCH/DELETE /simulacros`, nuevos) — ver
`backend-server/README.md` para el porqué completo (motor de fechas +
re-publicación MQTT a la consola física). Listar sitios/tipos/próximos
sigue siendo lectura directa (`org_isolation`).

Validado con 24 chequeos reales contra un `backend-server` corriendo de
verdad (alta puntual y recurrente con la fecha inicial calculada
verificada por día de semana/posición reales, validación de
sitio/tipo ajeno, edición, intento de mover de sitio, cancelación
(delete real), estados terminales, aislamiento completo de
organización) — ver el detalle en `backend-server/README.md`. Más 6
tests unitarios nuevos del motor de fechas
(`primeraOcurrenciaDesde`), 108/108 pasando. `npm run typecheck`/`build`
limpios.

## Configuración de organización (2026-08-30)

`/configuracion` — protegida. Por ahora un único toggle: habilitar/
deshabilitar el despacho por SMS de **toda la organización**
(`organizaciones.sms_habilitado`, ver `backend-server/README.md`, "Toggle
de SMS por organización" para el porqué completo — surgió de que el
usuario quería poder cortar el gasto de SMS masivo, ~USD 0,064/mensaje,
sin tocar código). Escritura directa contra Supabase (`lib/organizacion.ts`
— `org_isolation` en `organizaciones` ya deja a un admin leer/escribir su
propia fila), mismo criterio que Puntos de Encuentro/Códigos de acceso —
no hay endpoint nuevo en backend-server para esto, solo la lectura del
lado del backend al despachar (`Db.getSmsHabilitado`).

Reusa `.seg-toggle` (ya usado en Operadores/Códigos/Programador, vive en
`styles/tokens.css`) en vez de inventar un componente de switch nuevo. El
`.info-box` de abajo cambia de texto según el estado — deja explícito que
el push nunca se ve afectado por este toggle, y que con SMS apagado el
personal sin push token queda directamente sin ningún aviso (no hay
reintento/canal alternativo todavía).

Pantalla nueva en la nav del `<Topbar>` ("Configuración"), ruta
`/configuracion` agregada a `App.tsx`. `npm run typecheck`/`build`
limpios; validado de punta a punta junto con el backend, ver
`backend-server/README.md`.

**Segunda tarjeta agregada (2026-08-30): código de autoregistro en
Mobile** (`organizaciones.codigo_acceso_app`) — ver
`backend-server/README.md`, "Autoregistro: código de organización"
para el porqué completo. Campo de texto + botón "Guardar" (no
autoguarda como el toggle, a propósito: cambiar el código invalida el
que ya estaba circulando en cartelera, no es algo para hacer sin
querer con un clic de más). Normalizado en mayúsculas/sin espacios al
guardar — mismo formato que va a pedir Mobile. Error de código
duplicado (`23505`, otra organización ya lo tiene) mostrado con un
mensaje claro en vez del error crudo de Postgres, mismo criterio que
`lib/personas.ts` con el DNI duplicado.

## Administración de Sitios y Consolas (2026-08-30)

Las dos pantallas que quedaban del wireframe original — ver
`ROADMAP.md`, "Gestión de sitios / consolas / PROG1-4". Mismo criterio
que el resto de administración: escritura directa contra Supabase
(`org_isolation`), sin endpoints nuevos en backend-server.

**`/sitios`** (`lib/sitios.ts`, `crearSitio`/`actualizarSitio`) — alta y
renombrado de sitios, **solo para admins de alcance "organización"**
(mismo guardado de aplicación que ya usa Panorama de Sitios — RLS no
distingue `alcance_tipo`, ver backend-server/README.md). Deliberadamente
acotado a solo `nombre`: `adaptador_control_accesos`/`lat`/`lng`/
`geofence_geojson` son columnas reales en `sitios` pero **nada las lee
todavía**, ni acá ni en backend-server — no tenía sentido construir UI
para configurar algo sin ningún efecto. Tampoco hay baja: `sitios` no
tiene columna de estado (a diferencia de puntos/operadores/personas), un
sitio tiene demasiadas FKs (consolas, personas, eventos, códigos...)
para borrarlo con seguridad desde una pantalla.

Ojo con el nombre: **el link de nav que antes decía "Sitios" (`/`, el
Selector de Sitio) pasó a llamarse "Inicio"** — el nombre "Sitios" quedó
libre para esta pantalla nueva, que es la dueña real de esa palabra (es
el CRUD de la tabla `sitios`). Eran dos cosas distintas compitiendo por
el mismo nombre ("elegir con qué sitio trabajar" vs. "administrar la
lista de sitios") — cambiar la etiqueta del link existente fue más
simple que inventarle un nombre raro a la pantalla nueva.

**`/consolas`** (`lib/consolas.ts`) — alta/edición/baja-reactivación de
consolas + la asignación de PROG1-4 a un tipo de evento
(`consolas.prog_config`, ver backend-server/README.md, "Sincronización
de PROG1-4", y consola-pi/README.md — la pantalla de administración que
faltaba ahí). Con selector de sitio (`listarSitiosVisibles`, mismo
criterio que Puntos de Encuentro) — a diferencia de Sitios, un admin de
alcance "sitio" sí administra las consolas de su propio sitio.
`en_linea`/`ultimo_heartbeat` son de solo lectura, los sigue escribiendo
backend-server desde el heartbeat MQTT real — esta pantalla nunca los
toca, solo los muestra con `tiempoRelativo`.

**Importante sobre PROG1-4**: escribir `prog_config` acá **no publica
nada por MQTT al toque** — llega a la consola física por el mismo
barrido periódico que ya sincroniza el padrón (cada 5 min, o al
reiniciar backend-server), confirmado que tampoco existe un disparo
puntual para el padrón pese a que Frontend Web ya lo administra hace
rato — mismo patrón, mismo límite conocido, no es un bug de esta
pantalla. Ver `backend-server/README.md` para el disparo puntual que
falta agregar el día que se priorice.

Validado con inserts/updates reales equivalentes a los que ejecuta esta
pantalla (sitio de prueba, consola de prueba con PROG1 → un tipo real,
baja/reactivación, borrado al final) contra el proyecto real — el join
`prog_config → tipos_evento` resolvió el nombre correcto, coherente con
lo que ya usa backend-server para publicar el `prog` real. `npm run
typecheck`/`build` limpios.

## Cómo correr esto

```
cp .env.example .env   # completar con las credenciales reales (Supabase anon key + URL de backend-server)
npm install
npm run dev
```

## Qué falta (a propósito, ver `../ROADMAP.md`)

Con login + selector de sitio + Operadores + Padrón de Personas
(Padrón + Pendientes + Importar + Códigos de acceso, las 4 pestañas
completas) + Accountability en vivo + Panorama + Historial + Puntos de
encuentro + Programador de Simulacros, todas las pantallas base del
wireframe unificado están construidas. Queda: **Consolas** y
**Sitios** (administración, no la vista en vivo). `backend-server` ya
tiene listo lo que necesitan — todo escritura directa a Supabase, sin
backend nuevo (ver `../ROADMAP.md`, sección 3).
