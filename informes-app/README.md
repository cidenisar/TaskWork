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
- Ubicaciones/GPS: si una Ubicación ya tiene coordenadas confirmadas y
  alguien confirma la misma Ubicación desde un punto lejano (posible GPS
  con mala señal, o dos sitios distintos mal identificados como el mismo),
  no se marca nada para revisar — simplemente no se pisa el punto guardado.
  Una vista en Configuración/Ubicaciones para detectar y resolver esos
  casos quedaría para una próxima vuelta.

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
- **Tableros** (`src/app/(app)/tableros/`, migraciones `20260927000000_tableros.sql`,
  `20260927010000_tableros_relevamiento_mantenimiento.sql` y
  `20260927020000_tableros_mixto_categoria_equipo.sql`): módulo propio en la
  pantalla de inicio para relevar tableros físicos en la ubicación del
  cliente. Un tablero es **mixto**: no tiene un único tipo, sino que declara
  qué subsistemas tiene presentes (`tableros.subsistemas`, array — Energía,
  CCTV, Control de Acceso, puede ser más de uno a la vez, ej. un tablero con
  térmicas de energía y una lectora de control de acceso en el mismo
  gabinete). Cada circuito/elemento tiene su propia **categoría de
  equipamiento** (térmica, disyuntor, bornera, bornera con fusible, fuente
  industrial, UPS industrial, batería, conversor DC, inyector PoE,
  descargador gaseoso, cámara, lectora, cerradura, otro) y su **tipo de
  circuito** (220V monofásico / 380V trifásico / 24V DC / 12V DC / no
  aplica) — con eso se arma un **resumen de equipamiento** (cuántos
  circuitos de cada tensión, cuánto de cada categoría) que se ve en pantalla
  mientras se carga y se imprime en el PDF. Un tablero y sus
  circuitos/elementos se dan de alta "al vuelo" la primera vez que un
  técnico los encuentra (mismo criterio que `catalogo_clientes`, no como
  `catalogo_vehiculos` que es 100% admin). Cada visita es de un tipo:
  **Medición** (solo si el tablero tiene Energía — mide corriente por fase
  F/R/S/T en cada térmica/disyuntor, reemplaza la planilla Excel manual,
  genera PDF) o **Relevamiento** (chequeo más liviano de estado por
  elemento, sin corriente, genera PDF igual — es el único tipo posible si no
  hay Energía). El gate de corriente es por elemento, no por tablero —
  `itemMideCorriente(categoriaEquipo, tipoCircuito, tipoEvento)` en
  `src/components/tableros/types.ts` es la única fuente de verdad, tanto en
  el formulario como en el PDF y en el server action (se anula server-side
  aunque alguien fuerce el form). La lectura de fotos con IA
  (`/api/tableros/leer-foto`, Claude Vision) acepta hasta
  `TABLERO_FOTO_IA_MAX` (7) fotos por lectura en un solo pedido — útil para
  distintos ángulos, secciones de un tablero grande, o un close-up de una
  etiqueta que en la foto general se ve borrosa —, y le pide al modelo que
  las combine en una sola lista sin duplicar un elemento que aparezca en
  más de una foto. Clasifica cada elemento detectado en su categoría/tipo
  de circuito además de leer la etiqueta — cuando no hay etiqueta legible
  describe el elemento por lo que ve físicamente (polos, grosor de cable,
  contactor/fotocélula al lado, tipo de cámara, etc.) en vez de inventar un
  nombre, y marca esos casos para que el técnico los revise. Aparte de esas
  fotos (que solo se usan para la lectura y no se guardan), el técnico puede
  cargar una **foto general del tablero** opcional por visita — se sube al
  bucket `informe-fotos` (`tablero_mediciones.foto_general_url`) y queda
  impresa en el PDF de esa medición/relevamiento, como registro visual del
  estado del tablero en ese momento. Aparte,
  **Mantenimiento** (`/tableros/mantenimiento`)
  registra el trabajo realizado sobre un tablero/circuito ya relevado —
  descripción, foto del trabajo/repuesto y próximo mantenimiento programado
  — sin PDF, solo queda como registro en el Historial.
- **Relevamiento de Equipamiento** (`src/app/(app)/racks/`, migración
  `20260930010000_racks_relevamiento_equipamiento.sql`): mismo patrón que
  Tableros pero para inventariar equipamiento de sala técnica en vez de
  circuitos eléctricos — un **Rack** (denominación + Ubicación, alta al
  vuelo) tiene una lista de equipamiento (router, switch, servidor,
  rectificador, banco de baterías, UPS, ODF, patch panel, radio/enlace,
  convertidor de medios, firewall, multiplexor, PDU/regleta, otro) con
  categoría, marca/modelo, posición en el rack (U) y cantidad (para ítems
  idénticos cargados en una sola fila). Más simple que Tableros: no hay
  subsistemas ni distinción medición/relevamiento, un solo tipo de visita.
  La lectura de fotos con IA (`/api/racks/leer-foto`, hasta
  `RACK_FOTO_IA_MAX` = 7 fotos combinadas) clasifica cada equipo detectado
  igual criterio que Tableros — describe por aspecto físico cuando no hay
  etiqueta legible, nunca adivina marca/modelo/posición sin base visual, y
  marca esos casos para revisar. El resumen (total + por categoría) se ve
  en pantalla mientras se carga y se imprime en el PDF, junto con una foto
  general opcional del rack.
- **Ubicaciones** (`src/app/(app)/ubicaciones/`, `src/components/ubicaciones/`,
  migraciones `20260930020000_ubicaciones.sql`,
  `20261003000000_ubicaciones_jerarquia_completa.sql`,
  `20261003000100_ubicaciones_seed_ypf_argentina.sql`): el "sitio" de texto
  libre que tenían Tableros y Racks por separado se reemplazó por una
  jerarquía compartida **País → Región → Provincia → Localidad → Sitio →
  Planta → Oficina** (`public.ubicaciones`), elegida o dada de alta al vuelo
  con el mismo criterio que el resto de los catálogos (`resolverUbicacionId`
  en cada `actions.ts`, con manejo del choque de unicidad — código `23505` —
  para reusar una Ubicación existente en vez de duplicarla). País y Región
  nunca los tipea el técnico: Región se deriva de la Provincia elegida vía
  `catalogo_provincias.region` (NOA/NEA/SUR, zonificación interna real de la
  operación — no la agrupación "de libro" por Cuyo/Centro/Pampeana que
  sugería la planilla fuente, a pedido del usuario se usó tal cual la
  columna "Región" de los datos). El formulario pide primero la Provincia
  para acotar el catálogo (se precargaron ~1747 sitios de la operación en
  Argentina desde una planilla de la empresa) y de ahí elegís una Ubicación
  existente o creás una nueva con Localidad/Sitio/Planta/Oficina. El botón
  **"Usar mi ubicación"** (`src/app/api/ubicaciones/resolver-gps/route.ts`,
  `src/lib/geo.ts`) toma el GPS del dispositivo y: (1) si el punto cae a
  menos de 300m de una Ubicación que algún técnico ya confirmó antes (tiene
  `lat`/`lng` guardado), la selecciona directo — la app "aprende" sitio por
  sitio con el uso real, sin tener que elegir de una lista cada vez más
  grande; (2) si no, geocodea el punto con Nominatim (OpenStreetMap, sin API
  key) para completar Provincia/Localidad solo, y Claude Haiku elige —
  mirando la lista de Localidades ya usadas en esa Provincia en el
  catálogo — cuál corresponde al municipio detectado, en vez de crear una
  variante nueva que lo fragmente; el técnico solo termina de elegir/
  escribir el Sitio. La primera vez que se confirma una Ubicación con GPS
  (sea por este flujo o eligiéndola/creándola a mano después de la
  detección), esas coordenadas quedan guardadas (`gps_accuracy_m`,
  `gps_confirmado_at`, `gps_confirmado_por`) y nunca se pisan después. El
  objetivo: dos relevamientos de tipos distintos en el mismo lugar físico
  (por ejemplo un tablero y un rack, los dos en la sala "Luján 1") quedan
  bajo el mismo `ubicacion_id` en vez de fragmentarse en variantes de texto
  distintas ("Luján 1", "sala lujan", "Lujan I"...). La pestaña
  **Ubicaciones** lista todas las Ubicaciones cargadas con la cantidad de
  tableros/racks en cada una, y el detalle de una Ubicación agrega **todo**
  el equipamiento relevado ahí — el resumen por categoría de Tableros
  (térmicas, disyuntores, cámaras...) y de Racks (routers, switches,
  UPS...) combinados, más la fecha del último relevamiento de cada
  tablero/rack — sin importar qué técnico cargó cada uno (el estado de
  `tableros`/`racks`/sus circuitos y equipamiento es visible para cualquier
  usuario autenticado por RLS, igual que el resto de esos catálogos; la
  fecha del último relevamiento respeta la misma RLS de
  Historial — visible si lo cargó el usuario actual o si es
  Admin/Supervisor). **Informe Técnico** y **Rendición de Gastos** usan el
  mismo picker (`UbicacionFields`, con `requerido={false}` porque ahí la
  Ubicación es opcional) y el mismo botón "Usar mi ubicación" —
  `src/lib/ubicaciones/resolver.ts` concentra `resolverUbicacionId`/
  `tagGpsSiFalta` para que los cuatro módulos (Tableros, Racks, Informe
  Técnico, Rendición de Gastos) resuelvan/den de alta/etiqueten GPS con la
  misma lógica en vez de reimplementarla cada uno. Para no tocar el PDF, el
  nombre de archivo ni los agregados de Estadísticas en este incremento,
  ambos módulos siguen escribiendo las columnas de texto libre
  `provincia`/`ubicacion` — ahora derivadas automáticamente de la Ubicación
  estructurada elegida — además de la nueva `ubicacion_id`; los ~16 informes
  y 6 rendiciones reales que ya existían (con texto libre inconsistente,
  ej. variantes de escritura del mismo sitio en Mendoza) no se migraron
  automáticamente a una Ubicación del catálogo nuevo, para no adivinar una
  correspondencia sin que alguien la confirme — al editar un informe viejo
  el picker arranca vacío y el texto histórico queda intacto si no se toca.
  Migrar `src/lib/estadisticas/aggregates.ts` (que todavía lee
  `informes_tecnicos.ubicacion` como texto libre) a `ubicacion_id` queda
  pendiente para un incremento futuro.
- **Relevamiento de Equipos** (`src/app/(app)/relevamiento/`,
  `src/components/app-shell.tsx`): Tableros, Racks y Equipos Individuales
  dejaron de ser módulos sueltos en el inicio — ahora son "tipos" dentro de
  un mismo hub, porque conceptualmente los tres son equipamiento relevado
  en un sitio. El hub (`/relevamiento`) deja elegir el tipo, y una vez
  adentro un selector (`grouptabs` en el shell) permite saltar de uno a
  otro sin volver atrás. Los tipos están en un solo array
  (`RELEVAMIENTO_GROUP` en `app-shell.tsx`). Tableros y Racks siguen con su
  propio modelo de datos y flujo porque son **contenedores** con varios
  componentes internos (circuitos/térmicas/disyuntores; lista de
  equipamiento de rack) — no se migraron a un modelo genérico único.
- **Equipos Individuales** (`src/app/(app)/equipos/`,
  `src/components/equipos/`, `src/app/api/equipos/leer-foto/`,
  migración `20261005000000_equipos_individuales.sql`): para equipamiento
  **suelto** que no vive dentro de un rack ni de un tablero (UPS
  standalone, cámaras, control de acceso, impresoras...) no se hizo un
  módulo dedicado por tipo de equipo — sería un tablero/rack nuevo por cada
  tipo que aparezca (UPS hoy, cámaras después, y así). En vez de eso hay
  **un solo flujo genérico**: se eligen la Ubicación y el GPS (mismo
  `UbicacionFields`/`resolverUbicacionId` que el resto de los módulos), se
  sacan hasta `EQUIPO_FOTO_IA_MAX` = 7 fotos de los equipos sueltos
  (chapa de serie, vista general) y Claude Vision identifica **qué es cada
  uno** — categoría (`ups`/`banco_baterias`/`camara_cctv`/`control_acceso`/
  `impresora`/`telefonia`/`climatizacion`/`otro`), marca/modelo y número de
  serie — en vez de que el técnico tenga que saberlo de antemano. Cada
  equipo queda como su propia fila en `public.equipos` (atada directo a la
  Ubicación, sin tabla contenedora intermedia como `racks`/`tableros`), así
  que sumar una categoría nueva de equipamiento suelto es ampliar el enum
  `equipo_categoria`, no crear una tabla/migración/formulario nuevos. Una
  visita (`equipo_relevamientos`) puede registrar varios equipos distintos
  a la vez (ej. un UPS y dos cámaras relevados juntos) y genera un solo PDF,
  igual criterio que Racks combinando varias fotos en un solo relevamiento.
  Al elegir una Ubicación existente se precargan los equipos ya conocidos
  ahí para reconfirmar estado/comentario, igual que Racks precarga el
  equipamiento de un rack ya elegido. La ficha de Ubicación y el listado de
  Ubicaciones ya muestran estos equipos junto con Tableros y Racks.
- **Errores del dispositivo** (`src/components/client-error-reporter.tsx` +
  `src/app/api/errores/reportar/`): cualquier error de JS no manejado en el
  navegador del usuario (y los fallos explícitos al generar/editar un
  informe o cerrar una rendición) se reportan a la tabla `client_errores` y
  se ven en Configuración → Errores del dispositivo (solo Administrador) —
  pensado para diagnosticar fallos en equipos que no probamos nosotros
  directamente, sin depender de que alguien nos cuente el error de memoria.
- **Modelo dato-vs-archivo del historial** (spec 6.5): el registro es
  permanente, el PDF/fotos son temporales. El job que libera el storage
  pasado el umbral configurado todavía no está implementado (vive en el
  módulo Configuración, pendiente); la UI del historial ya distingue
  "PDF disponible" de "Solo registro".
- **Links "ver PDF" con URL firmada fresca** (`src/components/ver-pdf-link.tsx`):
  los links a PDFs/fotos en Supabase Storage son privados — se acceden con
  una URL firmada que vence. El error típico cuando vence
  (`InvalidJWT` / `"exp" claim timestamp check failed`) pasaba al tocar
  "ver PDF" justo después de generarlo, porque esos links usaban la URL
  firmada que había devuelto la propia Server Action de creación/cierre en
  vez de pedir una nueva al tocarlos. `VerPdfLink` centraliza el arreglo: pide
  la URL firmada recién al hacer click (reusando las acciones
  `obtenerUrlPdf...Action` que ya tenía cada módulo para su Historial, que
  respetan RLS por id de registro), en vez de depender de cuánto tiempo pasó
  entre generarla y usarla. Aplicado en los 6 lugares que mostraban un link
  "ver PDF" apenas terminaba de guardar/cerrar (Informe Técnico nuevo y
  editar, Tableros, Racks, Rendición de Gastos, Equipos Individuales).
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
