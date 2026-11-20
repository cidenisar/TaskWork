# Revisión adversarial de bugs — 2026-10-15

Auditoría de solo lectura de todo `informes-app/src/` (271 archivos .ts/.tsx) más el
esquema/políticas RLS reales del proyecto Supabase "Informes" (`oyhmoeqplifvbdktdwbm`),
cruzadas con el código que las usa. La auditoría en sí no aplicó ningún fix (este
documento fue el único archivo que escribió); los 8 hallazgos de severidad
crítico/alto/bajo se corrigieron después, en la misma sesión — ver "Estado" al lado de
cada uno. Solo el hallazgo #8 (medio, paginación) quedó sin aplicar, a propósito: no
está manifestado hoy y el fix real es extraer un helper de paginación genérico y
tocar ~9 call sites, una decisión más grande para tomar con el equipo despierto.

Metodología: `list_tables` + `get_advisors` (security/performance) + lectura directa de
`pg_policies`/`pg_proc` para RLS; grep sistemático de `.update(`/`.upsert(`/`.delete(` por
tabla cruzado contra sus policies reales; lectura módulo por módulo (server actions +
página + componente) de Salas, Torres de Comunicación, Tableros/adjuntos, Plan de
Mantenimiento, Panel (Vista General, mapa, jerarquía), visores públicos `/planos/*` y
todas las rutas bajo `/api/`.

## Resumen

**Por severidad:** 2 crítico (seguridad) + 2 crítico (funcional/datos) = 4 crítico · 2 alto · 2 medio · 1 bajo = **9 hallazgos**.

**Por módulo:**
- Storage / RLS transversal (Historial de todos los módulos): 1 crítico
- Panel de Supervisión (mapa de Vista General): 1 crítico (XSS)
- Ubicaciones / GPS compartido (`lib/ubicaciones/resolver.ts`): 1 crítico
- Salas (módulo nuevo): 1 crítico
- Configuración → Vaciar datos de prueba: 1 alto
- Bajas de Equipamiento / Entregas a Depósito (equipamiento de rack): 1 alto
- Panel → Vista General (vencimientos, KPIs): 1 medio
- Selects sin paginar (GPS resolver, mapa, overview, mantenimientos, estadísticas): 1 medio
- `ubicaciones/actions.ts` (comentario desactualizado): 1 bajo
- Revisados sin hallazgos: ver sección final.

---

## CRÍTICO

### 1. XSS persistente en el mapa de Vista General del Panel (vía nombre de tablero/rack/sala/equipo)

**Estado: corregido** (escapado de `label`/`nombreSitio`/`categoriaLabel` antes de interpolar en el HTML del popup, `src/components/panel/mapa-relevamientos-inner.tsx`).

**Archivo:** `src/components/panel/mapa-relevamientos-inner.tsx:164-165`

**Qué está mal:** el popup de cada marcador de Leaflet se arma concatenando texto libre
del usuario (`p.label`, que sale de la `denominacion`/`texto` que cualquier técnico
escribe al dar de alta un tablero/rack/torre/sala/equipo, y `p.nombreSitio`) directo en
un string HTML, y se lo pasa a `.bindPopup(popupHtml)`. Leaflet asigna ese string a
`innerHTML` sin escapar — es el único lugar de todo el código que usa HTML crudo
(`dangerouslySetInnerHTML`/`innerHTML`/`bindPopup` no aparecen en ningún otro archivo).

```ts
const popupHtml = `<b>${p.label}</b><br/>${p.modulo}${p.categoriaLabel ? ` · ${p.categoriaLabel}` : ""}<br/>${p.nombreSitio}<br/>...`;
L.marker([p.lat, p.lng], { icon: ... }).bindPopup(popupHtml).addTo(capa);
```

**Escenario concreto de falla:** cualquier técnico autenticado (no hace falta admin) da
de alta un tablero/rack/sala/torre/equipo con una denominación como
`<img src=x onerror="fetch('/configuracion/...',{method:'POST',...})">` (o similar). La
próxima vez que un Administrador o Supervisor abre Panel → Vista General y el mapa
muestra ese marcador (no hace falta ni siquiera que lo toquen, dependiendo del payload;
como mínimo al abrir el popup), el script corre en el navegador autenticado del
Admin/Supervisor — con su sesión real, pudiendo invocar cualquier Server Action que ese
rol puede invocar (cambiar roles, borrar registros, etc.). Es persistente porque el
nombre queda guardado en la base y se vuelve a renderizar cada vez que alguien abre el
mapa.

**Severidad:** Crítico (XSS con escalamiento a sesión de Admin).
**Sugerencia:** nunca pasar un string armado a mano a `bindPopup`; o escapar
`label`/`nombreSitio`/`modulo`/`categoriaLabel` (HTML-entity encode) antes de interpolar,
o construir el contenido del popup con un `DocumentFragment`/elementos DOM reales en vez
de un string HTML.

---

### 2. Admin/Supervisor no puede abrir el PDF/DXF/foto de un informe cargado por otro usuario, en NINGÚN módulo

**Estado: corregido** (migración `fix_salas_update_own_and_storage_admin_select` — policies `informes_pdf_select_stats`/`comprobantes_select_stats` con `is_admin_or_supervisor()`, aditivas).

**Archivos:** `src/app/(app)/tableros/historial/actions.ts`, `racks/historial/actions.ts`,
`equipos/historial/actions.ts`, `torres-comunicacion/historial/actions.ts`,
`informe-tecnico/historial/actions.ts`, `rendicion-gastos/historial/actions.ts`,
`salas/historial/actions.ts` — y las policies de `storage.objects` del bucket
`informes-pdf`/`comprobantes`.

**Qué está mal:** todas estas acciones de "Ver PDF/DXF/foto" usan el cliente normal
(sesión del usuario) para `supabase.storage.from("informes-pdf").createSignedUrl(...)`, y
el comentario que las encabeza da por sentado que, como la policy de SELECT de la tabla
(`tablero_mediciones_select_own`, etc.) ya deja ver TODAS las filas a Admin/Supervisor,
"ya alcanza". Pero `createSignedUrl` también exige permiso real sobre el objeto de
Storage, y la policy de SELECT del bucket `informes-pdf` es:

```
informes_pdf_select_own: bucket_id='informes-pdf' AND (storage.foldername(name))[1] = auth.uid()
```

— no tiene ningún OR `is_admin_or_supervisor()`, a diferencia del bucket `informe-fotos`,
que sí tiene una policy aparte para eso (`informe_fotos_select_stats`,
`bucket_id='informe-fotos' AND is_admin_or_supervisor()`). El bucket `comprobantes`
(fotos de gastos) tiene el mismo problema (solo `comprobantes_select_own`). Todo archivo
se guarda bajo `${uid-del-creador}/...`, así que ningún otro usuario matchea
`foldername[1] = auth.uid()`.

**Escenario concreto de falla:** un técnico carga una medición de tablero (PDF generado
y subido OK). Un Supervisor entra a Tableros → Historial, ve la fila (la tabla SÍ se la
muestra, porque la policy de la tabla sí contempla `is_admin_or_supervisor()`), toca "Ver
PDF" — y recibe **"No se pudo generar el link de descarga."**, un mensaje que parece
"se perdió el archivo" pero en realidad es un 403 de Storage por falta de policy. Pasa
exactamente igual con el DXF de Tableros, la foto de un Mantenimiento, el PDF de
Racks/Equipos/Torres/Salas/Informe Técnico/Rendición de Gastos y el comprobante de un
gasto — en los siete módulos revisados. Es decir: la función básica de "un
Admin/Supervisor revisa el trabajo cargado por el equipo" (la razón de ser de esos
roles) está rota en el 100% de los casos salvo que el propio Admin/Supervisor haya sido
quien cargó el registro.

**Severidad:** Crítico (rompe una función central usada a diario por todo Admin/
Supervisor, en los 7 módulos con PDF, de forma silenciosa — el error no delata la causa
real).
**Sugerencia:** agregar, para los buckets `informes-pdf` y `comprobantes`, una policy de
SELECT análoga a `informe_fotos_select_stats` (`bucket_id = '...' AND
is_admin_or_supervisor()`) — es aditiva, no afloja nada existente (las policies
permisivas de Postgres se combinan con OR). Alternativa: las acciones de "ver PDF/foto"
podrían validar el rol en código y usar `createServiceRoleClient()` cuando el usuario sea
Admin/Supervisor, igual criterio que ya se usa en otros flujos de la app (ver
`darDeBajaAction`).

---

### 3. El "aprendizaje" de GPS de Ubicaciones está roto para todo el mundo salvo un Administrador

**Estado: corregido** (`tagGpsSiFalta` usa service-role para el UPDATE puntual, `src/lib/ubicaciones/resolver.ts`).

**Archivo:** `src/lib/ubicaciones/resolver.ts:79-99` (función `tagGpsSiFalta`), llamada
desde `equipos/nuevo`, `tableros/nuevo`, `salas/nuevo`, `rendicion-gastos/nueva`,
`entregas-deposito/nueva`, `torres-comunicacion/nuevo`, `racks/nuevo`,
`informe-tecnico/nuevo` e `informe-tecnico/editar/[id]` — 9 puntos de entrada.

**Qué está mal:** `tagGpsSiFalta` hace `supabase.from("ubicaciones").update({ lat, lng,
... })` con el cliente normal (sesión del usuario que está cargando el informe). La
policy de UPDATE de `ubicaciones` es `ubicaciones_admin_update: is_admin()` — y
`is_admin()` exige `rol = 'admin'` exacto (ni siquiera `supervisor` pasa). Como es un
`UPDATE` que no tira error cuando afecta 0 filas, el flujo sigue normal (el informe se
guarda bien) pero la coordenada nunca se graba.

**Escenario concreto de falla:** un técnico (el 100% del uso real de campo) carga
cualquier informe/relevamiento con GPS capturado, en un sitio que todavía no tiene
coordenadas. La función intenta guardar `lat`/`lng`/`gps_confirmado_por` — y falla en
silencio. La próxima persona que pase por el mismo lugar físico NUNCA va a matchear por
cercanía (`/api/ubicaciones/resolver-gps`, radio de 300m), porque `lat` sigue `null` —
tiene que elegir/escribir el sitio a mano de nuevo, indefinidamente. Es exactamente la
feature descrita como ya probada y funcionando en `CRITERIOS_Y_IDEAS.md` (sección 1,
"Alta al vuelo + aprendizaje por uso" — GPS), pero en la práctica solo funciona si quien
carga el informe es, específicamente, un Administrador, algo que casi nunca pasa.

**Severidad:** Crítico (una feature central, documentada como ya validada en producción,
no funciona para el 100% del uso real previsto — field técnicos y supervisores —, de
forma completamente silenciosa, en los 9 módulos que la comparten).
**Sugerencia:** mismo patrón ya usado en `darDeBajaAction`/`entregarLoteADepositoAction`:
o bien se agrega una policy de UPDATE más permisiva pero acotada (ej. permitir setear
`lat`/`lng`/`gps_*` solo cuando están en `null`, vía una función `SECURITY DEFINER`), o
bien `tagGpsSiFalta` recibe un cliente de service-role (justificado en código: el
"aprendizaje" de GPS es un efecto secundario mecánico de una acción ya autorizada, no una
edición libre de Ubicaciones).

---

### 4. El módulo Salas nunca graba sus fotos ni su PDF para ningún técnico

**Estado: corregido** (policy `salas_update_own: created_by = auth.uid()` agregada, misma migración que el hallazgo #2).

**Archivo:** `src/app/(app)/salas/nuevo/actions.ts:97` y `:136`.

**Qué está mal:** exactamente el mismo patrón que el bug anterior, pero sobre la propia
tabla `salas`. `crearSalaAction` sube las fotos y el PDF a Storage correctamente, pero
después hace:

```ts
await supabase.from("salas").update({ fotos_generales_urls: fotosGeneralesUrls }).eq("id", salaId);
...
await supabase.from("salas").update({ pdf_url: pdfPath, pdf_generado_at: ... }).eq("id", salaId);
```

con el cliente normal — y la policy de UPDATE de `salas` es `salas_admin_update:
is_admin()`. `salas/nuevo/page.tsx` solo exige `requireProfile()` (cualquier rol), así
que cualquier técnico puede (y es el uso previsto) cargar una sala.

**Escenario concreto de falla:** un técnico relevа una Sala/Shelter, saca fotos, el
sistema genera el PDF — todo sube bien a Storage — pero las dos columnas
(`fotos_generales_urls`, `pdf_url`/`pdf_generado_at`) quedan `null` para siempre, sin
ningún error visible (la action devuelve `success: true`). Consecuencias confirmadas
leyendo el resto del módulo: en `/planos/sala/[id]` (el visor público del QR pegado en la
puerta de la sala) nunca aparece el botón "Ver PDF del relevamiento"
(`src/app/planos/sala/[id]/page.tsx:59-63`, depende de `sala.pdf_url`); y
`obtenerUrlPdfSalaAction` (`salas/historial/actions.ts`) devuelve **"El PDF ya no está
disponible."** — aunque el PDF esté perfectamente guardado en el bucket. Es el mismo bug
ya encontrado y arreglado una vez para Tableros/Racks/Torres (falta la policy de UPDATE
para el creador no-admin de una fila de relevamiento), reintroducido en el módulo más
nuevo del repo.

**Severidad:** Crítico (pérdida silenciosa y permanente de datos — fotos y PDF — para el
100% de las Salas cargadas por cualquier no-Administrador, que es el uso normal del
módulo).
**Sugerencia:** agregar una policy de UPDATE a `salas` para el creador de la fila (ej.
`created_by = auth.uid()`), igual que ya existe en `tablero_mediciones_update_own`,
`rack_relevamientos_update_own`, `equipo_relevamientos_update_own`,
`torre_comunicacion_relevamientos_update_own` — todas las tablas hermanas de "relevamiento
por visita" ya tienen esa policy; solo `salas` quedó con UPDATE admin-only.

---

## ALTO

### 5. "Vaciar datos de prueba" no borra 5 módulos agregados después de escribirse

**Estado: corregido** (`TABLAS_EN_ORDEN` ampliada con las 9 tablas faltantes en el orden correcto por FK, más tipado de `instalaciones` en `database.types.ts` — esa tabla no estaba tipada; tenía 5 filas reales de la época del viejo módulo standalone. Texto de la tarjeta actualizado para listar todos los módulos.).

**Archivo:** `src/lib/admin/vaciar-datos-prueba.ts:18-29` (`TABLAS_EN_ORDEN`) +
`src/components/config/vaciar-datos-prueba.tsx` (texto de la tarjeta).

**Qué está mal:** la lista de tablas que esta feature borra es:
`tablero_mediciones, tableros, rack_relevamientos, racks, equipo_relevamiento_lecturas,
equipo_relevamientos, equipos, bajas_equipamiento, informes_tecnicos,
rendiciones_gastos`. Nunca se actualizó al agregar: **Torres de Comunicaciones**
(`torres_comunicacion` + `torre_comunicacion_equipamientos` +
`torre_comunicacion_relevamientos` + `torre_comunicacion_relevamiento_lecturas`),
**Salas** (`salas`), **Entregas a Depósito** (`entregas_deposito`), **Instalaciones**
(`instalaciones`), y todo el **Plan de Mantenimiento**
(`mantenimiento_programaciones`, `mantenimientos_equipamiento`,
`mantenimiento_checklist_respuestas`). Ninguna de estas tablas es hija por FK CASCADE de
las que sí se borran, así que no caen solas.

**Escenario concreto de falla:** un Administrador usa esta herramienta tal como está
pensada — "antes de arrancar en producción real", escribe "BORRAR TODO" y confía en el
mensaje de éxito ("Informes, Rendiciones, Tableros, Racks, Equipos y Bajas quedaron en
cero"). Los datos de prueba cargados en Torres de Comunicaciones, Salas, Entregas a
Depósito, Instalaciones y el Plan de Mantenimiento (filas, PDFs y fotos en Storage)
quedan en la base de producción — ni la UI ni el resultado de la action avisan que
esos módulos no están cubiertos, porque el texto de la tarjeta ni los menciona (no
promete de más, pero tampoco avisa que hay un "resto" sin limpiar). Es el mismo patrón ya
descrito en `CRITERIOS_Y_IDEAS.md` (sección 8): un archivo/lista con nombre "obvio" que
nadie revisó al agregar el módulo siguiente.

**Severidad:** Alto (datos de prueba reales filtrándose a producción, sin ningún aviso,
justo en el único momento — pre-lanzamiento — donde el equipo confía en esta
herramienta).
**Sugerencia:** agregar las tablas/buckets faltantes a `TABLAS_EN_ORDEN` (respetando el
orden por FK: los `_relevamiento_lecturas`/`_equipamientos` antes que su padre) y
actualizar el texto de la tarjeta para que liste explícitamente TODOS los módulos que
cubre, de forma que una futura omisión sea más fácil de notar a simple vista.

---

### 6. El número de serie de equipamiento de rack se pierde al dar de baja o entregar a depósito

**Estado: corregido** (`numero_serie` agregado al `.select()` y devuelto en vez de `null`, `src/lib/equipamiento/resolver-equipo.ts`).

**Archivo:** `src/lib/equipamiento/resolver-equipo.ts:56-74` (rama `rack_equipamiento`).

**Qué está mal:** `resolverEquipo()` selecciona columnas distintas según el tipo de
equipo. Para `equipos` (Equipos Individuales) sí trae `numero_serie`. Para
`rack_equipamientos` el `.select(...)` no incluye `numero_serie` — y la función devuelve
`numeroSerie: null` a mano:

```ts
const { data: item } = await service
  .from("rack_equipamientos")
  .select("texto, categoria_equipo, marca_modelo, etiqueta_ypf, estado, rack_id")
  // falta numero_serie
  ...
return { ..., numeroSerie: null, ... };
```

La tabla `rack_equipamientos` SÍ tiene la columna `numero_serie` (confirmado en el
esquema real) y el relevamiento de Racks la carga igual que en Equipos Individuales.

**Escenario concreto de falla:** un técnico releva un rack y carga el número de serie
real de un switch/UPS montado ahí. Meses después, un Supervisor da de baja ese equipo
(`darDeBajaAction`, que usa `resolverEquipo` para armar el comprobante) o lo manda a
depósito — el PDF/comprobante oficial de Baja o Entrega a Depósito, y la fila
correspondiente en `bajas_equipamiento`/`entregas_deposito`, muestran el número de serie
en blanco, aunque el dato real sigue disponible (sin tocar) en `rack_equipamientos`. Es
una pérdida de dato silenciosa en el único documento que debería trazar el equipo físico
devuelto.

**Severidad:** Alto (dato real existente que se pierde en el comprobante oficial de
Bajas/Entregas a Depósito para todo equipamiento de rack).
**Sugerencia:** agregar `numero_serie` al `.select()` de la rama `rack_equipamiento` y
devolver `item.numero_serie` en vez de `null`.

---

## MEDIO

### 7. Vencimientos del Panel calculados sin anclar a medianoche (riesgo de off-by-one-día)

**Estado: corregido** (`diasRestantes` ancla ambas puntas a medianoche local, `src/lib/panel/overview.ts`).

**Archivo:** `src/lib/panel/overview.ts:94-96` (función `diasRestantes`).

**Qué está mal:** a diferencia del patrón ya establecido en otras partes de la app
(`new Date(\`${fecha}T00:00:00\`)`, usado en `lib/mantenimiento/generar-programacion.ts` y
`lib/panel/mantenimientos.ts`), acá se compara directo:

```ts
function diasRestantes(fechaIso: string, hoy: Date): number {
  return Math.round((new Date(fechaIso).getTime() - hoy.getTime()) / 86_400_000);
}
```

`new Date("2026-11-01")` (sin hora) se interpreta como **medianoche UTC**, mientras que
`hoy = new Date()` es el instante actual completo (no medianoche local). Para una
operación en Argentina (UTC-3 fijo, sin horario de verano) esto introduce un
desfasaje de hasta varias horas entre "medianoche UTC del vencimiento" y "medianoche
local real", que combinado con `Math.round` puede mover un vencimiento un día antes o
después de lo que correspondería en el calendario local — especialmente para
`diasRestantes` chicos (cerca del límite vencido/próximo).

**Escenario concreto de falla:** un DNI o una tarjeta verde con vencimiento el día de hoy
o mañana puede aparecer como "vencido" un día antes, o como "al día" un día después de lo
real, en los cuadros de KPI y en la lista de vencimientos del Panel — un desvío de UI
menor pero real, que no se ve en los otros cálculos de fecha de la misma app (que sí
siguen el patrón correcto).

**Severidad:** Medio (afecta solo la fecha límite exacta, no la tendencia general; no
rompe datos, solo puede mostrar el estado equivocado por un día en el Panel).
**Sugerencia:** anclar igual que el resto de la app:
`new Date(\`${fechaIso}T00:00:00\`)`, o comparar contra una `hoy` también anclada a
medianoche local antes de restar.

---

### 8. Varios `.select()` sin paginar reintroducen la clase de bug ya conocida en `ubicaciones` (no manifestado todavía)

**Estado: pendiente, a propósito** — no manifestado hoy (ninguna tabla cruza 1000 filas), y el fix real (extraer una versión genérica de `fetchTodasLasUbicaciones` y migrar ~9 call sites) es un cambio más grande para decidir con el equipo despierto, no uno para aplicar solo mientras duermen.

**Archivos:**
- `src/app/api/ubicaciones/resolver-gps/route.ts` — `supabase.from("ubicaciones").select(...).not("lat", "is", null)` sin `.range()`/`.limit()`.
- `src/lib/panel/mapa.ts` — `tableros`, `racks`, `torres_comunicacion`, `equipos`, `salas`.
- `src/lib/panel/overview.ts` y `src/lib/panel/mantenimientos.ts` — mismos cinco + `rack_equipamientos`, `mantenimientos_equipamiento`, `mantenimiento_programaciones`, `profiles`.
- `src/lib/estadisticas/tools.ts` (`gastosPorCategoria`, `informesPorTecnico`) — `gastos`, `rendiciones_gastos`, `informes_tecnicos`.

**Qué está mal:** ninguno de estos usa `.range()`, a diferencia de
`fetchTodasLasUbicaciones` (que el propio equipo escribió específicamente para arreglar
este bug en `ubicaciones`, documentándolo en su propio comentario). Hoy ninguna de estas
tablas supera las 1000 filas (la más grande, `rack_equipamientos`, tiene 49), así que
nada está roto todavía.

**Escenario concreto de falla (futuro, no actual):** apenas cualquiera de estas tablas
cruce 1000 filas (plausible para `gastos`/`informes_tecnicos` en unos años de uso normal,
o para `ubicaciones` filtrada por `lat IS NOT NULL` apenas se arregle el hallazgo #3 de
este informe y el GPS empiece a guardarse de verdad), PostgREST corta la respuesta en
silencio: el mapa de Vista General deja de mostrar unidades "al azar" (las que quedan
después del corte), el matcheo de GPS por cercanía deja de encontrar sitios ya
confirmados más allá de la fila 1000 (crea ubicaciones duplicadas en vez de reusar), y
los KPIs de Estadísticas/Panel empiezan a subestimar sin ningún error.

**Severidad:** Medio (no manifestado hoy, pero es exactamente el bug que el equipo ya
pagó una vez en este mismo repo, reintroducido en 9 lugares más).
**Sugerencia:** mover estos fetches a través de una versión genérica de
`fetchTodasLasUbicaciones` (loop de `.range()`), igual criterio para cualquier
"traer la tabla completa" nuevo que se agregue de acá en más.

---

## BAJO

### 9. Comentario desactualizado sobre RLS de `tablero_circuitos`

**Estado: corregido** (comentario actualizado, `src/app/(app)/ubicaciones/actions.ts`).

**Archivo:** `src/app/(app)/ubicaciones/actions.ts:200-201`.

**Qué está mal:** el comentario de `darDeBajaAction` dice que
`tablero_circuitos` **"no tiene ninguna policy de UPDATE todavía"** — pero sí la tiene
(`tablero_circuitos_admin_update: is_admin()`, confirmado contra las policies reales).
No cambia el comportamiento (la action ya usa `service-role` sin depender de esa policy),
pero es información incorrecta para quien lea el código después y decida, a partir de
ese comentario, que hace falta agregar la policy — exactamente el tipo de desajuste
entre comentario/esquema vivo que `CRITERIOS_Y_IDEAS.md` pide revisar antes de confiar en
un comentario.

**Severidad:** Bajo (no causa ningún comportamiento incorrecto hoy).
**Sugerencia:** actualizar el comentario para reflejar que la policy de UPDATE existe
(admin-only) y que por eso el bypass de service-role sigue siendo necesario para
Supervisor, no porque falte la policy.

---

## Revisado, sin hallazgos

- **Visores públicos `/planos/tablero/[id]` y `/planos/sala/[id]`**: ambos filtran
  correctamente por el `id` recibido en todas sus queries (circuitos, mediciones,
  mantenimientos, adjuntos), solo exponen campos básicos de Ubicación (nunca GPS exacto,
  otros equipos del sitio, vehículos o datos de técnicos) y no redirigen si no hay sesión
  — consistentes con el criterio documentado de "la barrera real es el acceso físico a la
  planta". Sin filtración de datos de otro sitio/tablero detectada.
- **Todas las rutas bajo `/api/`**: todas exigen `requireProfile()` (o el secreto de cron
  con fail-closed si falta `CRON_SECRET`), salvo `/api/errores/reportar`, que
  intencionalmente acepta reportes sin sesión (comentado y justificado en el propio
  archivo) y nunca escribe nada sensible. El asistente de Estadísticas
  (`/api/estadisticas/asistente`) usa únicamente herramientas de agregación predefinidas
  (nunca SQL crudo ni acceso de escritura), gateado además por `puedeVerEstadisticas`.
- **Redirect por dispositivo/rol en `src/app/(app)/page.tsx`**: ya implementa
  correctamente el chequeo de `referer` para no atrapar en loop el link "Volver a la
  app" del Panel — exactamente el patrón correcto documentado en
  `CRITERIOS_Y_IDEAS.md`.
- **Prefijo de Storage de adjuntos de tablero** (`tablero-adjuntos/` dentro del bucket
  `informes-pdf`): las tres policies (`informes_pdf_tablero_adjuntos_select/insert/
  delete_admin`) están correctamente scopeadas por prefijo y son aditivas — no aflojan
  ni pisan las policies existentes por-uid del resto del bucket.
- **`lib/tableros/calibre-cable.ts` / `lib/tableros/unifilar.ts`**: selección de
  calibre/color por amperaje maneja config vacía y amperaje no numérico sin inventar
  valores ni crashear (devuelve `null` explícito en vez de un default falso).
- **`lib/panel/jerarquia.ts`**: funciones puras de agrupación/filtrado de la jerarquía de
  Vista General, sin bugs de agregación encontrados.
- **`lib/panel/mantenimiento-dotacion.ts` / `lib/mantenimiento/generar-programacion.ts`**:
  cuidadosos con división por cero (`pares > 0`, `horasDisponiblesPorTecnico > 0`) y con
  el patrón correcto de anclaje de fecha (`T00:00:00`) para la estimación de dotación y la
  programación automática del Plan de Mantenimiento.
- **`guardarIntervaloMantenimientoAction`** valida `dias > 0` en código antes de guardar
  `frecuencia_dias` (aunque la tabla no tiene CHECK constraint a nivel DB) — sin vía real
  de cargar un intervalo de 0/negativo que produzca división por cero aguas abajo.
- **Patrón "Server Action admin-only que necesita bypassear RLS para un rol menor"**:
  revisado en `darDeBajaAction`, `entregarLoteADepositoAction` +
  `crearEntregaDepositoLote` (devolución automática de sobrantes de Instalación) — ambos
  siguen exactamente el criterio ya documentado (valida el rol en código antes de tocar
  la base, y recién ahí decide cliente normal vs. service-role). Sin hallazgos.
- **Server Actions de Configuración** (`usuarios.ts`, `vehiculos.ts`, `empresa.ts`,
  `emails.ts`, `historial.ts`, `mantenimiento-dotacion.ts`, `recurso-altura.ts`,
  `mantenimiento-intervalos.ts`): todas gatean con `requireAdmin()` al inicio,
  consistente con sus policies de tabla (admin-only).
- **`as any` / `@ts-ignore` / `@ts-expect-error` / bloques `catch` completamente vacíos**:
  ninguna ocurrencia en todo `src/`.
- **`mantenimiento_checklist_respuestas`, `catalogo_recurso_altura_bandas`,
  `tablero_adjuntos`, `inspeccion_ia_hallazgos`**: cada una carece de policy de
  UPDATE/DELETE para su uso normal, pero se confirmó que el código nunca intenta esa
  operación desde el cliente normal (solo insert/select, o delete admin-only ya usado así
  a propósito) — no hay discrepancia entre lo que el código necesita y lo que RLS
  permite.
