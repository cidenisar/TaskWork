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
- `CRON_SECRET`: opcional, pero obligatoria para que corra la liberación
  automática de storage (ver sección más abajo) — sin ella, el endpoint de
  cron rechaza cualquier pedido en vez de correr sin protección. Se
  configura también como env var del proyecto en Vercel (no solo local),
  porque es la que Vercel Cron manda en el header `Authorization` al
  invocar el endpoint.

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
  Argentina desde una planilla de la empresa), y de ahí **Sitio → Planta →
  Oficina son 3 pasos separados**, cada uno con su propio "+ Crear
  nuevo..." — un Sitio grande (ej. una refinería) tiene varias Plantas
  (Comunicaciones, Puesto 1, Puesto 2...), y algunas de esas Plantas a su
  vez se dividen en Oficinas (Radio Luján 1, Sala de baterías...), pero la
  mayoría no — ahí el flujo termina en Planta sin pedir Oficina (un nivel
  se salta solo si tiene una sola opción posible, sin hacer elegir algo que
  no hace falta elegir). Antes era un solo select plano con todas las
  combinaciones Sitio+Planta+Oficina de la provincia juntas, que para una
  provincia con un complejo grande (ej. una refinería con ~80 plantas
  cargadas) se volvía un desplegable de cientos de opciones, imposible de
  recorrer bien en el celular. Crear un nivel nuevo dentro de un Sitio/
  Planta existente (ej. una Oficina nueva en una Planta que ya estaba
  cargada) solo pide el campo que falta — los niveles ya elegidos quedan
  fijos, no se vuelven a escribir. El botón
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
  **Ubicaciones** (`src/components/ubicaciones/lista.tsx`) navega en 3
  pasos — **Región → Provincia → Sitio**, igual jerarquía que la planilla
  original — en vez de listar las ~1747 Ubicaciones del catálogo de una:
  solo aparecen las que ya tienen algo relevado (al menos un tablero, rack
  o equipo), filtrado server-side antes de mandarlas al cliente; el
  catálogo completo sigue existiendo para elegir/crear al relevar, pero acá
  sería puro ruido. Un buscador arriba de todo es el atajo — tipear ahí
  busca en todo lo relevado de una, salteándose la navegación por niveles.
  Dentro de una provincia, un mismo Sitio con varias Plantas/Oficinas
  cargadas (ej. una refinería grande) se muestra como **una sola fila**
  agrupada (`agruparPorSitio` en `lista.tsx`), no una por cada combinación
  — el detalle desglosa planta por planta adentro. El detalle de un Sitio
  agrega **todo** el equipamiento relevado ahí, sumando las filas
  agrupadas (`/ubicaciones/[id]` levanta las Ubicaciones "hermanas" con el
  mismo `provincia`+`sitio` y junta todo lo que cuelga de cualquiera de
  ellas)
  — el resumen por categoría de Tableros (térmicas, disyuntores,
  cámaras...), Racks (routers, switches, UPS...) y Equipos Individuales
  (UPS, cámaras CCTV...) combinados, más la fecha del último relevamiento
  de cada tablero/rack — sin importar qué técnico cargó cada uno (el
  estado de `tableros`/`racks`/`equipos` y su equipamiento es visible para
  cualquier usuario autenticado por RLS, igual que el resto de esos
  catálogos; la fecha del último relevamiento respeta la misma RLS de
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
  permanente, el PDF/fotos son temporales. El job que libera el PDF del
  storage pasado el umbral configurado ya está implementado — ver
  "Liberación automática de PDFs viejos" más abajo; la UI del historial ya
  distinguía "PDF disponible" de "Solo registro" desde antes de que el job
  existiera.
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
- **Bug de RLS: faltaba la policy de UPDATE en 4 tablas**
  (`20261005010000_fix_relevamiento_update_rls.sql`): al probar el fix de
  arriba apareció un problema más de fondo — en Equipos Individuales el PDF
  directamente decía "ya no está disponible" apenas generado. Causa real:
  `tablero_mediciones`, `tablero_mantenimientos`, `rack_relevamientos` y
  `equipo_relevamientos` tenían policy de SELECT e INSERT pero **no de
  UPDATE** (a diferencia de `informes_tecnicos`/`rendiciones_gastos`, que sí
  la tienen) — el `.update({pdf_url, ...})`/`.update({foto_general_url, ...})`
  que corre después de subir el archivo a Storage se ejecutaba sin tirar
  error pero afectaba 0 filas (RLS deniega en silencio), así que el archivo
  quedaba subido a Storage pero el registro nunca se enteraba. Esto llevaba
  ahí desde que se armaron Tableros y Racks — el Historial de esos dos
  módulos venía mostrando "Sin PDF disponible"/sin foto en **absolutamente
  todos** los registros, sin que nada en la UI lo delatara como error. Se
  agregó la policy de UPDATE faltante en las 4 tablas y se recuperaron los
  archivos ya existentes con un backfill (se buscaron en `storage.objects`
  los PDFs/fotos ya subidos bajo el path de cada registro y se linkearon) —
  ninguno de los PDFs/fotos generados hasta ahora se perdió.
- **"Ubicaciones" pasó a llamarse "Sitios" en la UI** (ruta y modelo de
  datos siguen siendo `ubicaciones`/`Ubicación` — solo cambió el texto que
  ve el usuario), porque el plan es que termine mostrando todo lo cargado
  por lugar, no solo un catálogo de sitios. De paso se matchearon a mano
  (`20261005020000_backfill_informes_cilc_tvm.sql`) los ~16 Informes
  Técnicos y 6 Rendiciones de Gastos reales que se habían cargado antes de
  que existiera el picker de Ubicación, con texto libre inconsistente
  ("CILC", "PUESTO 1 CILC", "PUESTO 1 CILCO"...) — confirmado con el
  usuario antes de aplicar: el grupo "CILC" quedó linkeado a
  `REFINERIA LUJAN DE CUYO` (plantas PUESTO 1/PUESTO 2, que ya existían en
  el catálogo), y el grupo "TVM" dio de alta un sitio nuevo
  `TERMINAL VILLA MERCEDES` en San Luis (corrigiendo la provincia, que
  estaba cargada como "Mendoza" a mano). Unos pocos registros con texto
  demasiado vago ("Sala", "Laboratorio de infraestructura") o datos de
  prueba quedaron sin tocar.
- **Fusión de "Sala de Radio Lujan 1" / "Sala Energia 1°Piso" en Refinería
  Luján de Cuyo** (`20261005030000_fusionar_salas_comunicaciones_refineria.sql`):
  estaban cargadas como Sitios propios del catálogo (con oficina
  "COMUNICACIONES CILC"), separadas de `REFINERIA LUJAN DE CUYO` — pero
  confirmado con el usuario, son oficinas dentro de la refinería, planta
  `EDIF. COMUNICACIONES` (ya existente en el catálogo importado). Se dieron
  de alta como oficinas ahí y se re-apuntaron los 2 racks que ya estaban
  relevados en las Ubicaciones viejas. Esas 2 Ubicaciones viejas quedaron
  sin referencias pero **no se pudieron borrar** en la sesión (el DELETE
  quedó pendiente de confirmación en la herramienta de Supabase) — siguen
  existiendo en el catálogo sin usarse, pendiente de limpiar.
- **Bug: el catálogo de Ubicaciones se cortaba a la mitad en el picker**
  (`src/lib/ubicaciones/fetch-todas.ts`): después de cargar los ~1747 sitios
  más los agregados de esta sesión, `ubicaciones` pasó las 1758 filas —
  justo por encima del límite por defecto de PostgREST/Supabase (1000 filas
  por consulta). Todas las páginas que traían el catálogo completo
  (`Tableros`, `Racks`, `Equipos Individuales`, `Informe Técnico`,
  `Rendición de Gastos`, nuevo/editar/historial) lo hacían con un
  `.select(...)` sin `.range()`, así que el corte pasaba en silencio: no
  había error, simplemente la respuesta llegaba incompleta. Como esas
  consultas no iban ordenadas por provincia, el corte global por orden de
  `id` dejaba afuera, dentro de **cada** provincia, todo lo que quedaba del
  lado equivocado del corte — en Mendoza, por ejemplo, el selector de Sitio
  llegaba hasta "NODO CUYO TASA" y saltaba directo a "+ Crear sitio
  nuevo...", sin mostrar "REFINERIA LUJAN DE CUYO" ni nada alfabéticamente
  posterior, aunque la fila existiera en la base (confirmado por SQL
  directo). `fetchTodasLasUbicaciones` pagina con `.range()` en bloques de
  1000 hasta agotar la tabla, sin depender de ningún límite — reemplaza el
  `.from("ubicaciones").select(...)` suelto en los 11 lugares que leían el
  catálogo completo.
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
- **Detalle de Sitio con el mismo nivel que el PDF** (`/ubicaciones/[id]`):
  la ficha de un Sitio solo mostraba un resumen por categoría — para ver
  marca/modelo, número de serie o la corriente medida había que abrir el
  PDF del relevamiento. Ahora cada tablero/rack se puede desplegar
  (`<details>`, clase `.detalle-item` en `wireframe-ui.css`) y muestra la
  tabla completa de circuitos/equipamiento con la última lectura conocida
  (estado, corriente por fase, comentario), reusando la misma lógica de
  negocio que ya usa el PDF (`itemMideCorriente`, `categoriaLlevaAmp`) para
  decidir cuándo corresponde mostrar corriente — nada de esto es un dato
  nuevo, ya estaba guardado, solo no se mostraba. Equipos Individuales
  (que no tiene un "contenedor" como tablero/rack, es una lista plana) se
  muestra directo como tabla, sin `<details>` — la primera versión lo
  mostraba como texto concatenado en una sola línea, difícil de leer con
  varias columnas de datos.
- **Consumo estimado por IA en Racks y Equipos Individuales**
  (migraciones `20261005040000_consumo_estimado_ia.sql` y
  `20261005050000_consumo_promedio_max_y_etiqueta_ypf.sql`,
  `src/app/(app)/ubicaciones/actions.ts`): los Tableros de energía ya
  tienen consumo REAL medido con instrumento (corriente por fase en cada
  Medición) — pero el equipamiento de Racks y Equipos Individuales
  (routers, switches, UPS, rectificadores...) no se mide así. Para poder
  armar a futuro una estimación de consumo energético que cubra **todo**
  el equipamiento de un sitio, no solo lo que tiene térmica, se agregaron
  `consumo_promedio_w`/`consumo_max_w` (nullable) a `rack_equipamientos` y
  `equipos`: la misma IA que ya lee las fotos para identificar categoría/
  marca/modelo ahora también devuelve su mejor estimación del consumo en
  Watts de esa marca/modelo **por su conocimiento general del producto, no
  por la foto** — en uso normal (promedio) y pico (máximo) por separado,
  null en los dos si no reconoce el modelo con confianza, nunca inventa un
  número. **Primera versión real (un solo campo "consumo estimado") dio un
  resultado incorrecto al probarla**: para una notebook devolvió 65W, que
  resultó ser el vatiaje de la FUENTE/CARGADOR (lo máximo que puede
  entregar), no lo que la notebook consume en uso normal — confusión fácil
  para cualquier estimación de este tipo, no específica de este caso. El
  prompt ahora aclara explícitamente la diferencia y pide los dos números.
  El técnico puede corregir/completar ambos a mano igual que el resto de
  los campos. Para lo que ya estaba cargado antes de este campo (o donde
  la IA no pudo estimar en su momento), un botón "Estimar consumo de lo
  que falta" en la ficha de Sitio (visible solo para Administrador, porque
  el `UPDATE` de `rack_equipamientos`/`equipos` es admin-only por RLS — a
  propósito, para que un técnico no pueda editar equipamiento que cargó
  otro) manda todo lo pendiente de ese sitio en un solo pedido de texto a
  Claude (sin fotos) y completa lo que pueda. Siempre se muestra marcado
  como **estimado** (`~123W`), nunca mezclado visualmente con una medición
  real.
- **Etiqueta de inventario de YPF, separada del número de serie**: se
  venía leyendo mezclada dentro de "texto" (ej. "Notebook Lenovo con
  etiqueta de inventario YPF 582432") en vez de en su propio campo —
  mismo criterio que ya tenía `numero_serie`, que es del fabricante y es
  un campo distinto. Se agregó `etiqueta_ypf` a `rack_equipamientos` y
  `equipos`, y el prompt de lectura de fotos ahora la busca
  específicamente, aclarando que no es ni la marca/modelo ni el número de
  serie del fabricante.
- **Patrón responsive para pantallas con mucho dato** (`Estadísticas`,
  `Sitios` y los 5 `Historial`, pensado para reusarse en cualquier
  pantalla nueva que lo necesite): toda la app es mobile-first — `.app`
  limita el contenido a 800px, centrado, sea cual sea el ancho real de la
  pantalla — así que en una PC con monitor ancho sobraba espacio vacío a
  los costados en vez de aprovecharse para mostrar más datos a la vez. En
  vez de armar una app aparte tipo Via-Cash (que separa
  `apps/movil`/`apps/oficina` porque son **roles** distintos — chofer vs.
  oficina —, no el mismo usuario en otro dispositivo), alcanza con
  responsive, con 3 piezas genéricas en `wireframe-ui.css` (`.app-wide`,
  1080px, ya existía pero no se usaba en ningún lado; `.wide-grid`/
  `.wide-cell`/`.wide-span-2`, grid de 2 columnas a partir de 1024px;
  `.list-grid`, igual idea para listas de filas clickeables) que
  `AppShell` activa en `src/components/app-shell.tsx` — por módulo
  (`moduleKey`, ej. Estadísticas/Sitios) o por ruta exacta (cualquier
  `/historial`, sin importar el módulo — las pantallas de carga del mismo
  módulo, ej. `/tableros/nuevo`, son formularios angostos que no se
  benefician de más ancho, así que no entran solo por compartir módulo).
  Por debajo de 1024px (celular/tablet) se ve exactamente igual que antes
  en los tres casos, apilado en una columna — nada de esto toca el
  comportamiento mobile.
  - **Estadísticas** (primer caso, donde se armó el patrón): las tarjetas
    secundarias (Gastos por categoría, Informes por técnico, Insights,
    Mantenimiento predictivo, Comparación, Verificación de fotos) se
    emparejan de a 2; el Mapa de calor y "Preguntale a tus datos" ocupan
    las dos columnas porque se benefician del ancho completo (un mapa más
    grande, un chat).
  - **Sitios**: en la lista (`/ubicaciones`, `lista.tsx`) las filas
    clickeables del drill-down (Región/Provincia/Sitio) y los resultados
    de búsqueda pasan de una fila larga por ítem a 2 columnas
    (`.list-grid`). En la ficha de un Sitio (`/ubicaciones/[id]`),
    Tableros/Racks/Equipos Individuales **quedan a ancho completo** a
    propósito — sus tablas ya tienen 9-11 columnas y necesitan el espacio,
    emparejarlas las haría peor, no mejor — y solo Informes Técnicos y
    Rendiciones de Gastos (listas simples de título + fecha) se emparejan
    de a 2, mismo criterio que Estadísticas.
  - **Historial** (Informe Técnico, Rendición de Gastos, Tableros —
    mediciones y mantenimientos, dos listas separadas por tab—, Racks,
    Equipos Individuales): todos comparten el mismo patrón de filas
    `.hist-item` (título + meta + acciones), así que entran todos con el
    mismo cambio — el `<div>` que envuelve el `.map(...)` de cada lista
    pasa a `.list-grid`, sin tocar nada de la lógica de búsqueda,
    selección múltiple o descarga de cada uno.
- **Bajas de Equipamiento** (nuevo módulo, solo Administrador/Supervisor —
  `puedeGestionarBajas` en `src/lib/types.ts` —, migración
  `20261005060000_bajas_equipamiento.sql`, `src/components/bajas/`,
  `src/app/(app)/bajas/historial/`, acción `darDeBajaAction` en
  `src/app/(app)/ubicaciones/actions.ts`): un tablero/rack/equipo
  individual que se rompe, queda obsoleto o se reemplaza por una ampliación
  no desaparecía del relevamiento — había que borrarlo a mano o dejarlo
  "fantasma" en la lista activa. Ahora, en la ficha de un Sitio
  (`/ubicaciones/[id]`), cada fila de las 3 tablas de equipamiento tiene un
  botón "Dar de baja" (ícono `box`) que abre un modal chico (motivo —
  rotura/ampliación-reemplazo/obsolescencia/otro—, fecha, comentario
  opcional) — primer modal de la app, `.modal-overlay`/`.modal-card` en
  `wireframe-ui.css`, genérico a propósito porque las tablas de 9-11
  columnas no tienen lugar para un formulario inline. Al confirmar: el
  equipo pasa a `estado = 'baja'` (columna nueva en `tablero_circuitos`/
  `rack_equipamientos`/`equipos`, default `'activo'`) y desaparece de la
  lista de equipamiento activo (y de los selects de "Nueva Medición"/
  "Mantenimiento"/"Nuevo Relevamiento" de los 3 tipos) sin borrar ningún
  dato histórico (mediciones/relevamientos viejos del equipo siguen
  intactos); se genera **en el momento**, sin batching (se evaluó un
  "remito" que junte varias bajas y se descartó — un PDF por baja
  individual es lo que se pidió), un comprobante PDF de una sola página
  ("Comprobante de baja", `src/lib/pdf/baja.tsx`) con la foto de los datos
  del equipo al momento de la baja (no un join en vivo — mismo criterio
  que el resto de los PDFs de la app) y un número de generación propio
  (`BAJA-{año}-{4 dígitos}`), pensado para entregar junto con el equipo
  físico en depósito. La escritura (`estado` + el insert en
  `bajas_equipamiento`) usa `createServiceRoleClient()` porque el `UPDATE`
  de `rack_equipamientos`/`equipos` es admin-only por RLS pero Supervisor
  también tiene que poder dar de baja — el control de rol se hace en
  código, antes de cualquier escritura, no relajando la policy. El
  **Historial de Bajas** (`/bajas/historial`, tile propio en el inicio)
  lista todas las bajas de todos los sitios con buscador y descarga del
  comprobante (misma "URL firmada fresca al tocar" que el resto de la
  app); la ficha de Sitio además tiene su propia sección "Equipamiento
  dado de baja en este sitio", acotada a ese sitio.
- **Liberación automática de PDFs viejos del storage** (migración
  `20261005070000_liberacion_automatica_storage.sql`,
  `src/lib/storage/liberacion-automatica.ts`,
  `src/app/api/cron/liberar-storage/route.ts`, `vercel.json`): implementa
  el job que el modelo dato-vs-archivo del historial (spec 6.5) venía
  dejando pendiente — primer job programado de la app, no existía ninguna
  infraestructura de cron antes de este incremento. **Apagado por
  default**, a propósito: la spec (9.5) dice explícitamente "nunca se
  borra nada automáticamente — el sistema solo avisa", así que activarlo
  es una decisión explícita de un Administrador (switch nuevo "Liberar
  archivos automáticamente" en Configuración → Historial y
  almacenamiento), no un cambio de comportamiento que le llegue a nadie
  sin pedirlo. Al activarlo, reusa el mismo número de semanas que ya
  elige el selector de aviso (20/50/100 informes → 4/8/12 semanas) — una
  sola decisión de umbral para avisar y, opcionalmente, también liberar,
  en vez de un segundo número que explicar. Corre una vez por día vía
  Vercel Cron (`/api/cron/liberar-storage`, protegido con `CRON_SECRET`
  — sin esa env var, el endpoint rechaza cualquier pedido en vez de
  correr sin protección) y por cada PDF más viejo que el umbral (en los
  6 módulos: Informe Técnico, Rendición de Gastos —solo cerradas—,
  Tableros, Racks, Equipos Individuales y Bajas) **primero lo copia** al
  bucket `informes-pdf-archivo` (mismo path, mismo proyecto de Supabase)
  y **recién si esa copia confirma éxito** borra el original de
  `informes-pdf` y vacía `pdf_url` en la fila — si la copia falla, el
  original queda intacto, nunca se borra "a ciegas". El registro en sí
  nunca se toca más que para vaciar esa columna: el dato queda para
  siempre, como ya exige el modelo dato-vs-archivo. **Ojo**: mover el
  archivo a otro bucket del mismo proyecto de Supabase no reduce el costo
  de storage (Supabase cobra por bytes totales del proyecto, no hay un
  nivel "frío" más barato dentro del mismo proyecto) — lo que gana esto es
  un backup seguro y una separación clara entre "storage activo" y
  "archivo", no un ahorro de plata; si en algún momento el volumen crece y
  el costo importa, un backup afuera de Supabase (S3/Backblaze) sería el
  siguiente paso, evaluado y descartado por ahora por sumar una cuenta/
  credencial nueva para el volumen actual. **Alcance de este incremento:
  solo PDFs, no fotos** — a diferencia del PDF (inmutable una vez
  generado), varias fotos siguen referenciadas desde flujos de edición
  (Informe Técnico permite reabrir y regenerar el PDF sin tocar las fotos
  ya cargadas) que necesitan su propio diseño antes de tocarlas sin
  romper nada; queda para un próximo incremento.
- **Borrado real por Administrador** (`src/lib/admin/eliminar-registro.ts`,
  `src/lib/admin/vaciar-datos-prueba.ts`, acciones nuevas en los 5
  `historial/actions.ts` de Informe Técnico/Rendición/Tableros/Racks/
  Equipos y en `configuracion/actions/mantenimiento.ts`): hasta este
  incremento, **nada** en la app se borraba de verdad — el modelo
  dato-vs-archivo (spec 6.5) dice "el registro es permanente" a
  propósito, y así sigue siendo para el uso normal. Pero mientras la app
  todavía está en etapa de pruebas (no en producción real todavía), hacía
  falta poder sacar lo que se cargó de prueba — así que se agregó, **solo
  para Administrador**, borrado real en dos formas:
  - **Fila por fila**: un ícono de tacho en cada uno de los 5 Historiales
    (Informe Técnico, Rendición, Tableros —mediciones y mantenimientos
    por separado—, Racks, Equipos) borra ese registro puntual (con
    confirmación) — las filas hijas caen solas por `cascade` de FK (ya
    estaban así en el schema) y el PDF/fotos asociados se borran del
    storage antes de que la fila desaparezca (si no, se pierde el path
    para encontrarlos). Queda disponible para siempre, no solo durante
    las pruebas — un Administrador puede necesitar borrar un informe
    cargado por error también en producción real.
  - **"Vaciar datos de prueba"** (Configuración, al final, con borde rojo
    a propósito): un solo botón que borra TODO lo cargado hasta ahora en
    los 5 módulos + Bajas de Equipamiento — el equipo cargado en cada
    sitio incluido, no solo su historial de mediciones/relevamientos — y
    vacía los buckets de PDFs/fotos. Pensado como un "reset" para usar
    las veces que haga falta mientras se sigue probando, no para uso
    diario. El gate es más fuerte que el `window.confirm` de siempre:
    hay que escribir la frase exacta "BORRAR TODO" en un campo de texto
    para que el botón se habilite — a propósito, para una acción que no
    tiene vuelta atrás. Nunca toca Ubicaciones (es el catálogo real de
    ~1747 sitios YPF, no un dato de prueba), catálogos, usuarios ni el
    resto de Configuración.

  Ninguna de estas tablas tenía policy de **DELETE** (a propósito —
  nadie más que un Administrador puede borrar) así que ambas formas usan
  `createServiceRoleClient()` para el borrado en sí, con `requireAdmin()`
  validado en código ANTES de leer nada — mismo criterio que "Bajas de
  Equipamiento" (service-role para una acción puntual en vez de aflojar
  la policy para todo el rol). El orden de los `DELETE` en "Vaciar datos
  de prueba" importa por las FK entre tablas (algunas son `RESTRICT`
  hacia su tabla "padre", no `CASCADE`) — documentado en el propio
  archivo.
- **Bug: "ver PDF" en los Historiales en realidad descargaba el archivo**
  (Informe Técnico, Rendición, Tableros, Racks, Equipos, Bajas): el botón
  armaba un blob a partir de la URL firmada y lo "clickeaba" con un
  `<a download>` — eso fuerza la descarga siempre, sin importar qué
  diga el servidor, así que no había forma de solo mirar el PDF sin que
  se fuera a la carpeta de Descargas. Ahora abre la URL firmada
  directo en una pestaña nueva (`window.open`, mismo criterio que ya
  usaban los botones de "ver foto"), y el visor de PDF nativo del
  navegador lo muestra ahí — si alguien quiere además guardarlo, el
  propio visor tiene su botón de descarga. La selección múltiple +
  `.zip` de Informe Técnico no se tocó: esa sí necesita el blob real.
- **Entregas a Depósito** (nuevo módulo, solo Administrador/Supervisor —
  `puedeGestionarDeposito` en `src/lib/types.ts`, hermano de "Bajas de
  Equipamiento" —, migración `20261005080000_entregas_deposito.sql`,
  `src/components/deposito/`, `src/app/(app)/entregas-deposito/`): una
  Baja es equipo roto/obsoleto que se retira para siempre — pero hacía
  falta algo distinto para equipo o material que **vuelve** al depósito
  (nuevo sin usar, o usado pero todavía funciona) y necesita una
  constancia. Dos orígenes posibles para una misma entrega:
  - **Equipo ya cargado en un sitio** (tablero-circuito, rack-equipamiento
    o equipo individual): mismo botón-modal que "Dar de baja"
    (`EntregarADepositoButton`, ícono `truck` al lado del ícono `box` de
    Bajas, en cada fila de las 3 tablas de la ficha de Sitio) — al
    confirmar, el equipo pasa a `estado = 'en_deposito'` (un tercer valor
    agregado al mismo `estado` que ya usan Bajas, junto a `'activo'`/
    `'baja'`) y desaparece de las listas activas igual que una Baja,
    pero con su propio motivo (sobrante de obra / reemplazo funcional —
    todavía sirve, no está roto / retorno post-mantenimiento / otro) y
    condición (nuevo / usado-funcional) en vez de rotura/obsolescencia.
    El resolvedor de los 3 tipos de equipo (`resolverEquipo`,
    `TABLA_POR_TIPO`) se extrajo a `src/lib/equipamiento/resolver-equipo.ts`
    para compartirlo entre `darDeBajaAction` y la acción nueva
    `entregarEquipoADepositoAction` en vez de duplicarlo.
  - **Material que nunca se registró como equipamiento de un sitio**
    (cables sueltos, repuestos, equipo nuevo sin instalar): no hay fila
    de tablero/rack/equipo que tocar, así que tiene su propia pantalla
    — `/entregas-deposito/nueva` ("Nueva Entrega", tab propio del
    módulo) — con el mismo picker de Ubicación (Provincia→Sitio→Planta→
    Oficina, con alta al vuelo y GPS) que ya usan Informe Técnico y
    Rendición de Gastos, más los campos del material (descripción,
    categoría, marca/modelo, cantidad, condición, motivo). Como no toca
    ninguna tabla de equipamiento admin-only, esta acción no necesita
    Service Role — corre con la sesión normal del usuario, apoyada en
    la policy de INSERT/UPDATE de `entregas_deposito` (que sí exige
    Admin/Supervisor).

  Los dos orígenes comparten la misma tabla (`entregas_deposito`, con
  `origen` como discriminante), el mismo PDF ("Constancia de entrega a
  depósito", un documento por entrega, igual criterio que Bajas) y el
  mismo Historial (`/entregas-deposito/historial`) — y, al tener ambos
  un `ubicacion_id`, también aparecen juntos en la nueva sección
  "Entregado a depósito desde este sitio" de la ficha de cada Sitio, sin
  necesitar lógica separada para distinguirlos ahí.
- **"Nueva Entrega a Depósito" pasó a aceptar varios materiales por carga,
  con lectura con IA igual que Equipos Individuales**
  (`src/app/api/entregas-deposito/leer-foto/route.ts`,
  `ENTREGA_FOTO_IA_MAX` en `src/components/deposito/types.ts`, migración
  `20261005090000_entregas_deposito_lote.sql`): la primera versión de este
  formulario era de un solo material por entrega — quedó corto en cuanto
  se probó con una devolución real de varios materiales distintos de la
  misma visita (5 fotos no alcanzan si cada una es algo diferente, no solo
  ángulos de lo mismo). Ahora es el mismo patrón que Equipos Individuales:
  sacás hasta `ENTREGA_FOTO_IA_MAX` (10) fotos de todo junto, la IA separa
  cada material físico distinto en una lista (reusando las categorías de
  Equipos Individuales — es el mismo universo de cosas, solo que acá puede
  no estar registrado como equipamiento de ningún sitio) completando
  descripción, categoría, marca/modelo, N° de serie y etiqueta YPF — nunca
  la cantidad, eso se carga a mano para cada material, igual que cualquier
  dato que la IA no pueda leer con certeza (tampoco estima consumo: un
  material en depósito no está instalado). Se pueden agregar más
  materiales a mano con "+ Agregar material manual", y la carga genera
  **un solo comprobante** con todos los materiales en una tabla (como el
  PDF de Equipos Individuales), no uno por material. Cada material sigue
  siendo su propia fila en `entregas_deposito` (para que el resto de la
  app — Historial, ficha de Sitio — no necesite tratamiento especial),
  pero ahora comparten el mismo `numero_generacion` y el mismo `pdf_url`:
  la migración relaja el `UNIQUE` de `numero_generacion` a un índice
  normal, y la unicidad real se chequea en la aplicación (`SELECT` antes
  de insertar, con reintento) en vez de depender de la constraint — mismo
  criterio que ya usa el resolver de Ubicaciones ante una colisión. El
  flujo de "equipo ya cargado en un sitio" (botón en la ficha de Sitio,
  una fila = una entrega con su propio número) no se tocó.
- **"Nueva Entrega a Depósito" ahora acepta 1-2 fotos de evidencia (vista
  general), guardadas y visibles — distintas de las fotos de IA, que se
  descartan** (migración `20261005100000_entregas_deposito_fotos_evidencia.sql`,
  `ENTREGA_FOTOS_EVIDENCIA_MAX` en `src/components/deposito/types.ts`): las
  fotos que se sacan para identificar materiales con IA se procesan y se
  tiran — nunca quedó una vista de lo que realmente se entregó. Esta es una
  sección separada en el formulario, igual criterio que la "Foto general"
  de Tableros/Racks/Equipos Individuales pero con un tope de 2 en vez de 1:
  se suben al bucket `informe-fotos`, se imprimen en el PDF del comprobante
  (sección "Fotos de evidencia") y quedan en la columna nueva
  `fotos_evidencia_urls` (un array de paths), compartida entre todas las
  filas de un mismo lote — mismo criterio que `pdf_url`/`numero_generacion`.
  El Historial tiene un botón "Ver fotos de evidencia" aparte de "Ver
  comprobante" (abre cada foto en una pestaña nueva, URL firmada al
  momento del click — mismo patrón que el resto de la app). El flujo de
  "equipo ya cargado en un sitio" no pide estas fotos (sigue siendo un
  modal rápido con motivo/condición).
- **"Equipos Individuales → Nueva" ahora puede instalar equipo que estaba
  en depósito, cerrando el círculo con Entregas a Depósito — sin crear un
  módulo nuevo** (`buscarEquiposEnDepositoAction`/`EquipoItem.desdeDeposito`
  en `src/app/(app)/equipos/nuevo/actions.ts` y
  `src/components/equipos/nuevo-relevamiento-form.tsx`): pedido del
  usuario — "lo mismo que Entregas a Depósito, pero para instalar, igual
  que ya veníamos haciendo con fotos + IA + lista con número de serie".
  En vez de armar un módulo "Informe de Instalación" en paralelo (con su
  propia tabla, historial y PDF), se extendió el flujo que YA tenía
  exactamente ese patrón — "Equipos Individuales → Nueva" ya sacaba fotos,
  identificaba con IA y armaba una lista con número de serie para dar de
  alta equipo en un sitio; lo único que le faltaba era poder traer un
  equipo que no es nuevo, sino que está `estado='en_deposito'` en
  cualquier otro sitio. Ahora, para Administrador/Supervisor
  (`puedeGestionarDeposito`, mismo gate que el resto de depósito), hay una
  sección "Traer equipo desde depósito" con buscador (por nombre, marca,
  serie o etiqueta YPF, sin importar el sitio de origen) — al agregar un
  resultado y guardar el relevamiento, ese equipo se reactiva
  (`estado='activo'`) y se reubica (`ubicacion_id`) en el sitio de esta
  instalación, con un `UPDATE` condicionado a `estado='en_deposito'` (si
  otro técnico ya lo instaló mientras tanto, falla con un mensaje claro en
  vez de pisarlo en silencio) vía service-role (mismo motivo que Bajas:
  `equipos` UPDATE es admin-only por RLS, Supervisor necesita bypassearlo
  puntualmente). Material que se instala directo, sin haber pasado nunca
  por depósito, sigue siendo simplemente "Agregar equipo manual" o una
  lectura con IA normal — ya daba de alta un equipo nuevo en el sitio,
  que es exactamente lo que hace falta. **Alcance de esta vuelta:** solo
  cubre `equipos` (equipamiento suelto) — un `tablero_circuito` o
  `rack_equipamiento` que esté en depósito todavía no se puede reinstalar
  desde ninguna pantalla, porque requeriría elegir un tablero/rack destino
  ya existente en el sitio nuevo (estructura de contenedor que Tableros/
  Racks no tienen pensada para este flujo) — queda afuera a propósito en
  vez de forzar un diseño a medias.
- **Nueva sección "Ayuda" (`/ayuda`) para que un técnico nuevo aprenda la
  app sin que nadie se lo explique en persona** (`src/components/ayuda/view.tsx`,
  link permanente en la `sessionbar` de `src/components/app-shell.tsx`, al
  lado de "Mi cuenta"): contenido estático en español, un `<details>` nativo
  por sección (sin JS/estado — se abre y cierra solo con el navegador), con
  dos grupos: "Patrones que vas a ver en varios módulos" (elegir/crear Sitio
  + GPS, fotos con IA, "Ver PDF" y el N° de generación — explicados una sola
  vez en vez de repetirlos módulo por módulo) y "Módulos de la app" (uno por
  cada ítem del menú, con los pasos para usarlo y una badge de qué rol lo
  puede ver). Las secciones de Admin/Supervisor se muestran igual a un
  Técnico (con su badge de acceso) para que entienda qué hace el resto del
  equipo, no se ocultan.
- **El módulo standalone "Instalación" (recién agregado) se reemplazó por
  una sección "Materiales/equipos" DENTRO de Informe Técnico — el usuario
  probó el flujo y notó que cargar una Instalación Y, aparte, un Informe
  Técnico para la misma visita era redundante, y que "materiales usados"
  no es exclusivo de una instalación (una reparación con repuestos
  también aplica).** Informe Técnico (`src/components/informe-tecnico/`)
  gana un botón opcional "+ Agregar materiales/equipos" en el paso
  "Técnicos y Recursos" (`step-2-equipo.tsx`, visible solo si ya se eligió
  una Ubicación en el paso 1) que despliega `materiales-section.tsx`: dos
  listas independientes con fotos + IA — "Materiales/equipos usados"
  (reusa `/api/equipos/leer-foto`, el mismo universo que Equipos
  Individuales — categoría, marca/modelo, N° de serie, y hasta estimación
  de consumo cuando reconoce el modelo) y "Remito" (una foto del papel del
  depósito, leída por `/api/informe-tecnico/leer-remito` — una IA que
  transcribe una TABLA, no identifica objetos físicos; devuelve N° de
  remito si es legible y cada línea con descripción + cantidad). El
  técnico ajusta la "cantidad sobrante" de cada línea del remito que no
  terminó usada (arranca en 0).
  Al guardar el informe: cada material se da de alta como una fila REAL en
  `equipos` (`estado='activo'`, en la Ubicación del informe — no solo un
  registro de constancia) y queda vinculado vía la tabla nueva
  `informe_materiales` (child de `informes_tecnicos`, mismo patrón que
  `informe_imagenes`/`informe_tecnicos_asignados`); si hay sobrantes, se
  genera sola una Entrega a Depósito (`motivo='sobrante_obra'`,
  `condicion='nuevo'`, comentario con el N° del informe y del remito) —
  nunca hay que ir a cargarla aparte. La lógica de "generar un lote de
  Entregas a Depósito" sigue viviendo en `crearEntregaDepositoLote`
  (`src/lib/deposito/crear-lote.ts`, extraída en la vuelta anterior),
  reusada acá tal cual.
  **Decisión de rol:** Informe Técnico (y por lo tanto esta sección) sigue
  abierto a cualquier rol — es el trabajo de campo normal de un técnico,
  no una decisión operativa como Bajas/Entregas a Depósito manuales. Como
  `entregas_deposito` sí sigue siendo admin/supervisor-only por RLS, el
  paso de la devolución automática usa `createServiceRoleClient()` para
  ese técnico puntual — la policy de la tabla no se afloja, la excepción
  vive en código, auditada, solo para este flujo (mismo criterio que
  Bajas y "traer equipo desde depósito" en Equipos Individuales).
  La pantalla de "Editar" un informe no permite tocar los materiales ya
  cargados (mismo criterio que las fotos: "si hay que cambiarlos, hay que
  rehacer el informe") — sí los vuelve a traer para no perderlos al
  regenerar el PDF, salvo la tabla de líneas del remito en sí (esperado/
  sobrante), que es transitoria y no se persiste — solo persisten el
  material ya dado de alta, la foto/N° del remito y la referencia a la
  devolución generada.
  La tabla `instalaciones` (del módulo standalone recién reemplazado) y
  una tabla `_ping_test` de diagnóstico quedaron huérfanas en la base — el
  `DROP TABLE` específico se colgó repetidas veces vía las herramientas de
  Supabase en esta sesión (diagnosticado: sin locks reales, parece la
  herramienta) — pendiente de borrarlas a mano o cuando la herramienta
  ande: `drop table public.instalaciones; drop table public._ping_test;`.
  **La foto del remito pasó de ser una sola a admitir hasta
  `REMITO_FOTO_MAX` (3, `materiales-types.ts`)** — el remito puede traer
  varias páginas, o convenir reintentar una que salió borrosa, mismo
  criterio que las "fotos de evidencia" de Entregas a Depósito. Columna
  `informes_tecnicos.remito_fotos_urls text[]` (reemplaza a
  `remito_foto_url`, que quedó huérfana en la base por el mismo problema de
  `DROP COLUMN` colgándose — pendiente: `alter table
  public.informes_tecnicos drop column remito_foto_url;`). Todas las fotos
  se mandan juntas en una sola lectura a `/api/informe-tecnico/leer-remito`
  (campo `fotos`, plural) — el prompt le aclara a la IA que puede ser el
  mismo remito repetido en varias páginas/intentos, para que combine todo
  en una lista sin duplicar líneas. El PDF las renderiza en grilla
  (`commonStyles.photoGrid`/`photoCell`), igual que las fotos de evidencia.
