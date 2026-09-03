# Informes

App web (Next.js 16 + Tailwind + Supabase) para que técnicos de campo carguen
**Informes Técnicos** y **Rendiciones de Gastos**. Spec completa en
`PROJECT_SPEC.md` (en esta misma carpeta) — este README es solo cómo correr
y qué está hecho.

El diseño replica 1:1 el wireframe de referencia (tema oscuro, acento
naranja/rojo `#ff7a3d → #ff4747`): ver `src/app/wireframe-ui.css`, portado
directamente del prototipo HTML aprobado por el cliente.

## Estado de esta iteración

✅ Hecho:

- Scaffold Next.js 16 (App Router) + Tailwind 4 + TypeScript, PWA básica.
- Schema completo de Supabase (`supabase/migrations/`) con las ~18 tablas de
  la spec, RLS por rol (Técnico/Supervisor/Administrador) y buckets de Storage.
- Auth real con Supabase Auth (reemplaza el selector de rol mock del
  wireframe) + navegación protegida + sesión con badge de rol.
- Módulo **Informe Técnico** completo: wizard de 4 pasos, catálogos con alta
  "al vuelo", fotos con marca de agua + geolocalización (degrada bien sin
  GPS), "Mejorar con IA" (Claude API) y dictado por voz (Web Speech API),
  generación de PDF **server-side** replicando el diseño aprobado
  (`Informe Tecnico - Diseño PDF.pdf`), historial con búsqueda en lenguaje
  natural, descarga múltiple en `.zip`, y **edición post-generación**
  (`/informe-tecnico/editar/[id]`) — se puede reabrir un informe propio para
  corregir datos/técnicos/vehículos y regenerar el PDF; las fotos ya
  cargadas no se tocan ahí (si hay que cambiar una foto, se rehace el
  informe).
- Módulo **Rendición de Gastos** completo, con flujo **abierta → cerrada**
  real (spec: `estado` de la rendición): "Nueva Rendición" solo carga el
  viático y los datos generales y la deja creada como **abierta**;
  desde `/rendicion-gastos/[id]` se van agregando gastos de a uno — cada uno
  se guarda al toque (comprobante incluido), así se puede volver en
  cualquier momento (otro día, otro dispositivo) a seguir cargando — hasta
  tocar **"🔒 Cerrar rendición y generar PDF"**, que recién ahí arma el PDF
  final y pasa la rendición a **cerrada** (ya no admite más gastos). Los
  técnicos se cargan por gasto, no por rendición (spec 7.1). Categorías con
  alta al vuelo, comprobante por foto, caja de saldo verde/rojo, PDF
  server-side replicando `Rendicion de Gastos - Diseño PDF.pdf`,
  exportación a Excel (`exceljs`, funciona también sobre una rendición
  todavía abierta) e historial con búsqueda en lenguaje natural que
  distingue abiertas ("▶ Seguir cargando") de cerradas.
- Módulo **Configuración** completo (solo Administrador, accesible desde la
  pantalla de inicio — no desde adentro de Informe Técnico/Rendición de
  Gastos, ver nota abajo): logo de la empresa,
  **alta de usuarios y asignación de roles** (el Administrador crea la cuenta
  desde la propia app — email + contraseña temporal generada al vuelo,
  torre opcional — y puede subir/bajar el rol o cambiar la torre de
  cualquiera después, sin pasar por el dashboard de Supabase). **Esta lista
  de usuarios ES el catálogo de técnicos** que aparece sugerido al cargar un
  Informe Técnico o una Rendición de Gastos — ya no hay una carga manual
  aparte en Catálogos. Además: envío automático por email, catálogos con alta/baja (torres,
  provincias, tipos de informe, categorías de gasto), ficha completa de
  vehículos con badges 🟢🟡🔴 de vencimiento, registro de service, alertas
  de flota "Vencimientos 🤖" recalculadas en vivo (documentación + intervalo
  de 10.000 km), umbral de aviso de historial, resumen semanal por IA
  (config + ejemplo) y Registro de Cambios (auditoría — cada alta/baja queda
  en `audit_log` con quién, qué y cuándo).
- Módulo **Estadísticas** completo (Admin/Supervisor): KPIs del mes, gastos
  por categoría e informes por técnico (datos reales), **insights
  automáticos 🤖** (Claude redacta observaciones sobre números ya calculados
  server-side, nunca inventa cifras), **asistente en lenguaje natural 💬**
  con tool-use real de Claude contra 4 consultas agregadas de solo lectura
  (nunca acceso de escritura ni filas crudas), **mapa de calor 🗺** real
  (Leaflet + OpenStreetMap, sin necesitar API key, a diferencia del mock del
  wireframe), **comparación entre técnicos ⚖️** y **mantenimiento
  predictivo 🔧** (cálculo determinístico por torre/ubicación) y
  **verificación de fotos vs. tarea 🔍** con Claude vision, on-demand por
  informe para no disparar un análisis automático (y su costo) en cada
  carga de la página.

Con esto están completos los 4 módulos de la spec (Informe Técnico,
Rendición de Gastos, Configuración, Estadísticas).

⏳ Explícitamente pendiente (jobs de background, no UI):

- El job que efectivamente libera del storage el PDF/fotos pasado el umbral
  configurado (el umbral ya se guarda y se muestra en el historial, pero
  nada lo aplica todavía).
- Resumen semanal por IA y recordatorio de archivo: el switch y el ejemplo
  ya están en Configuración, pero el envío real (cron + email) no está
  implementado.
- Vista de mapa de todas las ubicaciones históricas fuera de Estadísticas —
  explícitamente fuera de alcance en spec sección 6.6/13.

## Setup

### 1. Proyecto de Supabase

Ya hay un proyecto de Supabase creado y con todas las migraciones aplicadas
(`Informes`, org de cidenisar@gmail.com, región `sa-east-1`) — `.env.local`
en este repo ya apunta a ese proyecto. Si en algún momento hace falta
recrearlo o vincular uno nuevo:

```bash
npx supabase login
npx supabase link --project-ref <tu-project-ref>
npx supabase db push          # aplica supabase/migrations/*.sql
```

Eso crea las tablas, RLS y los buckets de Storage (`informe-fotos`,
`comprobantes`, `informes-pdf`, `vehiculo-docs`, `logo-empresa`,
`fotos-perfil`).

### 2. Variables de entorno

```bash
cp .env.example .env.local
```

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Project
  Settings → API en el dashboard de Supabase.
- `SUPABASE_SERVICE_ROLE_KEY`: misma pantalla, clave `service_role` (secreta,
  nunca en el cliente) — la usa Configuración → Usuarios para crear cuentas.
- `ANTHROPIC_API_KEY`: opcional — sin ella, "Mejorar con IA" y el resto de
  las funciones 🤖 avisan que no están disponibles en vez de fallar en silencio.
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL`: opcional — sin ellas, el informe se
  genera igual pero no se manda el email automático.

### 3. Primer usuario Administrador

Ya existe un primer Administrador (cidenisar@gmail.com — credencial enviada
por chat, no vive en el repo). La app todavía no tiene una pantalla de
**auto**-registro (solo login, a propósito — ver spec sección 4): las cuentas
nuevas las da de alta un Administrador desde **Configuración → Usuarios y
roles**, que crea el usuario y le asigna el rol ahí mismo (usa
`supabase.auth.admin.createUser` con la Service Role Key server-side, nunca
expuesta al cliente — ver `src/app/(app)/configuracion/actions/usuarios.ts`).
Necesita la variable `SUPABASE_SERVICE_ROLE_KEY` cargada (Project Settings →
API → service_role) — sin ella, esa sección de Configuración falla al crear
usuarios (el resto de la app sigue funcionando igual).

Desde la misma sección, un Administrador también puede **editar** el nombre/
email de otro usuario, **blanquearle la contraseña** (genera una temporal
nueva, se muestra una sola vez) y **desactivar/reactivar** su cuenta. No hay
un "borrar" real: la fila de `profiles` queda enlazada por FK a los informes
y rendiciones que esa persona generó (a propósito, para que el historial sea
permanente — ver sección 6.5 más abajo), así que un borrado de verdad falla
en cuanto el usuario ya generó algo. "Desactivar" en cambio solo pone
`profiles.activo = false`: bloquea el login (`src/app/login/actions.ts` +
`src/lib/auth.ts`) y saca a la persona del catálogo de técnicos sugerido para
trabajo nuevo, sin tocar ni un dato de lo que ya generó.

Si en algún momento hace falta promover a alguien directamente por SQL (por
ejemplo, para dar de alta el primerísimo Administrador antes de tener otro
que lo haga desde la UI):

```sql
update public.profiles set rol = 'admin' where email = 'otro-admin@empresa.com';
```

(El trigger `handle_new_user` crea el `profile` en `rol = 'tecnico'` en
cuanto alguien se registra vía Supabase Auth.)

Cualquier usuario (técnico incluido) puede, desde **Mi cuenta** (link junto
a "Cerrar sesión" en la barra superior): cambiar su propia contraseña
temporal (pide la actual para confirmar antes de cambiarla), y cargar sus
propios datos — nombre, teléfono y foto de perfil (se muestra "en chiquito"
como avatar en toda la app apenas está logueado), más documentación
personal para uso futuro (DNI + vencimiento, fecha de nacimiento, factor
sanguíneo, vencimiento de licencia de conducir con el mismo badge
🟢🟡🔴 que ya usa Vehículos, email alternativo, contacto de emergencia y
talla de indumentaria). `rol` y `torre` siguen siendo exclusivos de un
Administrador — un trigger en `profiles` bloquea que alguien se los cambie
a sí mismo aunque intente pegarle directo a la API
(`protect_profile_privileged_fields_trigger`, migración `20260902000008`).

### 4. Correr en desarrollo

```bash
npm install
npm run dev
```

## Notas de implementación

- **Navegación de Configuración**: solo tiene entrada desde la pantalla de
  inicio (`/`), como card junto a Informe Técnico/Rendición de
  Gastos/Estadísticas — no está en la barra de pestañas de esos dos primeros
  módulos (si el usuario no es Administrador, la card lleva igual pero
  `/configuracion` muestra `LockedPanel`).

- **PDF server-side**: `@react-pdf/renderer`, sin navegador — mismo layout
  en cualquier dispositivo (spec sección 11). Ver `src/lib/pdf/`.
- **RLS, no solo UI**: un Técnico no puede leer Configuración/Estadísticas
  ni por API aunque manipule el frontend — ver
  `supabase/migrations/20260902000000_init.sql`.
- **Fotos**: la marca de agua + franja de fecha/hora/GPS se "queman" en el
  JPG en el navegador (canvas) antes de subir; lat/lon/accuracy también se
  guardan estructurados en `informe_imagenes` para el futuro mapa de calor.
- **Modelo dato-vs-archivo del historial** (spec 6.5): el registro es
  permanente, el PDF/fotos son temporales. El job que libera el storage
  pasado el umbral configurado todavía no está implementado (vive en el
  módulo Configuración, pendiente); la UI del historial ya distingue
  "PDF disponible" de "Solo registro".
- **Sistema de íconos** (`src/components/icon.tsx`): reemplaza los emoji
  sueltos que había por toda la app por un set propio de íconos de línea
  SVG (`<Icon name="..."/>`, `<StatusDot tone="ok|warn|danger"/>`) — un
  solo trazo, `currentColor`, hereda el color de donde se use en vez de
  traer el suyo propio como hacía cada emoji. `<ModuleIcon>` es la variante
  grande tipo badge para tiles del inicio y paneles bloqueados. Quedan
  afuera a propósito: las flechas de texto (← →, monocromáticas, no son
  "dibujos") y los emoji dentro del prompt de IA en
  `src/app/api/estadisticas/insights/route.ts` (son contenido generado por
  la IA, no chrome de la UI).
