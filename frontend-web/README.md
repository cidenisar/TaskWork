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
- `/panorama`, `/sitio/:id` — protegidas, **todavía stubs**
  (`src/routes/Placeholder.tsx`) — el Panorama de Sitios y el
  Accountability en vivo reales no están construidos aún, ver
  `../ROADMAP.md`. El objetivo de este primer corte era dejar el flujo
  de login + selector navegable de punta a punta contra datos reales,
  no las 8 pantallas completas de una vez.

## Cómo correr esto

```
cp .env.example .env   # completar con las credenciales reales de Supabase (clave anon)
npm install
npm run dev
```

## Qué falta (a propósito, ver `../ROADMAP.md`)

Este primer corte es el flujo de entrada (`/login` + `/`) de punta a
punta contra Supabase real — el resto de las 8 pantallas del wireframe
unificado (Panorama, Accountability en vivo, Puntos, Operadores,
Personal/Padrón, Consolas, Sitios, Simulacros) quedan para las próximas
sesiones, una por una. `backend-server` ya tiene listo lo que varias de
ellas necesitan (ver `../ROADMAP.md`, sección 3).
