# Prompt para Claude Code — App "Informe Técnico + Rendición de Gastos"

> **Cómo usar este documento:** pegá todo este archivo como prompt inicial en Claude Code (o guardalo como `CLAUDE.md` / `PROJECT_SPEC.md` en la raíz del repo para que Claude Code lo lea automáticamente). Contiene la especificación completa validada con el cliente a partir de un prototipo interactivo (wireframe funcional) y dos plantillas de PDF ya diseñadas y aprobadas. Todo lo descripto acá fue iterado y confirmado — no son ideas sueltas, es la spec final.
>
> **Archivos adjuntos que hay que subir junto con este prompt** (ver sección 15):
> 1. `informe-tecnico-wireframe.html` — prototipo interactivo navegable, es la referencia de UX/flujo/textos más confiable que existe. Ante cualquier duda de comportamiento, abrir este archivo y probarlo primero.
> 2. `Informe Tecnico - Diseño PDF.pdf` + `Informe Tecnico - Plantilla editable.docx`
> 3. `Rendicion de Gastos - Diseño PDF.pdf` + `Rendicion de Gastos - Plantilla editable.docx`
> 4. El Word original del cliente (remito de referencia) si está disponible.

---

## 1. Resumen ejecutivo

Aplicación web multiplataforma (responsive, uso desde celular en campo y desde PC en oficina) para que técnicos de campo carguen dos tipos de documentos:

1. **Informes Técnicos**: reporte de trabajo realizado, con fotos georreferenciadas, firmas, y generación de PDF.
2. **Rendición de Gastos**: viáticos recibidos vs. gastos con comprobante, con cálculo de saldo y exportación a PDF/Excel.

Incluye un tercer módulo de **Estadísticas** (solo para roles Administrador y Supervisor) con KPIs, insights generados por IA, y una capa de gestión de flota de vehículos (documentación, service, alertas de vencimiento).

El diseño visual es **tema oscuro** con acento naranja/rojo (gradiente `#ff7a3d → #ff4747`), tipografía Inter, estética tipo "herramienta de campo profesional" — ya validado en el wireframe adjunto. **No reinventar el diseño visual: replicar fielmente los colores, espaciados y componentes del wireframe HTML adjunto.**

---

## 2. Stack tecnológico recomendado

Priorizar herramientas con capa gratuita generosa, ya que el volumen de uso esperado es de un equipo chico/mediano:

- **Frontend**: Next.js (React) + Tailwind CSS, responsive, con soporte PWA (para poder "instalarse" en el celular y acceder a cámara/GPS con buena UX). Si el cliente ya tiene infraestructura Expo/React Native para otras apps, evaluar con el cliente si prefiere una app nativa en lugar de PWA — **preguntar antes de asumir**.
- **Backend / Auth / DB / Storage**: Supabase (Postgres + Auth con roles vía tabla `profiles` + Row Level Security + Storage para fotos/PDFs/comprobantes).
- **Hosting frontend**: Vercel o Netlify (capa gratuita).
- **Email transaccional**: Resend (o similar) para el envío automático de PDFs — capa gratuita de varios miles de emails/mes.
- **Generación de PDF**: server-side (Vercel Functions o Supabase Edge Functions), no client-side — para que el PDF final tenga siempre el mismo layout controlado sin depender del navegador del usuario. Librería recomendada: `@react-pdf/renderer` o generar HTML y convertir con Puppeteer/Playwright en la función serverless. **El layout debe replicar exactamente las plantillas .docx/.pdf adjuntas** (ver sección 11).
- **Generación de Excel**: `exceljs` o `xlsx` (SheetJS) en el backend.

Si el desarrollador tiene una preferencia de stack distinta ya validada con el cliente, priorizar esa — lo no negociable es: autenticación con roles, base de datos relacional, storage de archivos, generación de PDF server-side fiel al diseño, y que funcione bien en mobile (cámara + GPS).

---

## 3. Modelo de datos

Tablas mínimas (nombres sugeridos, adaptar a convención del proyecto):

```
profiles
  id (uuid, FK a auth.users)
  email
  nombre_completo
  rol            enum('tecnico','supervisor','admin')
  created_at

catalogo_tecnicos
  id, nombre_completo, torre (FK opcional a catalogo_torres), created_by, created_at

catalogo_torres
  id, nombre

catalogo_provincias
  id, nombre   -- precargar con las 24 provincias argentinas (ver sección 6.1)

catalogo_tipos_informe
  id, nombre

catalogo_categorias_gasto
  id, nombre   -- precargar: Combustible, Peaje, Comida, Alojamiento, Otros

catalogo_vehiculos
  id, patente, marca_modelo, kilometraje_actual,
  vencimiento_tarjeta_verde (date), foto_tarjeta_verde_url,
  vencimiento_rto (date), foto_rto_url,
  created_at, updated_at

vehiculo_services
  id, vehiculo_id (FK), fecha, kilometraje, foto_url, descripcion, created_by

informes_tecnicos
  id, numero_generacion (formato: INF-{año}-{4 dígitos random o secuencial}),
  titulo, fecha, cliente, proyecto, ticket_numero, permiso_trabajo,
  tipo_informe, provincia, ubicacion, descripcion_trabajo, tareas_pendientes (text),
  logo_empresa_url (referencia a config, no se sube por informe — ver 4.3),
  created_by, created_at, estado (borrador/generado)

informe_tecnicos_asignados
  id, informe_id (FK), tecnico_nombre, torre, es_tecnico_seguridad (bool)

informe_vehiculos
  id, informe_id (FK), patente, marca_modelo

informe_imagenes
  id, informe_id (FK), url, lat (nullable), lon (nullable), accuracy_m (nullable),
  tomada_en (timestamp), orden

rendiciones_gastos
  id, numero_generacion (formato: REND-{año}-{4 dígitos}),
  motivo, fecha, proyecto_cliente, provincia, viatico_recibido, moneda ('ARS'|'USD'),
  created_by, created_at, estado (abierta/cerrada)

gastos
  id, rendicion_id (FK), fecha, categoria, monto, descripcion, comprobante_url

gasto_tecnicos
  id, gasto_id (FK), tecnico_nombre, torre   -- un gasto puede tener 1 o varios técnicos

config_emails_envio
  id, email, activo

config_general
  id (singleton), logo_empresa_url, auto_enviar_email (bool),
  umbral_aviso_historial ('20'|'50'|'100'), recordatorio_semanal_archivo (bool),
  resumen_semanal_ia (bool)

audit_log
  id, actor_id (FK profiles), actor_nombre, actor_rol, accion (text), created_at
```

Notas importantes sobre el modelo:
- **`informe_imagenes.lat/lon`**: se guardan aunque la foto ya tenga la marca de agua "quemada" en el JPG — la coordenada estructurada es necesaria para el futuro mapa de calor y para el link "Ver en mapa" (Google Maps `?q=lat,lon`).
- **`gasto_tecnicos`**: el técnico se asocia **al gasto individual**, no a la rendición completa — un mismo viaje puede tener gastos de distintos técnicos.
- **`audit_log`**: ver sección 9.6, se escribe una fila por cada alta/baja en cualquier catálogo o configuración.

---

## 4. Roles y permisos

Tres roles: **Técnico**, **Supervisor**, **Administrador**.

| Sección | Técnico | Supervisor | Administrador |
|---|---|---|---|
| Módulo Informe Técnico (crear/ver propios) | ✅ | ✅ | ✅ |
| Módulo Rendición de Gastos (crear/ver propios) | ✅ | ✅ | ✅ |
| Módulo Estadísticas | 🔒 bloqueado | ✅ ver (solo lectura) | ✅ ver |
| Configuración (catálogos, emails, logo, retención, vehículos) | 🔒 bloqueado | 🔒 bloqueado | ✅ ver y **modificar** |

Reglas de UI para los casos bloqueados (ya validado en el wireframe, replicar tal cual):
- La tarjeta/pestaña bloqueada se sigue mostrando (no se oculta), pero con un ícono 🔒 al lado del nombre.
- Al intentar entrar, se muestra una pantalla con ícono de candado y texto explicando quién sí tiene acceso — **nunca un error técnico ni un 403 crudo**.
- El login (en el prototipo es mock) debe evolucionar a autenticación real con Supabase Auth; el selector de rol en el login del wireframe era **solo para demo** — en producción el rol lo asigna un Administrador desde Configuración, el usuario no lo elige.

---

## 5. Navegación general

- Al loguearse, el usuario llega a una **pantalla de selección de módulo** (Home) con 3 tarjetas: Informe Técnico, Rendición de Gastos, Estadísticas (esta última con candado si el rol no corresponde).
- Dentro de cada módulo hay una barra de navegación secundaria específica:
  - Informe Técnico: `Nuevo Informe | Historial | Configuración`
  - Rendición de Gastos: `Nueva Rendición | Historial | Configuración`
  - Estadísticas: `Resumen | Configuración`
- Un botón "← Volver al inicio" siempre visible en la barra superior regresa a la pantalla de selección de módulo.
- Barra de sesión visible con nombre del usuario logueado, badge de rol (TÉCNICO / SUPERVISOR / ADMINISTRADOR), y botón de cerrar sesión.

---

## 6. Módulo: Informe Técnico

Wizard de **4 pasos** con indicador de progreso (círculos numerados conectados, el paso activo resaltado en naranja, los completados con check).

### 6.1 Paso 1 — Información General

Campos (nombre exacto, tipo, obligatoriedad):

| Campo | Tipo | Obligatorio |
|---|---|---|
| Título del Informe | texto | ✅ |
| Fecha | date | ✅ |
| Cliente | texto | ✅ |
| Proyecto | texto | ✅ |
| Ticket / N° Incidente | texto | opcional |
| Tipo de Informe | select, opciones desde `catalogo_tipos_informe`, con opción "+ Agregar nuevo tipo..." que crea uno nuevo al vuelo | opcional |
| Permiso de Trabajo | texto | opcional |
| Provincia | select, opciones desde `catalogo_provincias` | opcional |
| Ubicación | texto (dirección) | opcional |
| Descripción del Trabajo | textarea | opcional |
| Tareas Pendientes | textarea, **una tarea por línea**, se listan como viñetas en el PDF | opcional |
| Logo de la Empresa | **de solo lectura** — no se sube acá; muestra el logo configurado globalmente en Configuración → Datos de la Empresa. Si no hay logo cargado, mostrar mensaje indicando dónde cargarlo. | — |

**Funcionalidad de IA — "Mejorar con IA"**: botón junto al campo Descripción del Trabajo. Envía el texto actual a un modelo de lenguaje (Claude vía API) con instrucción de corregir ortografía, gramática y mejorar el tono a uno profesional, sin inventar información nueva. Reemplaza el contenido del textarea con la sugerencia (o mostrar diff/confirmación, a definir con UX).

**Funcionalidad de IA — Dictado por voz**: botón "🎤 Dictar" junto al mismo campo. Usa la Web Speech API del navegador (`SpeechRecognition`/`webkitSpeechRecognition`) para transcribir en vivo. Si el navegador/dispositivo no soporta la API o no hay permiso de micrófono, mostrar mensaje claro (no fallar en silencio).

Provincias a precargar en `catalogo_provincias` (Argentina): Buenos Aires, CABA, Catamarca, Chaco, Chubut, Córdoba, Corrientes, Entre Ríos, Formosa, Jujuy, La Pampa, La Rioja, Mendoza, Misiones, Neuquén, Río Negro, Salta, San Juan, San Luis, Santa Cruz, Santa Fe, Santiago del Estero, Tierra del Fuego, Tucumán.

### 6.2 Paso 2 — Técnicos y Recursos

**Bloque "Agregar Técnico"**:
- Nombre completo (texto con autocompletado contra `catalogo_tecnicos`)
- Torre (texto con autocompletado contra `catalogo_torres`)
- Checkbox "Técnico de Higiene y Seguridad" — marca a esa persona con badge "SEGURIDAD" en la lista
- Botón "+ Agregar Técnico" → agrega a una lista visible debajo, con opción de quitar cada uno

**Bloque "Agregar Vehículo"** (independiente, no por técnico):
- Patente (texto con autocompletado contra `catalogo_vehiculos`)
- Marca / Modelo (opcional)
- Botón "+ Agregar Vehículo" → permite agregar **más de uno**, lista con opción de quitar

### 6.3 Paso 3 — Imágenes

- Dos botones: "Subir Archivos" (input file múltiple) y "Capturar con Cámara" (input file con `capture="environment"` para abrir la cámara trasera en mobile).
- **Marca de agua y geolocalización automática (obligatorio, no opcional):** al agregar cada foto —
  1. Pedir la posición GPS del dispositivo (`navigator.geolocation.getCurrentPosition`, con timeout ~5s).
  2. Procesar la imagen en un canvas: agregar una marca de agua diagonal semitransparente "INFORME TÉCNICO" y una franja inferior con fecha/hora + coordenadas (`lat, lon (±accuracy m)`).
  3. Si no hay permiso o falla el GPS, la franja debe decir explícitamente **"Ubicación no disponible"** — nunca inventar coordenadas ni fallar la carga de la foto por esto.
  4. Guardar la imagen procesada (JPG con marca de agua quemada) **y además** guardar `lat`/`lon`/`accuracy`/`timestamp` como datos estructurados en `informe_imagenes` (para uso futuro en mapa — ver 6.6).
- Grilla de miniaturas con botón de eliminar por foto y contador total.

### 6.4 Paso 4 — Revisión

Pantalla de resumen antes de generar el PDF, mostrando:
- Cabecera con **N° de Generación** (auto-asignado, formato `INF-{año}-{4 dígitos}`), Título, Fecha y Lugar — esta es la cabecera que después encabeza el PDF.
- Tabla de "Datos generales" con todos los campos del Paso 1.
- Descripción del trabajo y Tareas pendientes (como texto/viñetas).
- Tabla de "Personal y recursos": cantidad de técnicos, listado de personal afectado, quién es el técnico de Higiene y Seguridad (o "No"), vehículo(s) utilizado(s).
- Grilla de imágenes adjuntas.
- Bloque **"Ubicaciones registradas"**: una fila por foto con coordenadas, con un botón/link "Ver en mapa" (`https://www.google.com/maps?q={lat},{lon}`) — solo para fotos que sí tienen geolocalización.
- Selector de destinatarios de email: checkboxes con los emails configurados en `config_emails_envio`, todos tildados por defecto, el usuario puede destildar antes de generar. Mensaje resumen de a quién se va a mandar.
- Botón final "Generar PDF" → genera el PDF server-side, lo guarda, y si el envío automático está activo, lo manda por email a los destinatarios seleccionados.

### 6.5 Historial de Informes

- Buscador con comportamiento de **búsqueda en lenguaje natural** (no solo substring): tokenizar la consulta, ignorar palabras vacías en español (el, la, de, del, en, un, una, informe, y), reconocer nombres de mes en español y filtrar por el mes de la fecha del informe, y buscar coincidencias contra título, cliente, ticket, N° de generación, tipo de informe y nombres de técnicos.
- Selección múltiple (checkbox por fila + "Seleccionar todos") con botón "Descargar seleccionados" que arma un `.zip` con los PDFs elegidos.
- **Modelo de dato vs. archivo** (importante, ya validado con el cliente):
  - El **registro** (metadata: título, cliente, fecha, técnicos, N° de generación, etc.) se guarda **indefinidamente** — es liviano y permite buscar cualquier informe viejo.
  - El **archivo PDF y las fotos originales** se conservan solo temporalmente: hasta que se descarguen, o hasta el umbral configurado en Configuración (ver 9.5). Pasado ese punto, el archivo pesado se puede liberar del storage, pero el registro permanece visible en el historial con un estado "Solo registro" (sin botones de descargar/reenviar activos).
  - Cada fila del historial debe indicar visualmente si tiene "PDF disponible" o es "Solo registro".
- Banner informativo explicando este modelo (registro permanente + archivo temporal) en la parte superior del historial.

### 6.6 Roadmap explícitamente fuera de este alcance (no implementar todavía, pero dejar el modelo de datos preparado)
- Vista de mapa mostrando todas las ubicaciones geolocalizadas de los informes (mapa de calor de intervenciones). El dato ya se guarda (`informe_imagenes.lat/lon`); la vista de mapa en sí queda para una iteración futura.

---

## 7. Módulo: Rendición de Gastos

Wizard de **3 pasos**, mismo patrón visual de stepper que Informe Técnico.

### 7.1 Paso 1 — Datos de la Rendición

| Campo | Tipo | Obligatorio |
|---|---|---|
| Motivo / Título | texto | ✅ |
| Fecha | date | ✅ |
| Proyecto / Cliente | texto | opcional |
| Provincia | select, mismo catálogo que Informe Técnico | opcional |
| Viático Recibido | numérico | ✅ |
| Moneda | select ARS / USD | — |

**Importante — corrección de diseño ya validada:** los técnicos **NO** se cargan en este paso. Se cargan **por cada gasto individual** en el Paso 2 (ver abajo), porque un mismo viaje puede tener gastos de distintas personas.

### 7.2 Paso 2 — Agregar Gastos

Formulario "Agregar Gasto":
- Fecha
- Categoría: select desde `catalogo_categorias_gasto`, con opción "+ Agregar nueva categoría..." al vuelo
- Monto
- Comprobante: foto opcional, con los mismos dos botones que Informe Técnico (Subir / Cámara)
- Descripción (opcional)
- **Técnicos de este gasto** (uno o varios): mini-selector con autocompletado (mismo catálogo de técnicos/torres), se agregan como "chips" removibles **antes** de guardar el gasto. Al tocar "+ Agregar Gasto", esos técnicos quedan asociados a esa línea de gasto específica y el selector de chips se vacía para el próximo gasto.
- Botón "+ Agregar Gasto" agrega a una lista debajo, mostrando categoría, monto, fecha, descripción y técnico(s) asociados, con opción de quitar.

### 7.3 Paso 3 — Resumen

- Tabla de resumen: N° de Rendición (auto-asignado, formato `REND-{año}-{4 dígitos}`), Motivo, Fecha, Proyecto/Cliente, **Técnicos involucrados** (únicos, agregados de todos los gastos), Provincia, Viático Recibido, Total Gastado, Cantidad de Gastos.
- Detalle de cada gasto (lista, con miniatura del comprobante si tiene).
- **Caja de saldo**, grande y centrada:
  - Si `viático_recibido >= total_gastado`: texto "Saldo a favor de la empresa", monto en **verde**.
  - Si `viático_recibido < total_gastado`: texto "Saldo a favor del empleado (a reintegrar)", monto en **rojo**.
- Dos botones: "📄 Generar PDF" y "📊 Exportar Excel" (ver sección 11 para el formato del PDF; el Excel debe incluir una fila por gasto con las mismas columnas que la tabla del PDF, más una fila de totales).

### 7.4 Historial de Rendiciones

Mismo criterio que el historial de Informes Técnicos (sección 6.5): listado buscable, con N° de generación, fecha, total, saldo, y acciones de descarga (PDF y Excel).

---

## 8. Módulo: Estadísticas (Supervisor y Administrador)

Pantalla de solo lectura con:

1. **KPIs** (tarjetas): Informes este mes, Gastado este mes, Técnicos activos, Rendiciones sin cerrar.
2. **Gastos por categoría** (barras horizontales con monto).
3. **Informes por técnico** (barras horizontales con cantidad).
4. **🤖 Insights automáticos**: tarjeta con 3-5 observaciones generadas por IA a partir de los datos reales (ej: variación de gasto en una categoría vs. mes anterior, % de informes con técnico de seguridad presente, ubicaciones con intervenciones repetidas, rendiciones abiertas hace mucho). Implementar como un job/función que corre sobre los datos agregados y devuelve texto en lenguaje natural.
5. **💬 Asistente en lenguaje natural**: buscador de preguntas sobre todo el histórico (informes + gastos), ej: "¿Cuánto gastamos en combustible en agosto?", "¿Qué técnico generó más informes este mes?". Requiere una función que traduzca la pregunta a una consulta agregada sobre la base de datos y devuelva la respuesta en texto (usar un modelo de lenguaje con function calling/tool use contra las tablas agregadas, no dar acceso de escritura).
6. **🗺 Mapa de calor de intervenciones**: usa las coordenadas guardadas en `informe_imagenes` para mostrar en un mapa real (Google Maps / Mapbox) dónde se concentran los trabajos. En el wireframe esto está mockeado visualmente — acá sí implementar con un proveedor de mapas real.
7. **⚖️ Comparación entre técnicos similares**: agrupar por torre y comparar cantidad de informes/gastos contra el promedio del grupo, señalando outliers (para entender carga de trabajo, **no para uso punitivo** — dejar ese matiz en el texto de la UI).
8. **🔍 Verificación de fotos vs. tarea declarada**: control de calidad automático que compara (con un modelo de visión) el contenido de las fotos contra la descripción del trabajo declarada, marcando informes donde no coincide para revisión manual antes de enviarlos.
9. **🔧 Mantenimiento predictivo**: cruza ubicación + tipo de tareas de los informes técnicos para anticipar dónde puede repetirse una falla (ej: mismo lugar con 3+ intervenciones en poco tiempo).

---

## 9. Configuración (solo Administrador)

### 9.1 Datos de la Empresa
- Subida de **Logo** (imagen), con preview y botón "Quitar". Este logo se usa automáticamente en la cabecera de **todos** los PDF generados (Informe Técnico y Rendición de Gastos) de ahí en adelante — no se vuelve a pedir por informe.

### 9.2 Envío automático por email
- Switch "Enviar el PDF automáticamente al generarlo".
- Lista de emails destinatarios (agregar/quitar), reutilizada como opciones seleccionables en el Paso de Revisión de cada informe/rendición (sección 6.4).

### 9.3 Catálogos
Todos con patrón CRUD simple (agregar con formulario, listar, quitar): **Técnicos** (nombre + torre), **Torres**, **Vehículos** (ver 9.4, más completo), **Provincias**, **Tipos de Informe**, **Categorías de Gasto**.

### 9.4 Vehículos — ficha completa + gestión de flota

Cada vehículo del catálogo tiene:
- Patente, Marca/Modelo
- **Vencimiento de Tarjeta Verde** (fecha) + foto del documento
- **Vencimiento de RTO** (fecha) + foto del documento
- **Kilometraje actual**

En el listado, cada vehículo muestra badges de estado calculados automáticamente comparando la fecha contra hoy:
- 🟢 **Al día** (más de 30 días para vencer)
- 🟡 **Próximo a vencer** (30 días o menos)
- 🔴 **Vencido** (fecha ya pasada)

**Sub-sección "Service"**: formulario para registrar cada service — vehículo (select), fecha, kilometraje al momento del service, foto, descripción. Se guarda un historial completo por vehículo.

**Sub-sección "Vencimientos 🤖" (IA de mantenimiento de flota)**: lista automática de alertas, recalculada en tiempo real cada vez que cambia un vehículo o se registra un service, combinando:
- Alertas de documentación (Tarjeta Verde / RTO) con estado 🟡 o 🔴 (no mostrar los que están 🟢, para no generar ruido).
- Alertas por **kilometraje**: comparar `kilometraje_actual` contra el km del **último service registrado** de ese vehículo.
  - Intervalo de service de referencia: **10.000 km** (mostrar este número como parámetro visible, idealmente configurable a futuro).
  - 🔴 si ya se superó el intervalo (diferencia ≥ 10.000 km desde el último service).
  - 🟡 si quedan 1.000 km o menos para llegar al intervalo.
  - 🟡 también si el vehículo tiene kilometraje cargado pero **nunca tuvo un service registrado** (para que no quede sin ningún dato de referencia).
- Todas las alertas ordenadas por urgencia (vencido/superado primero).
- Si no hay ninguna alerta: mensaje "✅ Todo al día — sin vencimientos ni service pendientes en la flota."

### 9.5 Historial y almacenamiento
- Selector del umbral de aviso (no de borrado — ver el modelo de dato-vs-archivo en 6.5): **"Avisar a los 20 informes / 4 semanas"**, **"a los 50 / 8 semanas"**, o **"a los 100 / 12 semanas"** sin archivar. **Nunca se borra nada automáticamente** — el sistema solo avisa.
- Switch "Recordatorio semanal de archivo" (aviso los viernes).

### 9.6 Resumen semanal por IA
- Switch "Mandar un resumen automático los lunes" — un email armado por IA con los informes generados la semana anterior, agrupados por cliente, con nombres de técnicos y detección de tareas pendientes sin resolver.

### 9.7 Registro de Cambios (auditoría)
Tabla `audit_log` con una fila por cada alta/baja en cualquier catálogo, cambio de logo, o cambio de umbral de retención, hecha por un Administrador. Mostrar en Configuración una lista (más reciente primero) con: quién (nombre + rol), qué acción, y cuándo. **Es necesario porque puede haber más de un Administrador** y sirve de trazabilidad.

---

## 10. Resumen de funcionalidades de IA (para no perder ninguna en el desarrollo)

| # | Funcionalidad | Dónde vive | Qué hace |
|---|---|---|---|
| 1 | Mejorar texto | Informe Técnico, Paso 1 | Corrige ortografía/gramática y da tono profesional a la Descripción del Trabajo |
| 2 | Dictado por voz | Informe Técnico, Paso 1 | Transcribe voz a texto en el campo Descripción, con corrección posterior |
| 3 | Búsqueda en lenguaje natural | Historial (Informes y Gastos) | Interpreta consultas coloquiales, incluyendo meses en español |
| 4 | Resumen semanal automático | Configuración → activable | Email armado por IA cada lunes con lo generado la semana anterior |
| 5 | Insights automáticos | Estadísticas | Observaciones en lenguaje natural sobre tendencias de gastos/seguridad/ubicaciones |
| 6 | Asistente conversacional sobre datos | Estadísticas | Preguntas y respuestas en lenguaje natural cruzando informes + gastos |
| 7 | Mantenimiento predictivo (obras) | Estadísticas | Anticipa fallas repetidas por ubicación |
| 8 | Comparación entre técnicos | Estadísticas | Compara carga de trabajo dentro de un mismo grupo/torre |
| 9 | Verificación de fotos vs. tarea | Estadísticas | Control de calidad automático con visión por computadora |
| 10 | Vencimientos de flota | Configuración → Vehículos | Vigila fechas de documentación y kilometraje de service |

---

## 11. Generación de PDF

**No diseñar desde cero — replicar exactamente las plantillas adjuntas** (`Informe Tecnico - Diseño PDF.pdf` y `Rendicion de Gastos - Diseño PDF.pdf`, con sus `.docx` editables de referencia para ver estructura de tablas/estilos).

Especificaciones visuales comunes a ambos documentos:

- **Cabecera repetida en cada página**: tabla de 3 columnas — logo de la empresa (configurado globalmente) | tipo de documento + título del informe/rendición (centrado) | fecha + N° de generación.
- **Título principal** debajo de la cabecera, en negrita, con una línea inferior de acento en color naranja `#C6551A`.
- **Tabla de datos clave**: columna izquierda con fondo azul marino `#1F3864` y texto blanco en negrita (las etiquetas), columna derecha con los valores en texto normal sobre fondo blanco. Bordes finos grises (`#9AA0A8`).
- **Títulos de sección** ("Tareas Pendientes", "Documentación de la Tarea", "Detalle de Gastos", etc.) en naranja `#C6551A`, negrita, mayúsculas.
- **Pie de página repetido en cada página**: tabla de firmas "Realizó / Revisó / Aprobó" + una línea con "Documento: {Cliente}-Público · Generado por {nombre de la app}" alineada a la derecha.
- Fuente: una sans-serif estándar tipo Calibri/Arial (el docx de referencia usa la fuente por defecto de Word).

**Específico del PDF de Informe Técnico:**
- Fotos en pares (2 por fila), con la marca de agua/geolocalización ya incluida en la imagen (ver sección 6.3).
- Sección final "Tareas Pendientes" en viñetas, tomada del campo cargado por el usuario (no hardcodear).
- Sección "Documentación de la Tarea" para adjuntos como el permiso de trabajo escaneado.

**Específico del PDF de Rendición de Gastos:**
- Tabla "Detalle de Gastos" con columnas: Fecha | Categoría | Técnico(s) | Descripción | Monto, con fila de "TOTAL GASTADO" resaltada al final.
- Caja de "Resultado de la Rendición" grande y centrada, con el monto en **verde** (`#1E7A4A`) si el saldo es a favor de la empresa, o en **rojo** (`#B33A3A`) si es a reintegrar al empleado — con el label correspondiente arriba del monto.
- Sección "Comprobantes" con las fotos de cada gasto, de a dos por fila, cada una con su etiqueta (categoría — fecha — monto).

**Importante**: generar el PDF **en el servidor**, no en el navegador, para garantizar consistencia visual entre dispositivos. El HTML/CSS o los componentes usados para generarlo deben tomar como fuente de verdad los valores hexadecimales de color especificados arriba, no aproximaciones.

---

## 12. Requisitos no funcionales

- **Multiplataforma real**: debe funcionar bien tanto en celular (carga de fotos desde cámara, GPS) como en PC (carga de archivos desde disco). Layout responsive en todos los pasos de los wizards.
- **Seguridad**: Row Level Security en Supabase — un Técnico no debe poder leer ni modificar la Configuración ni ver Estadísticas vía API aunque manipule el frontend; la restricción debe estar también en el backend, no solo ocultando botones en la UI.
- **Accesibilidad básica**: foco de teclado visible, contraste adecuado sobre el fondo oscuro, tamaños de touch-target apropiados para mobile.
- **Manejo de errores de geolocalización/cámara**: nunca bloquear el flujo principal (cargar informe/gasto) por falta de permisos de GPS o cámara — degradar con avisos claros.
- **Nomenclatura consistente**: usar exactamente los mismos nombres de campos y etiquetas que aparecen en este documento y en el wireframe adjunto (evita inconsistencias entre lo que ve el usuario y lo que se guarda en la base).

---

## 13. Explícitamente fuera de alcance de la primera versión

- Vista de mapa real con el mapa de calor de intervenciones (el dato ya se modela, la visualización queda para después).
- Alertas de vencimiento de permisos de trabajo u otros documentos más allá de los de vehículos (Tarjeta Verde/RTO) — el cliente pidió ir viendo esto más adelante, no incluirlo todavía salvo que se retome explícitamente.
- Intervalo de service configurable por vehículo (por ahora es un valor fijo de 10.000 km para todos).
- App nativa (a menos que se decida explícitamente reemplazar la PWA por una app Expo/React Native).

---

## 14. Checklist de aceptación (QA)

Antes de dar por terminada una entrega, verificar:

- [ ] Un usuario Técnico no puede ver ni acceder (ni por URL directa) a Configuración ni Estadísticas.
- [ ] Un usuario Supervisor puede ver Estadísticas pero no puede modificar nada en Configuración.
- [ ] El PDF de Informe Técnico generado coincide visualmente (colores, tabla, cabecera/pie) con `Informe Tecnico - Diseño PDF.pdf`.
- [ ] El PDF de Rendición de Gastos generado coincide visualmente con `Rendicion de Gastos - Diseño PDF.pdf`, y el color del saldo cambia correctamente según el signo.
- [ ] Al agregar una foto sin permiso de GPS, el informe/gasto se puede seguir cargando normalmente y la foto queda marcada como "Ubicación no disponible".
- [ ] Un gasto puede tener 0, 1 o varios técnicos asociados, y el PDF/Excel los lista correctamente.
- [ ] Los catálogos (técnicos, torres, vehículos, provincias, tipos de informe, categorías de gasto) permiten agregar ítems nuevos "al vuelo" desde los propios formularios de carga, sin tener que ir a Configuración.
- [ ] El Registro de Cambios refleja en tiempo real cualquier alta/baja hecha en Configuración, con el nombre y rol del usuario que la hizo.
- [ ] Las alertas de vencimiento de flota (documentación + kilometraje) se recalculan solas al agregar/editar un vehículo o registrar un service.
- [ ] El historial nunca borra un registro automáticamente, solo avisa según el umbral configurado.
- [ ] La app es usable de punta a punta desde un celular (cámara + GPS) y desde una PC (sin cámara/GPS, con carga de archivos).

---

## 15. Archivos de referencia adjuntos

Subir junto con este prompt al proyecto de Claude Code:

1. **`informe-tecnico-wireframe.html`** — prototipo HTML/CSS/JS autocontenido y funcional. Abrir en el navegador y probar todos los flujos antes de escribir código: es la fuente de verdad de la experiencia de usuario, con todas las correcciones ya incorporadas a través de varias rondas de feedback del cliente.
2. **`Informe Tecnico - Diseño PDF.pdf`** y **`Informe Tecnico - Plantilla editable.docx`** — diseño final aprobado del PDF de Informe Técnico.
3. **`Rendicion de Gastos - Diseño PDF.pdf`** y **`Rendicion de Gastos - Plantilla editable.docx`** — diseño final aprobado del PDF de Rendición de Gastos.
4. El Word original del cliente (remito de referencia), si se incluye, es solo contexto histórico de cómo lo hacían antes — **la plantilla nueva ya adaptada es la de los archivos del punto 2**, no hace falta rediseñar a partir del original de nuevo.

**Si algo en este documento no queda claro o parece contradictorio, la fuente de desempate es el wireframe HTML interactivo — probarlo siempre antes de asumir un comportamiento.**
