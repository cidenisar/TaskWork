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

Nav mínima en el `<Topbar>` (Sitios / Operadores) — un rail lateral de
verdad queda para cuando haya más pantallas que lo justifiquen (ver
`../ROADMAP.md`).

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

## Cómo correr esto

```
cp .env.example .env   # completar con las credenciales reales (Supabase anon key + URL de backend-server)
npm install
npm run dev
```

## Qué falta (a propósito, ver `../ROADMAP.md`)

Con login + selector de sitio + Operadores + Pendientes, van 3 de las 8
pantallas del wireframe unificado (Pendientes es una pestaña, no la
pantalla de Padrón completa) — el resto (Panorama, Accountability en
vivo, Puntos, Padrón/Importar/Códigos de acceso, Consolas, Sitios,
Simulacros) queda para las próximas sesiones, una por una.
`backend-server` ya tiene listo lo que varias de ellas necesitan (ver
`../ROADMAP.md`, sección 3).
