# Criterios e ideas para futuras apps web

Notas de diseño/arquitectura que salieron de construir varias apps (Informes,
Via-Cash, el Sistema de emergencias de refinería) y que vale la pena reusar
en el próximo proyecto, aunque sea una app distinta. No es documentación de
ninguna app en sí (eso vive en el README de cada una) — son los **criterios
generales** detrás de las decisiones y los bugs reales, para no tener que
redescubrirlos de cero la próxima vez.

Consolidado el 2026-10-04 desde tres fuentes: esta sesión (Informes),
`via-cash/docs/11-lecciones-avisos-push.md` + `12-lecciones-generales-de-la-
sesion.md` (ya existían, escritos en otra sesión), y hallazgos sueltos
encontrados en los README de `backend-server/`, `frontend-web/` y
`DESPLIEGUE-REAL.md` del Sistema de emergencias de refinería (nunca habían
sido extraídos a un documento propio). De acá en adelante, este es el único
lugar donde se anota esto — no uno por proyecto.

## 1. Catálogos y ubicaciones

**Alta al vuelo + aprendizaje por uso.** Cuando una app necesita que el
usuario elija algo de una jerarquía (sitio, cliente, categoría...) y esa
jerarquía no está 100% cargada de antemano:
- Precargar lo que se pueda desde una fuente real (planilla, catálogo
  existente) en vez de arrancar de cero.
- Alta al vuelo con upsert idempotente: si el usuario escribe algo que no
  está, se crea ahí mismo — y si dos personas crean "lo mismo" casi en
  paralelo, el choque de unicidad (`23505` en Postgres) se resuelve
  reusando la fila que ganó la carrera, no duplicando.
- El catálogo se afina con el uso real, no con corrección manual: con GPS,
  la primera vez que alguien confirma una ubicación desde el punto exacto,
  esas coordenadas quedan guardadas para siempre. La próxima persona que
  use el mismo botón desde el mismo lugar físico cae directo en esa
  ubicación ya existente (match por cercanía, ej. <300m) en vez de elegir/
  escribir de nuevo — la app "aprende" sitio por sitio con el uso, sin
  entrenamiento ni intervención manual. Este patrón (geocodificar → buscar
  match cercano → si no hay, dejar elegir/crear → guardar el punto la
  primera vez que se confirma → nunca pisarlo después) sirve para cualquier
  app con "lugares" repetidos: sucursales, obras, clientes con dirección
  fija, etc.
- Jerarquía en pasos separados, no un solo select gigante: cada nivel
  (Provincia → Sitio → Planta → Oficina, o el equivalente del dominio) es
  su propio paso con su propio "+ Crear nuevo...", y un nivel se salta solo
  cuando tiene una única opción posible. Un combo con todas las
  combinaciones juntas se vuelve inmanejable en mobile en cuanto el
  catálogo crece.

**Catálogo completo ≠ pantalla de actividad real.** Si existe un catálogo
grande de referencia precargado para elegir/crear al trabajar, la pantalla
de navegación/resumen no tiene por qué mostrarlo completo — filtrar
server-side a "lo que ya tiene algo cargado encima" antes de mandarlo al
cliente evita una lista enorme que es puro ruido para esa pantalla en
particular.

**Una misma entidad con dos orígenes posibles (uno ya existente en el
sistema, otro en texto libre) comparte tabla y PDF, no una lógica
separada por cada uno.** Pasó con "Entregas a Depósito" (Informes):
podía ser un equipo que ya estaba cargado en un sitio, o material que
nunca se registró (cables sueltos, repuestos). En vez de dos tablas o
dos flujos paralelos, una sola tabla con una columna `origen` como
discriminante (`equipo_existente` | `material_libre`), donde las
columnas que no aplican a un origen quedan `null` — así ambos comparten
el mismo número de generación, el mismo PDF, el mismo Historial y
cualquier filtro por sitio (ej. `ubicacion_id`), sin if/else repetido en
cada pantalla que los lista. El picker/resolver de "elegí uno existente
o creá uno nuevo" que ya exista en el proyecto (en este caso el de
Ubicación, con alta al vuelo) se reusa tal cual para el origen "libre",
en vez de construir un formulario de alta paralelo.

## 2. Consultas a Supabase/Postgres

**Nunca traer una tabla completa sin paginar.** Supabase/PostgREST corta en
silencio cualquier `.select(...)` sin `.range()`/`.limit()` explícito en el
límite por defecto del proyecto (normalmente 1000 filas) — sin tirar error,
la respuesta simplemente llega incompleta. Si la tabla crece con el tiempo,
el bug no aparece el día 1 — aparece semanas/meses después, cuando se cruza
el umbral, y el síntoma ("en la lista no aparece tal cosa, aunque sé que
está cargada") es indistinguible a simple vista de un bug de UI. Criterio:
cualquier fetch de "todo el catálogo/tabla X" va en una función paginada
(loop de `.range(desde, desde+999)` hasta que devuelve menos de una página
completa), nunca en un `.select()` suelto, sin importar cuántas filas tenga
la tabla el día que se escribe el código.

**Un plan de consulta cacheado por el pooler justo después de una migración
de RLS puede dar un resultado vacío transitorio.** Si justo después de
aplicar una política de RLS nueva una conexión pooleada (ej. PgBouncer de
Supabase) devuelve vacío una vez y, un segundo después, con la misma
sesión, da el resultado correcto — no es un bug de la política, es un plan
viejo cacheado antes de la migración. No hace falta agregar reintentos a
la app por esto si la pantalla ya se refresca sola en algún momento
razonable (foco, poll, etc.); alcanza con saberlo para no perder tiempo
buscando un bug que no está en la política.

## 3. RLS (seguridad por fila)

**Toda tabla con `.update()` desde el cliente necesita su policy de UPDATE
explícita.** Si una tabla tiene policy de SELECT e INSERT pero no de
UPDATE, un `.update(...)` no tira error — simplemente afecta 0 filas, en
silencio. Puede pasar desapercibido durante meses si nada en la UI compara
"¿se guardó lo que pedí guardar?". Checklist para cualquier tabla nueva:
SELECT, INSERT, UPDATE y DELETE (los que apliquen) definidos desde el
principio.

**`upsert()` necesita policy de SELECT, aunque el diseño diga que nunca se
lee esa tabla desde el cliente.** Un `upsert(..., { onConflict: "x" })` se
traduce a `INSERT ... ON CONFLICT DO UPDATE`, y Postgres con RLS activado
exige permiso de SELECT para poder resolver esa cláusula — **incluso
cuando en los hechos termina siendo un INSERT puro, sin ningún conflicto
real**. El síntoma es un 403 "new row violates row-level security policy"
que no tiene nada que ver, a primera vista, con un permiso de lectura. Si
el cliente va a escribir una tabla con `upsert()` (no `insert()` puro),
siempre necesita una policy de SELECT que al menos deje ver la fila propia.

**Dos políticas que se consultan entre sí pueden causar recursión
infinita.** Si la policy de la tabla A hace una subquery contra la tabla B,
y la policy de B a su vez consulta A, Postgres tira "infinite recursion
detected in policy for relation X". El arreglo es una función `STABLE
SECURITY DEFINER` que encapsule la consulta cruzada — su query interna
corre con el privilegio del dueño de la función, así que no vuelve a
evaluar el RLS de la tabla que consulta, rompiendo el ciclo. Antes de
agregar una policy nueva que lea otra tabla, revisar si esa otra tabla ya
tiene una policy que lee la primera.

**Un "alcance" dentro de un rol (ej. un admin que solo debería ver un sitio
de varios) es una restricción de PRODUCTO, no de RLS — RLS típicamente solo
aísla por organización/tenant, no por el alcance más fino dentro de ella.**
No alcanza con que la pantalla filtre qué mostrar: si la URL/el id se puede
tipear directo, hay que chequear el alcance en el código de la aplicación
ANTES de cargar cualquier dato, y ante un error de esa verificación en sí,
**nunca autorizar por default** (fail closed). Conviene probarlo
explícitamente: confirmar con un usuario de alcance angosto que RLS sola
deja leer un registro fuera de su alcance (si lo deja, el gate de
aplicación es la única protección real, no un refuerzo redundante).

**Cuando un rol nuevo necesita escribir una tabla cuyo UPDATE es
admin-only por RLS, no aflojar la policy — mover la decisión de rol al
código y escribir con el cliente de service-role.** Pasó en Informes con
"dar de baja equipamiento": `rack_equipamientos`/`equipos` tenían UPDATE
`is_admin()`-only (a propósito, para que un técnico no edite equipamiento
que cargó otro) y la feature nueva necesitaba que Supervisor también
pudiera. Ensanchar la policy a `is_admin_or_supervisor()` hubiera abierto
esas tablas a CUALQUIER update de un Supervisor, no solo al de esta
acción puntual. En vez de eso: la Server Action valida el rol explícitamente
al principio (antes de tocar la base), y de ahí en más usa el cliente de
service-role (bypassea RLS) solo para ese flujo — la restricción de "quién
puede" queda en el código de la acción, no en la tabla. Mismo criterio que
el ítem de "alcance dentro de un rol" de más arriba: la policy de la tabla
sigue siendo la barrera general (admin-only para ediciones libres), y el
gate de aplicación es la excepción puntual y auditada para una acción
específica — no al revés.

**Diagnosticar RLS con los logs reales y reproduciendo la consulta exacta —
nunca a ciegas.** `edge_logs`/API logs (qué pedido llegó, con qué código) y
los logs de Postgres (el error real, a veces con el SQL completo) resuelven
en minutos lo que probar-y-repetir a ciegas no resuelve en horas. Para
confirmar o descartar una teoría de permisos en segundos, reproducir la
consulta exacta simulando el usuario real:
```sql
begin;
set local role authenticated;
set local request.jwt.claims to '{"sub":"<uuid-real>","role":"authenticated"}';
-- la consulta exacta que falla
rollback;
```

## 4. Arquitectura cliente/servidor y secretos

**Dos apps que se avisan entre sí: secreto compartido, nunca en el
cliente.** Si la app A necesita avisarle a la app B que pasó algo, el
patrón es: el SERVIDOR de A llama a un endpoint interno del SERVIDOR de B,
con un secreto compartido en un header (nunca con un prefijo tipo
`NEXT_PUBLIC_`, nunca construido con datos que vengan del navegador). El
endpoint que recibe valida el secreto antes de hacer nada, y el mensaje que
manda lo construye el servidor que llama a partir de datos que él mismo
consultó con la sesión real del usuario — nunca texto libre mandado desde
el cliente. Así, aunque el secreto se filtre alguna vez, lo peor que se
puede lograr es un aviso de un evento real, nunca contenido arbitrario.

**Convertir una acción "directa al backend-as-a-service" en Server Action
en el momento en que necesita un secreto de servidor.** Es válido que
varias acciones del cliente llamen a Supabase/Firebase directo desde el
navegador (sin pasar por el servidor de la app), a propósito, para andar
rápido o sin señal. Pero en el momento en que una de esas acciones necesita
algo que requiere un secreto (avisar a otra app, firmar algo, llamar una
API de terceros), hay que convertirla en Server Action — corre en el
servidor, usa la sesión real del usuario sin tener que pasarla a mano, y
ahí sí puede tocar secretos que el navegador nunca ve.

**Alta de cuenta en dos sistemas (auth + tabla de negocio), sin rollback,
deja basura si falla el segundo paso.** Un flujo que primero crea la cuenta
en el proveedor de auth y recién después inserta la fila de negocio (con
alguna columna única, ej. el mail) deja una cuenta de auth huérfana si el
segundo paso falla — no se borra sola, y un reintento con el mismo dato
puede volver a chocar. Cualquier alta en dos pasos separados necesita
deshacer explícitamente el primero si el segundo falla.

**Una fila "de dispositivo" cuyo dueño lógico puede cambiar (ej. un celular
compartido entre dos personas) necesita una función de "liberar", no solo
RLS directa.** Un `upsert` con policy "cada uno actualiza lo suyo"
(`usuario_id = auth.uid()`) se traba si la fila ya pertenece a otra
persona — la policy bloquea al nuevo dueño legítimo. Hace falta una
función intermedia (`security definer`) que libere explícitamente la fila
del dueño anterior antes de que el nuevo la reclame.

**Job programado en Vercel sin infraestructura nueva: `vercel.json` +
una ruta API protegida por secreto, nunca sin protección.** Para una
tarea en background que tiene que correr sola (liberar storage viejo,
mandar un resumen, lo que sea) en una app ya desplegada en Vercel, no
hace falta sumar un worker/cola aparte: un `vercel.json` con `crons`
apuntando a una ruta `GET` alcanza. Esa ruta **tiene que fallar cerrado**
si falta el secreto (`CRON_SECRET` sin configurar → 500, nunca "corro
igual sin chequear") y comparar el header `Authorization: Bearer
<secreto>` que Vercel manda solo automáticamente — nunca conformarse con
"nadie va a adivinar la URL".

**Un job que borra algo "viejo" para liberar espacio: nunca borrar sin
confirmar el backup primero, y entender qué es lo que realmente se
ahorra.** Patrón de dos pasos, en ese orden exacto: 1) copiar el archivo a
donde sea que viva el backup, 2) recién si esa copia devuelve éxito,
borrar el original — si la copia falla, el original queda intacto, nunca
"borro y después me fijo". Ojo con un error de diseño fácil de cometer acá:
mover un archivo a OTRO bucket/carpeta **dentro del mismo proveedor y
proyecto** no reduce el costo de storage si ese proveedor cobra por bytes
totales del proyecto (es el caso de Supabase Storage) — da una separación
prolija entre "activo" y "archivo" y un lugar seguro para recuperar algo,
pero no es un ahorro real de plata; eso solo se logra sacando el dato del
proveedor (otro proveedor externo, más barato para guardar en frío). Si el
objetivo real es bajar el costo, no solo "ordenar", hay que decirlo
explícito antes de elegir dónde va el backup.

## 5. Un módulo genérico con IA, en vez de uno por tipo

Cuando el usuario necesita relevar/registrar cosas de **distintos tipos**
que comparten la forma de uso (se fotografían, se ubican, se describen)
pero difieren en "qué son": no conviene un módulo nuevo por tipo si la
única diferencia real es la categoría. Mejor un solo flujo que saca fotos y
una IA de visión identifica categoría/marca/modelo — agregar un tipo nuevo
después es ampliar un enum, no crear tabla+migración+formulario nuevos.
Reservar un módulo propio solo cuando la entidad es realmente un
**contenedor** con estructura interna distinta (ej. un tablero con sus
circuitos) — ahí sí se justifica.

**Una IA que identifica un objeto real por foto puede, en el mismo
pedido, estimar algo que no se ve en la imagen (consumo típico, vida
útil, lo que sea) — pero hay que separarle explícitamente en el prompt
cuál es cuál fuente.** Si se le pide "identificá marca/modelo" y
"estimá el consumo" en el mismo turno sin aclarar la diferencia, el
modelo puede mezclar "lo que veo en la foto" con "lo que sé en general de
ese producto" y perder el criterio de cuándo decir que no sabe. Separarlo
en el prompt ("el campo X viene de lo que ves en la imagen; el campo Y es
tu estimación por conocimiento general del producto, no de la foto, devolvé
null si el modelo no te resulta familiar") deja al modelo dar una
estimación razonable sin inventar specs de un equipo que no reconoce.
Para lo que ya estaba cargado antes de agregar un campo así (o donde no
se pudo estimar en el momento), conviene un backfill aparte — un pedido de
texto (sin fotos, más barato) sobre lo que falta, disparado a demanda, no
automático en cada carga de página.

**Un solo número para "consumo/capacidad/rendimiento estimado" de un
equipo casi siempre esconde una ambigüedad entre dos magnitudes
distintas — pedir SIEMPRE un par (típico/promedio y pico/máximo), nunca
uno solo.** Pasó en la práctica, no es hipotético: pedirle a una IA "el
consumo estimado en Watts" de una notebook con marca/modelo identificado
devolvió 65W — que resultó ser el vatiaje de la FUENTE/CARGADOR (lo
máximo que esa fuente puede entregar), no lo que la notebook consume la
mayoría del tiempo en uso normal (mucho menos). La confusión es casi
inevitable con un solo campo, porque la especificación más fácil de
encontrar de un equipo (la de su fuente/placa/nameplate) es casi siempre
un límite/capacidad, no un consumo típico real. El prompt tiene que
pedir los dos valores por separado y explicarle la diferencia
("promedio = consumo real típico, nunca el vatiaje nominal de la fuente
si es mayor; máximo = el pico bajo la carga más alta posible, que sí
puede acercarse al vatiaje de la fuente pero no es automáticamente el
mismo número — max siempre >= promedio"). Esto generaliza más allá de
consumo eléctrico: cualquier "estimá X" sobre un producto real tiene
casi siempre una lectura de nameplate/spec-sheet (un límite o capacidad)
y una lectura de uso real (lo que pasa la mayoría del tiempo) — nombrar
ambas explícitamente en el prompt evita que el modelo devuelva la
primera que encuentra pensando que responde la pregunta.

## 6. Avisos push (web)

**No usar Firebase Cloud Messaging para push web — ir directo al estándar
Web Push (RFC 8030) con VAPID + la librería `web-push` del lado del
servidor.** FCM es Web Push por debajo con una capa propietaria arriba que
agrega puntos de falla (fallas intermitentes e indocumentadas de "Firebase
Installations", `AbortError: Registration failed`) sin agregar nada que el
estándar no tenga ya. Las claves VAPID se generan al instante sin cuenta en
ningún lado: `npx web-push generate-vapid-keys` — guardarlas una sola vez,
son para siempre.

**Si un SDK se carga por CDN en el service worker, su versión tiene que
sincronizarse a mano con la del `package.json`** — dos versiones distintas
del mismo SDK (una vía npm en la página, otra vía `importScripts` en el
SW) pueden abrir un storage local con un esquema distinto entre sí y tirar
errores de versión.

**Cambiar de proveedor de push o de clave VAPID puede dejar una
suscripción vieja pegada en el navegador** — el navegador no permite crear
una suscripción nueva con una clave distinta mientras la vieja siga activa.
Antes de reutilizar una suscripción existente, comparar su
`applicationServerKey` contra la clave VAPID actual; si no coincide, hacer
`unsubscribe()` antes de suscribirse de nuevo.

**La clave pública del par VAPID va en las dos puntas (la que manda y la
que recibe), aunque solo una tenga también la privada.** Es fácil pensar
"allá no hace falta" y olvidarse — el síntoma es silencioso: "no pasa nada,
pero tampoco tira error" (si el código está diseñado para no bloquear la
acción real cuando el push no está configurado). La privada (y cualquier
secreto) nunca toca el navegador — solo la pública lleva el prefijo que la
expone al cliente.

**Antes de sospechar de la infraestructura, confirmar que la acción
probada está realmente conectada a un aviso**, y que el orden de los
hechos tiene sentido (activar los avisos tiene que pasar ANTES del evento
que se quiere que avise — una suscripción no puede recibir algo que pasó
antes de que existiera). Un script chico que manda un push de prueba
directo a una suscripción ya guardada (sin pasar por ninguna lógica de
negocio) separa en un solo paso "¿falla el envío en sí?" de "¿falla el
código que decide cuándo llamar al envío?".

## 7. PWA / Service workers

- El service worker nunca debe cachear cualquier respuesta del mismo
  origen — solo el cascarón fijo (rutas iguales para cualquiera, tipo `/`
  o `/login`), nunca páginas con datos por-usuario. En un dispositivo
  compartido entre varias personas, cachear de más filtra los datos de la
  persona anterior a la siguiente.
- Un deploy nuevo no llega a una pestaña ya abierta hasta un reload manual
  — `self.skipWaiting()` + `self.clients.claim()` hacen que el service
  worker en sí tome control rápido, pero no resuelven esto: es sobre el JS
  de la página, no sobre el SW.

## 8. Proceso de debugging general

- **Un comentario que describe una intención no significa que esté
  implementada.** Un campo/columna puede tener un comentario correcto
  sobre para qué sirve (ej. "para que una unidad en el taller no se
  ofrezca al abrir un viaje nuevo") sin que nadie haya conectado eso con el
  código que en verdad arma esa lista. Si algo suena a que debería
  filtrar/bloquear otra parte del sistema, buscar explícitamente si ese
  filtro existe de verdad, en vez de asumir que porque el campo existe, se
  usa.
- **Verificar el comportamiento asumido de un sistema de terceros con una
  prueba mínima aislada, antes de construir toda una arquitectura
  encima.** Ej.: la sustitución de plantillas `%u` en ACLs de un broker
  MQTT estaba documentada, pero en la práctica no se aplicaba en la
  versión real del broker — se descubrió recién al testear una ACL de
  prueba aislada, no al construir el flujo completo de provisioning.
- **Un elemento con foco no siempre significa "trabajo a medio
  terminar".** Si una acción automática (ej. un auto-refresh) se salta
  cuando hay un elemento enfocado para no pisarle algo al usuario, filtrar
  explícitamente por lo que de verdad puede tener texto a medio escribir
  (`textarea`, `input` de texto/número/fecha) — nunca por "cualquier
  elemento enfocable", porque un `<select>` se elige al instante y no hay
  nada que proteger ahí; bloquear por eso puede dejar una pantalla sin
  refrescar para siempre.
- **Colisión de CSS global: la misma clase declarada dos veces con
  significados opuestos en dos archivos distintos gana en silencio según
  el orden de import en el bundle.** Si se va a reusar una clase que ya
  existe (ej. `.status-pill.vencido`) conviene confirmar que su significado
  es el mismo en todos los contextos donde ya se usa, no asumirlo. El
  arreglo es escopear la regla más específica (ej. `.code-row
  .status-pill.vencido`) en vez de depender del orden de los `<link>`/
  imports.
- **Cuando se agrega un barrido periódico para un campo con vencimiento,
  revisar si hay OTROS campos similares que necesitan el mismo barrido.**
  Un enum puede tener un estado "vencido" pensado desde el esquema, pero
  sin nada que lo aplique si nunca se armó el barrido — mientras que un
  campo parecido en otra tabla sí lo tiene. No asumir que porque un barrido
  existe para un caso, cubre todos los casos parecidos.
- **Diagnosticar con los logs reales de la base/API, nunca a ciegas** (ver
  también la sección de RLS arriba) — vale para cualquier bug de permisos
  o de datos, no solo RLS.

## 9. Despliegue

- **Cambiar una variable de entorno en Vercel no redespliega solo** — hay
  que ir a Deployments, elegir el último, y tocar Redeploy a mano. Vale la
  pena chequear esto primero, siempre, antes de sospechar del código.
- **Un dominio de Vercel puede quedar "pisado" en un deploy viejo, sin que
  ningún redeploy nuevo lo note.** Si el deploy individual funciona (botón
  "Visit" desde el detalle del deploy) pero el dominio compartido
  (`proyecto.vercel.app` o un dominio propio) sigue sirviendo el error
  viejo pase lo que pase — no es caché ni variables, es que el dominio
  está fijado a mano a un deploy específico (por un rollback anterior o
  una asignación manual en Settings → Domains). La solución es "Promote to
  Production" sobre el deploy que sí funciona, o reasignar el dominio ahí
  — no seguir redeployando en bucle.
- **En la nube, suele haber DOS capas de firewall independientes — un
  puerto cerrado en cualquiera de las dos bloquea todo.** Ej. Oracle
  Cloud: el Security List de la VCN/subnet (nivel nube) Y `iptables`
  local dentro de la VM (las imágenes Ubuntu de Oracle traen por defecto
  una regla que solo deja pasar el puerto 22 y rechaza el resto). Hay que
  verificar y abrir el puerto en las dos capas, nunca asumir que una
  alcanza.
- **Las formas de cómputo "ARM" promocionadas en un free tier pueden dar
  error de capacidad insuficiente en la práctica** — es un problema
  conocido y común, no algo mal configurado. Tener de entrada una forma
  alternativa (ej. AMD, generación anterior) como plan B evita perder
  tiempo reintentando la misma.
- **La primera vez que algo pasa de un sandbox a un servidor real
  alcanzable desde internet, vale la pena escribir un runbook concreto con
  lo que rompió y cómo se arregló**, en el orden en que apareció — no una
  guía genérica del proveedor, sino la lista específica de esta vez, para
  no volver a perder el tiempo con los mismos problemas la próxima.
