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

**Una tabla de catálogo nueva necesita su propia columna `id` (uuid) como
PK aunque tenga una clave natural obvia (un enum, un código) — no uses la
clave natural como PK directa si en el proyecto hay algún helper genérico
que asuma `id` en toda tabla.** Pasó en Informes: se creó
`torre_tipo_largos` con `tipo_torre` (un enum de 4 valores) como primary
key directa — parecía más simple, sin un `id` "de más". Rompió
`tsc` en un helper totalmente aparte
(`lib/admin/eliminar-registro.ts`, que borra cualquier fila por `id` para
limpiar datos de prueba) porque ese helper tipa `tabla: keyof
Database["Tables"]` y asume que **todas** las tablas tienen `id` — al
faltarle a una, TypeScript angosta el tipo del argumento de `.eq()` a
`never` para la unión completa. La corrección fue agregar `id uuid
primary key default gen_random_uuid()` + `unique(tipo_torre)`, igual
patrón que ya usaba `mantenimiento_intervalos` (`id` + `unique
(tipo_equipo, categoria)`) — que resultó ser la convención real del
proyecto, no cada tabla improvisando su propia PK. Antes de diseñarle una
PK natural a una tabla nueva, revisar qué convención ya siguen las tablas
similares (¿tienen `id` + `unique` en la clave natural, o la clave natural
es la PK?) y copiarla, en vez de optimizar por "menos una columna".

**Si `apply_migration`/`execute_sql` de las herramientas de Supabase se
cuelgan (timeout) específicamente en un `DROP TABLE`, mientras que
`CREATE TABLE`/`ALTER TABLE` en el mismo momento andan bien — no es un
lock real, probablemente es la herramienta.** Pasó en Informes: un `DROP
TABLE` se colgó 3 veces seguidas (con una tabla real y con una de prueba
creada al toque para descartar que fuera algo propio de esa tabla en
particular), mientras que crear la tabla de prueba y aplicar el resto de
la migración (ALTER + CREATE TABLE + policies) anduvo normal. Antes de
asumir "hay un lock" — confirmarlo de verdad con
`select * from pg_locks where relation = 'public.mi_tabla'::regclass;` y
`pg_stat_activity` (queries activas, no solo "idle") — si ninguna de las
dos muestra nada bloqueando, es la herramienta, no la base. Salida
pragmática: sacar el `DROP TABLE` de la migración, dejar la tabla
huérfana (documentada en un comentario, sin RLS floja ni datos reales) y
resolver el drop más tarde a mano o cuando la herramienta ande — no vale
la pena perder más de 2-3 reintentos en un DDL que ya se demostró
reproducible.

## 3. RLS (seguridad por fila)

**Toda tabla con `.update()` desde el cliente necesita su policy de UPDATE
explícita.** Si una tabla tiene policy de SELECT e INSERT pero no de
UPDATE, un `.update(...)` no tira error — simplemente afecta 0 filas, en
silencio. Puede pasar desapercibido durante meses si nada en la UI compara
"¿se guardó lo que pedí guardar?". Checklist para cualquier tabla nueva:
SELECT, INSERT, UPDATE y DELETE (los que apliquen) definidos desde el
principio.

**Este bug exacto (falta la policy de UPDATE en una tabla de
"relevamiento") ya se había encontrado y arreglado una vez en este mismo
proyecto — y volvió a aparecer en un módulo nuevo por copiar la migración
de CREACIÓN original de otro módulo en vez de revisar el esquema vivo.**
Pasó con "Torres de Comunicaciones" (Informes): se construyó mirando
Racks, pero copiando el `create table rack_relevamientos` + sus policies
tal como estaban en la migración original de Racks — que en su momento
SÍ tenía este mismo bug, arreglado después en una migración de fix
aparte (`..._fix_relevamiento_update_rls.sql`) que agregó la policy de
UPDATE faltante a Tableros/Racks/Equipos. Esa migración de fix nunca se
leyó al mirar "cómo está armado Racks", así que el módulo nuevo heredó el
bug ya resuelto en el que se estaba inspirando. Síntoma real: el técnico
cargó un relevamiento, el PDF y las fotos SÍ se subieron a Storage, pero
la fila de la base nunca se enteró (UPDATE con 0 filas afectadas, sin
error) — en el historial quedó como "Solo registro", sin poder ver ni
PDF ni fotos, y hubo que recuperarlo con el mismo backfill manual que la
vez anterior. Regla general: al construir un módulo nuevo mirando uno
existente como referencia, no alcanza con leer SU MIGRACIÓN DE CREACIÓN
— hay que revisar TODAS las migraciones posteriores que lo tocaron (o,
más simple, listar el esquema/policies vivos de la tabla de referencia
vía la herramienta de Supabase) para no reintroducir un bug que ya se
había pagado una vez.

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

El mismo criterio generaliza a un caso más sutil: cuando una acción de
menor privilegio dispara, como EFECTO SECUNDARIO automático, la misma
escritura que ya existe como una acción pública gateada a un rol mayor.
Pasó en Informes con "Instalación" (abierta a cualquier técnico) cuyo
sobrante de un remito genera sola una fila en `entregas_deposito` (tabla
admin/supervisor-only por RLS, con su propia Server Action pública
gateada a ese rol). La solución NO es llamar a la Server Action pública
desde adentro (heredaría su gate y rechazaría al técnico) ni aflojar la
policy de la tabla — es extraer la lógica de "crear la fila(s) + el PDF"
a una función de librería compartida que recibe el cliente de Supabase
como parámetro (normal o service-role, a elección de quien la llama), y
que cada chamada decida: la acción pública la llama con el cliente normal
(ya validó el rol mayor antes), el efecto secundario la llama con
service-role (validó en código que esto es un efecto secundario legítimo
de una acción de menor privilegio, no un acceso directo a la tabla). Así
no se duplica el render del PDF ni el manejo de colisión del número de
generación, y cada camino de entrada mantiene su propio control de
acceso sin heredar el del otro.

**Un mismo bucket de Storage se puede compartir entre features sin
mezclar sus permisos, si cada una vive bajo su propio prefijo de
carpeta literal y sus policies lo exigen explícitamente.** Pasó en
Informes: ya existía un bucket privado (`informes-pdf`) usado por
"Nueva Medición" de tableros, con policies que exigen que el primer
segmento del path sea el `auth.uid()` de quien sube. Una feature nueva
("adjuntar un archivo suelto a un tablero", abierta a cualquier técnico
logueado, no solo al dueño) reusó el MISMO bucket pero bajo un prefijo
distinto (`tablero-adjuntos/...`), con policies propias y ADITIVAS que
chequean `(storage.foldername(name))[1] = 'tablero-adjuntos'` — nunca
tocó ni aflojó las policies existentes del otro prefijo. Como las
policies permisivas de Postgres se combinan con OR, esto es seguro por
diseño: ningún técnico gana acceso a la carpeta por-uid de otro, cada
prefijo tiene su propia regla de quién lee/escribe/borra. Generaliza a
cualquier caso de "necesito otro patrón de acceso en el mismo bucket
ya existente": no crear un bucket nuevo (fragmenta configuración) ni
ensanchar las policies existentes — un prefijo de carpeta propio +
policies propias alcanza.

**Un redirect automático por dispositivo/rol puede trabarse con la
propia navegación interna de la app — revisar ese caso ANTES de
shippear, no esperar a que el usuario lo encuentre.** Pasó en Informes:
se agregó un redirect en `/` que manda a Admin/Supervisor en desktop
directo a `/panel` (y deja el celular entrar normal). El bug (detectado
antes de pushear, no reportado por el usuario) es que el propio link
"Volver a la app" del panel apunta a `/`, así que ese mismo redirect lo
rebotaba de inmediato de vuelta a `/panel` — el link quedaba inservible
para ese rol en desktop. El arreglo es chequear el header `referer`: si
viene de dentro de la misma app (`referer.includes("/panel")`), respetar
la navegación explícita del usuario y NO re-redirigir. Regla general:
cualquier redirect automático en una ruta de entrada/landing tiene que
probarse contra los propios links internos de la app que apuntan ahí —
si alguno existe, hace falta una señal (referer, query param, lo que
sea) que distinga "llegué acá por default" de "elegí volver acá a
propósito".

**Antes de asumir que un visor con datos "en vivo" necesita pasar a
estático por riesgo de desactualización (o viceversa), revisar los
caminos de escritura reales de esa tabla — la respuesta suele ser que
da lo mismo.** Surgió en Informes con el plano unifilar público
(se redibuja en vivo desde `tablero_circuitos` en cada vista del QR,
a propósito, para no quedar desactualizado). La pregunta era si
convenía pasar a un PDF pre-generado que se regenere en cada edición.
Revisando las policies, la tabla no tiene UPDATE directo habilitado —
la ÚNICA forma de tocar un circuito es a través del flujo que YA
regenera el archivo estático (DXF) en ese mismo momento. Conclusión:
si no hay una vía de escritura por fuera del único flujo controlado,
un archivo pre-generado y un render en vivo quedan igual de
actualizados en la práctica — la decisión entre los dos pasa a ser de
simplicidad/mantenimiento, no de riesgo de staleness. Antes de elegir
entre "vivo" y "estático" por miedo a que quede viejo, listar
explícitamente TODOS los caminos de escritura de la tabla fuente (no
asumir que existen más de los que en verdad hay).

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

**"Identificar un objeto físico en una foto" y "transcribir una lista/tabla
de un documento en papel" son dos prompts distintos — no reusar el mismo
para los dos.** Pasó en Informes con el módulo "Instalación": además de
fotos de los equipos instalados (igual prompt que ya existía, "¿qué es
esto que veo?"), el usuario quería leer el remito en papel que entrega
depósito (a veces manuscrito) para sacar una lista de materiales y
cantidades esperadas. Usar el prompt de "identificar equipamiento" para
eso da resultados raros — el modelo intenta clasificar el PAPEL como si
fuera un objeto, en vez de leer su contenido como texto. El prompt para
un documento tiene que decirlo explícito ("no estás identificando un
objeto físico, estás transcribiendo una lista/tabla"), pedir los campos
tal cual se leen (nunca reinterpretar o resumir), y devolver null/omitir
una línea que no se entienda en vez de inventarla — mismo criterio de "no
inventar" que el resto de los prompts de esta app, aplicado a texto en
vez de a identificación visual.

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

**Para estimar una magnitud física que no se puede medir directo de una
sola foto (altura, distancia, lo que sea) — buscar una unidad discreta y
estandarizada que se pueda CONTAR en la imagen, y multiplicarla por un
valor real configurado, en vez de pedirle a la IA que "calcule" la
magnitud por fotogrametría o por su conocimiento general del valor
estándar.** Surgió con la altura de una torre de comunicaciones: una sola
foto sacada desde abajo no alcanza para fotogrametría real (no hay
referencia de escala ni distancia conocida), así que inventar un número
"calculado" ahí sería tan poco confiable como preguntarle el clima. Pero
las torres se arman en TRAMOS modulares de largo estándar — eso sí es
contable en una foto (una unión/brida visible entre secciones), así que
el patrón queda: la IA clasifica el tipo de objeto y CUENTA unidades
discretas visibles (marcando explícitamente si no está segura de haber
visto el conjunto completo, igual criterio que "identificado" en el resto
de la app) — el LARGO REAL de cada unidad sale de un catálogo chico
configurado a mano (Configuración), nunca del "conocimiento general" de
la IA sobre cuánto mide un tramo estándar (varía por fabricante/modelo,
e inventarlo es la misma clase de error que preguntarle el clima en vez
de usar una API real). Generaliza a cualquier "¿cuánto mide/pesa/vale X
en total?" que se pueda descomponer en unidades contables × un valor
real: preferir siempre esa descomposición antes que pedirle a una IA que
estime la magnitud total de una.

**Un `max_tokens` bajo en un pedido de IA que devuelve una LISTA (no un
campo fijo) corta la respuesta a mitad del JSON sin ningún error de la
API — y el síntoma en el cliente es indistinguible de "la IA no
encontró nada".** Pasó en Informes: dos endpoints casi idénticos
(`tableros/leer-foto` y `racks/leer-foto`), ambos migrados al mismo
modelo, quedaron con límites distintos (`max_tokens: 8192`/`effort:
"medium"` en tableros vs. `16000`/`"high"` en racks) porque se copiaron
en momentos distintos sin unificar el criterio. Un tablero grande (20-30+
circuitos, cada uno con una descripción larga) genera una respuesta más
extensa que un rack típico, así que tableros rompía: el modelo se queda
sin tokens, el texto llega cortado (ej. `{"circuitos":[{"numero":1,...`
sin cerrar nunca el array/objeto), el `JSON.parse` tira excepción, y el
endpoint devuelve "no se pudo leer" — un usuario reporta esto como "la
IA no trae ninguna información", no como un error de truncamiento, y es
indistinguible a simple vista de un problema de prompt o de visión. Se
detectó leyendo `client_errores` (la tabla de diagnóstico que cada
endpoint de lectura de fotos ya escribe en el `catch` del `JSON.parse`)
y confirmando que el texto guardado arrancaba bien formado pero nunca
cerraba. Regla general: cualquier endpoint de IA que devuelve una lista
de longitud variable (no se sabe de antemano cuántos ítems va a haber)
necesita un `max_tokens` generoso (igualar al endpoint hermano más
permisivo del mismo patrón, no el mínimo que "andaba" en las pruebas
chicas) — y cuando se agregan endpoints "iguales" para distintas
entidades del mismo módulo (ver más abajo), hay que mantener sus límites
de tokens/effort sincronizados a propósito, no dejar que diverjan por
copy-paste en momentos distintos.

**Antes de armar un módulo nuevo para un pedido que "suena" distinto, revisar
si ya existe uno con el mismo patrón de uso — puede que solo le falte una
forma más de conseguir el ítem.** Pasó en Informes: el pedido era un
"informe de instalación" (fotos + IA + lista con número de serie, para
dejar constancia de qué se instaló) — sonaba a un módulo nuevo, paralelo a
"Entregas a Depósito". Pero el módulo "Equipos Individuales" YA tenía
exactamente ese patrón (fotos + IA + lista + alta de equipo en un sitio);
lo único que faltaba era una tercera forma de poblar un ítem de la lista
—además de "nuevo" y "ya existente en este sitio"— que fuera "viene de
depósito de cualquier sitio", y que al guardar, en vez de crear una fila
nueva, reactive (estado) y reubique (ubicación) la fila que ya existía.
Construir el módulo paralelo hubiera duplicado la UI de fotos/IA/lista, el
PDF y el Historial enteros para ganar solamente ese tercer origen. La
pregunta a hacerse antes de diseñar un módulo nuevo: "¿el pedido es
realmente una entidad distinta, o es el mismo patrón de carga con una
fuente más para el ítem?" — si es lo segundo, extender el picker/origen
del módulo existente es mucho más barato que levantar uno en paralelo.

**Cuando la entidad nueva SÍ es un contenedor con estructura interna
propia, el módulo aparte es la decisión correcta — pero si el nombre
natural de esa entidad ya significa otra cosa en la app, hay que
desambiguarlo en el código, no solo confiar en el contexto.** Pasó en
Informes con "Torres de Comunicaciones" (antenas/radioenlaces montados en
una torre física): el patrón correcto era un módulo propio mirando
Racks (alta de la torre + equipamiento + relevamiento por visita, mismo
criterio que la sección de arriba sobre contenedores con estructura
propia). Pero la app ya usaba la palabra "torre" para un concepto
completamente distinto y preexistente (la cuadrilla/turno de un técnico
— `profiles.torre`, `catalogo_torres`, usado en Informe Técnico y
Rendición de Gastos). Nombrar la tabla/tipo nuevo simplemente `torres`
hubiera sido ambiguo para cualquiera que lea el código después (¿cuál
"torre" es esta?) aunque en la UI el usuario nunca se confunda por el
contexto. Se resolvió calificando el nombre en TODO el código del
concepto nuevo (tablas `torres_comunicacion`/
`torre_comunicacion_equipamientos`/etc., tipo
`TorreComunicacionCategoriaEquipo`, ruta `/torres-comunicacion/...`) en
vez de dejar que conviviera un `torres` ambiguo con el `catalogo_torres`
ya existente. Regla general: antes de nombrar una entidad nueva, buscar
si la palabra obvia ya está tomada en el dominio de la app (grep del
término) — si lo está para un concepto no relacionado, calificar el
nombre nuevo explícitamente desde la primera migración, aunque quede un
poco más largo; es mucho más barato que renombrar después de que el
nombre ambiguo se haya esparcido por tablas, tipos y rutas.

**Seguimiento real del ítem de arriba, misma sesión:** el "módulo nuevo"
que se armó esa vez (un standalone "Instalación", con remito + devolución
automática — ver más abajo la sección de IA leyendo documentos) resultó
ser TAMBIÉN una duplicación, una vez que el usuario lo probó de verdad:
"Informe Técnico" ya era el lugar donde se documentaba cualquier visita
de trabajo (técnicos, vehículos, fotos), e Instalación terminó siendo un
segundo formulario para la MISMA visita. La corrección fue la misma
lógica que el ítem de arriba, aplicada un nivel más arriba: en vez de un
módulo aparte, una sección opcional ("+ Agregar materiales/equipos")
DENTRO de Informe Técnico — reusando los mismos componentes de fotos+IA
+ remito que ya se habían escrito, solo cambiando dónde viven. Lección
más general: la pregunta "¿esto es una entidad distinta o el mismo
patrón con una fuente más?" no se responde una sola vez al diseñar — el
uso real (no la intuición de diseño) es la prueba final, y vale la pena
quedarse abierto a que la respuesta cambie apenas alguien lo prueba con
un caso real, aunque eso signifique deshacer una decisión de hace pocas
horas. Construir el módulo paralelo la primera vez no fue un error en
sí — era la mejor decisión con la información de ese momento — pero
tampoco hay que aferrarse a ella cuando el uso real dice otra cosa.

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

- **Antes de escribir un archivo nuevo con un nombre "obvio" (el que
  cualquiera elegiría para esa feature), revisar si ya existe uno con esa
  ruta exacta — y si existe, LEERLO antes de escribir, nunca asumir que
  está vacío o que es el que uno se imagina.** Pasó en Informes: al armar
  un Plan de Mantenimiento nuevo (cross-módulo, para Racks/Equipos), se
  escribió un archivo de acciones en
  `configuracion/actions/mantenimiento.ts` sin revisar antes — ese
  nombre YA estaba tomado por una feature completamente distinta y sin
  relación ("vaciar datos de prueba", pensada como limpieza general de la
  app antes de ir a producción), que quedó parcialmente borrada en el
  momento. El error se notó recién por el `tsc` tirando un import roto en
  otro componente — de no haber corrido el type-check, el archivo viejo
  habría quedado perdido en silencio. Se corrigió restaurando el original
  con `git checkout` y moviendo las funciones nuevas a un archivo con
  nombre más específico (`mantenimiento-intervalos.ts`) en vez de
  pelearse por el nombre genérico. Lección: "mantenimiento" (como antes
  "torre") es una palabra que esta app ya usa para dos conceptos sin
  relación — la regla general sigue siendo la misma que para nombrar una
  tabla nueva (ver sección de Torres de Comunicaciones): antes de
  escribir, listar el directorio/grepear el nombre candidato, y si ya
  existe algo con ese nombre, LEERLO primero (la herramienta de escritura
  puede no avisar si el archivo ya estaba trackeado por git y el diff
  parcialmente se superpone).
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
- **"Redeploy" sobre una fila VIEJA de la lista de Deployments de Vercel
  reconstruye ESE commit puntual, no la punta real de la rama** — si en el
  medio se pushearon commits nuevos, ese Redeploy los ignora
  silenciosamente. Si un error "ya arreglado" sigue reapareciendo
  idéntico después de pushear el fix y hacer Redeploy, lo primero a
  revisar es CUÁL fila de la lista se redesplegó — comparar el hash de
  commit que muestra esa fila contra `git log` de la rama. La señal más
  confiable para confirmar esto sin acceso directo al dashboard: los
  números de línea del stack trace de un error en runtime logs — si no
  coinciden con el archivo actual pero sí con una versión unos commits
  atrás (`git show <commit>:<archivo> | grep -n ...`), el deploy que
  corrió en producción es ese commit viejo, no el HEAD.
- **La build cache de Vercel puede dejar una función sirviendo código
  viejo aunque el deployment diga "Source: <el commit correcto>"** — pasó
  en esta sesión: el commit del deployment era el HEAD real (con un fix
  ya aplicado), pero el stack trace en runtime seguía siendo el de 3
  commits atrás. La build había tardado sospechosamente poco (~24s) para
  una recompilación completa de TypeScript, consistente con haber
  reusado un bundle cacheado de una build anterior en vez de recompilar
  ese archivo. La solución: desde el menú "..." del deployment más
  reciente, "Redeploy" y DESTILDAR la casilla "Use existing Build Cache"
  antes de confirmar — fuerza una build 100% desde cero. Vale la pena
  probar esto temprano cuando un fix "no aparece" en producción pese a
  que el Source del deployment ya es el commit correcto — antes de seguir
  sospechando del código.

## 10. Generación de PDF con @react-pdf/renderer

**Un bloque "alto" (Svg + varios `<Text>` con `position: absolute` apilados
encima, o una fila de tabla con `wrap={false}`) puede dejar a
@react-pdf/renderer colgado en un loop sin fin — sin tirar excepción, sin
timeout propio — en vez de simplemente fallar o paginar mal.** Pasó en
Informes con el esquema unifilar de Tableros (un `<View>` con un `<Svg>` de
líneas/rectángulos y ~1 `<Text position="absolute">` por circuito encima):
con un tablero real de 42 circuitos en un solo cuerpo, la altura del bloque
cruza un umbral (confirmado entre 39 ítems ≈662pt, que renderiza bien, y 40
≈678pt, que cuelga para siempre) y el proceso de Node queda al 50-100% de
CPU sin devolver nunca una respuesta — en el cliente esto se ve como "An
unexpected response was received from the server" (el mensaje genérico de
Next.js cuando una Server Action nunca contesta), indistinguible a simple
vista de cualquier otro error. Mismo patrón, más chico, en una fila de
tabla con `wrap={false}` cuando la tabla tiene muchas filas y el contenido
de alguna fuerza un salto de página justo ahí. No depende del largo del
texto ni de activar/desactivar `wrap`/`break` en ese bloque — es la altura
total acumulada la que importa.

**Cómo diagnosticar esto (nunca a ciegas, nunca asumiendo "debe ser un
error de datos"):** si una Server Action que genera un PDF devuelve ese
mensaje genérico, antes de sospechar de los datos o del RLS, revisar si la
fila que SÍ se guardó en la base (el registro padre de la medición/informe,
si el flujo inserta antes de generar el PDF) quedó con el campo del PDF en
null — eso confirma que el proceso llegó hasta la generación y se colgó
ahí, no que falló antes. Para reproducir y aislar la causa real: armar una
ruta de API descartable (nombre SIN empezar con `_`, porque Next.js excluye
las carpetas `_foldername` del ruteo — un detalle que cuesta un rato
perdido si no se sabe) que llame directo a la función de render con datos
reales sacados de la base (no inventados — el bug puede depender de la
combinación exacta de altura/cantidad), excluirla del matcher de
`proxy.ts`/middleware para no necesitar sesión, y pegarle con `curl
--max-time <n>`. Si el proceso de `next dev` (`ps aux | grep next-server`)
queda consumiendo CPU mucho después de que el `curl` cortó por timeout, es
un colgado real del renderer, no una excepción — matar el proceso y
reiniciar `next dev` entre cada prueba (una vez colgado, TODO pedido nuevo
queda en cola detrás, dando falsos positivos de "también cuelga" en
pruebas que en realidad nunca llegaron a correr). Achicar el dataset a
mano (binary search sobre la cantidad de filas) hasta encontrar el umbral
exacto confirma la causa antes de tocar el código de verdad.

**El arreglo bajo presión (hay un usuario bloqueado ahora mismo) y el
arreglo de fondo no son el mismo commit — pero tampoco hay que quedarse en
el primero.** El primer paso razonable es un techo conservador por bloque
que, si se supera, omite ese contenido puntual con una nota en vez de
tirar abajo todo el documento (nunca dejar que la generación entera
dependa de que un bloque puntual entre en un caso sano de la librería) —
eso destraba al usuario en minutos. Pero "omitir el dibujo si hay
demasiados elementos" es una regresión real para cualquier caso que supere
el techo, no una solución — y vale la pena volver enseguida después con el
arreglo que sí sostiene cualquier volumen: en vez de un bloque gigante,
**particionar el contenido en varios bloques más chicos, cada uno
garantizado por debajo del umbral, dejando que la paginación normal del
documento los acomode** (mismo criterio que ya usa cualquier tabla larga —
varias filas chicas en vez de una fila gigante). Concretamente acá: una
función que arma el dibujo completo sin partir (para el DXF, que no pasa
por react-pdf y no tiene este problema) y una versión paginada aparte (solo
para el PDF) que corta cualquier grupo que por sí solo exceda el máximo en
"parte 1/N, parte 2/N...", agrupando grupos chicos consecutivos en el mismo
bloque para no desperdiciar espacio. Probado hasta 500 ítems en un solo
grupo sin cuelgue. La lección general: cuando el parche rápido es "cortar
contenido para esquivar un bug de una librería", preguntarse enseguida si
en cambio se puede **partir ese contenido en unidades más chicas que caigan
del lado sano del bug** — casi siempre es la diferencia entre un límite
arbitrario que alguien va a pisar tarde o temprano y una solución que
escala sola.

## 11. Server Actions con muchas fotos — límite de tamaño de la plataforma

**Juntar varias fotos ya comprimidas + el resto del payload en UNA sola
Server Action puede superar un límite de tamaño de request que impone la
PLATAFORMA de hosting (no Next.js) — y ese límite no se sube tocando
`bodySizeLimit` en `next.config`, porque ese valor solo controla lo que
Next.js mismo está dispuesto a aceptar, no lo que la infraestructura de
abajo deja pasar.** Pasó en Informes con el alta de vehículo con fotos (IA):
un solo botón "Dar de alta" mandaba el payload + hasta 8 fotos de exterior +
6 de interior (14 en total, ~300-700KB cada una ya con
`canvas.toBlob(..., "image/jpeg", 0.85)` a 1600px) en una sola Server
Action — con varias fotos reales de un vehículo, ese combinado cruza el
límite de la plataforma. El síntoma es idéntico al de react-pdf colgado
(mismo mensaje genérico "An unexpected response was received from the
server") pero la causa y la forma de confirmarla son distintas: acá el
pedido se corta ANTES de que el código del servidor llegue a correr, así
que **no queda ninguna fila nueva en la tabla, ni ningún registro en la
tabla de diagnóstico de la app** (`client_errores`) — eso es lo que separa
este caso del cuelgue de react-pdf (que si llega a ejecutar, solo que no
termina): revisar primero si el registro padre se alcanzó a crear es la
forma más rápida de distinguir "nunca llegó" de "llegó y se colgó".

**El arreglo es el mismo principio que la sección anterior — partir en
piezas chicas que caen del lado sano del límite, no perseguir el número
exacto.** Separar el guardado en dos pasos: una Server Action que crea el
registro principal con el payload de texto (siempre liviano, nunca se
acerca a ningún límite) y devuelve el id, y una segunda Server Action que
sube UNA TANDA CHICA de fotos por vez (3 en este caso) a la galería de ese
registro — el cliente la llama tantas veces como haga falta, en secuencia,
sin importar cuántas fotos haya en total. Una tanda que falla no debe tirar
abajo lo que ya se guardó: el registro principal queda igual, y se avisa
qué fotos no entraron en vez de hacer parecer que toda la operación
falló. Este mismo patrón (un módulo que junta "payload + bastantes fotos
ya comprimidas" en una sola Server Action) vale la pena revisarlo en
cualquier flujo nuevo que guarde una galería completa de fotos en el mismo
pedido que el resto de los datos — cuantas más fotos admite el módulo por
diseño, más cerca está de pisar este límite.

## 12. Convenciones de dibujo "a mano" (AutoCAD) → reglas de orden en código, no en la IA

**Cuando un usuario pide "enseñarle a la IA" a dibujar/armar algo de una
forma convencional (un plano, un esquema, un documento con estructura
fija), la primera pregunta es si ese dibujo lo genera la IA o código
determinístico — casi siempre es lo segundo, y ahí la tarea es traducir la
convención a reglas de orden/agrupación en ese código, no a un prompt.**
Pasó en Informes con el esquema unifilar de Tableros
(`lib/tableros/unifilar.ts`): el usuario pidió "enseñarle a la IA" a
dibujar el unifilar con las mismas convenciones que usa a mano en AutoCAD
(todo lo que sale del tablero va con bornera abajo; de arriba hacia abajo
siempre 380V/220V → 24V → control de acceso → CCTV, repetido por cuerpo si
el tablero tiene varios; distinguir "circuitos normales" de "circuitos de
UPS"). La IA (`/api/tableros/leer-foto`) no tiene ninguna participación en
el dibujo — solo clasifica cada circuito individual desde la foto
(categoría, tipo, amperaje); el layout lo arma 100% `construirUnifilar`
con los datos ya cargados. El trabajo real fue: (1) confirmar con el
usuario qué parte de la terminología era jerga del oficio que no conocía
("rodeo" = bypass manual de UPS, 3 térmicas entrada/bypass/salida que se
maniobran para sacar el UPS de servicio sin cortar los equipos), (2)
revisar si los campos ya cargados (`categoriaEquipo`, `tipoCircuito`,
`cuerpo`) alcanzaban para expresar la regla, y (3) para lo que no
alcanzaba (distinguir "circuito normal" de "circuito de UPS" no se puede
inferir de nada existente), agregar un campo nuevo chico en vez de forzarlo
con una convención de texto libre — en este caso dos columnas booleana/enum
(`alimentado_por_ups`, `rol_bypass_ups`) con su checkbox/select en el form
de alta, no una migración de datos existentes (los circuitos ya cargados
quedan con el default `false`/`null`, que es el comportamiento correcto:
"circuito normal, no es parte de ningún bypass").

**La función de orden se aplica ANTES de cualquier otra lógica que corte o
pagine la lista, nunca después.** `construirUnifilarPaginado` ya partía
cada cuerpo en bloques más chicos cuando no entraban en un bloque de PDF
(ver § 10) — si se ordena cada bloque por separado después de partir, cada
parte queda prolija por sí sola pero el corte entre partes cae en
cualquier categoría, mezclando el orden global. Hubo que mover el
`ordenarCircuitosParaUnifilar(circuitos)` a ANTES del cálculo de
`maxItemsPorGrupo`/slicing, no dentro de cada slice.

## 13. Escribir DXF a mano: versión de entidades y codepage de texto, no solo sintaxis

**Un archivo DXF "ASCII mínimo" escrito a mano (sin librería) puede tener
sintaxis perfecta — secciones bien cerradas, EOF al final — y aun así abrir
vacío o con texto corrupto, por dos motivos invisibles si solo se mira "¿el
archivo tiene la forma de un DXF?": la versión de cada ENTIDAD declarada, y
el codepage del TEXTO.** Pasó en Informes con el DXF del esquema unifilar
de Tableros (`lib/dxf/writer.ts`): el usuario reportó "el DXF no muestra
nada" después de probar un tablero de prueba. Dos bugs reales, ninguno
visible leyendo el código por arriba:

1. **LWPOLYLINE no existe en DXF R12 (`$ACADVER AC1009`)** — se agregó
   recién en R14 (1997). El archivo declaraba R12 en el header pero usaba
   LWPOLYLINE para los rectángulos (más compacta de escribir a mano que la
   POLYLINE clásica), una combinación inválida que varios lectores de DXF
   (sobre todo visores livianos que implementan un subset estricto por
   versión, no AutoCAD en sí) rechazan **entero** en vez de ignorar solo esa
   entidad — de ahí "no muestra nada" en vez de "le faltan los cuadraditos".
   Arreglo: usar POLYLINE clásica (grupo 66+70) + VERTEX + SEQEND, que es
   válida desde las versiones más viejas de DXF.
2. **Un TEXT de DXF ASCII no es UTF-8** — son bytes crudos interpretados
   según el codepage que declara el header (`$DWGCODEPAGE`, típicamente
   `ANSI_1252`/Windows-1252), nunca UTF-8. Escribir el archivo con
   `Buffer.from(contenido, "utf-8")` deja cualquier tilde/ñ/° corrupta
   aunque el DXF abra perfecto. La tentación obvia — escapar los caracteres
   no-ASCII como `\U+XXXX` — es la notación real del formato DXF, pero
   **solo existe para MTEXT** (que ni siquiera existe en R12): un TEXT
   común con esa notación la deja tal cual, literal, en el dibujo (peor que
   el acento roto). El arreglo correcto es escribir el archivo entero en
   Windows-1252 (coincide con Unicode 1 a 1 salvo un puñado de símbolos en
   0x80-0x9F que necesitan su propia tabla) y declarar `$DWGCODEPAGE` en el
   header.

**Cómo se verificó de verdad, no "a ojo":** el bug original pasó
desapercibido en el code review porque el archivo "se veía bien" como
texto — todas las secciones, todas las entidades con sus pares de grupo
correctos. La única forma de confirmarlo fue abrirlo con un lector de DXF
real (`ezdxf`, Python, instalable con `pip install ezdxf matplotlib` en el
sandbox) y renderizarlo a PNG — ahí aparecieron tanto el rechazo total del
archivo (antes del fix 1) como el texto corrupto/literal (durante el fix a
medias del punto 2). Para cualquier generador de un formato binario/de
texto estructurado escrito a mano (DXF, pero el principio vale para
cualquier otro), "la sintaxis cierra" no es lo mismo que "un lector real lo
entiende" — conseguir o instalar un lector/validador real del formato y
probar contra él, no quedarse en inspección visual del texto generado.

## 14. Probar react-pdf fuera de Next.js con `tsx`: el error no es del código

**⚠️ Corrección (ver `motor-unifilares`, deploy en Vercel): la afirmación de
abajo de que "en producción esto no afecta en absoluto" es FALSA en
general — solo es cierta para Next.js/webpack. Cualquier runtime que SÍ
aplique la resolución estricta de `exports` de Node (entre ellos, las
funciones serverless de Node.js de Vercel, que no pasan por webpack) pisa
este mismo bug en producción, no solo al correr sueltos con `tsx`. El
síntoma en ese caso no es el mismo `ERR_PACKAGE_PATH_NOT_EXPORTED` de abajo
— ahí el bundler de la función, al no poder resolver la dependencia
transitiva rota, directamente deja afuera del bundle el módulo que la
importa (sin aviso en el log de build) y en runtime tira
`ERR_MODULE_NOT_FOUND: Cannot find module '.../pdf-renderer.js'` (o el
nombre que tenga el archivo que importa `@react-pdf/renderer` en esa app),
apuntando a un archivo propio que a simple vista no tiene nada que ver con
`@react-pdf/hyphenate`. Si aparece ese error en un deploy serverless con
react-pdf, es este bug — no asumir que es un problema de extensión de
archivo (`.tsx`/`.ts`) ni de que el bundler no sabe "rastrear" la
dependencia pesada; es puntualmente la falta de condición `"require"` en
`exports` de `@react-pdf/hyphenate`.**

**Fix permanente (no un parche manual a mano cada vez): `patch-package`.**
Agregar `patch-package` como devDependency, parchear
`node_modules/@react-pdf/hyphenate/package.json` agregando `"require"`
igual al `"import"` existente en cada entrada de `exports` (`"."` y
`"./*"`), congelar el parche con `npx patch-package @react-pdf/hyphenate`
(guarda un `.patch` en `patches/`, que sí se commitea) y agregar
`"postinstall": "patch-package"` a los `scripts` del `package.json` — así
el parche se reaplica solo en cada `npm install`, incluido el que corre
Vercel (o cualquier otro CI) en cada deploy, sin depender de que alguien
lo repita a mano. Mismo criterio sirve para `informes-app` si alguna vez
necesita correr react-pdf fuera de Next.js/webpack (ej. un script de
prueba con `tsx`, o si algún día deja de usar webpack).

**Al intentar reproducir localmente el cuelgue de react-pdf (§10) con `npx
tsx algo.ts` importando `@react-pdf/renderer` directo (sin pasar por
Next.js), el import falla con
`ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './en-us' is not defined by
"exports" in .../@react-pdf/hyphenate/package.json` — no es un bug en nuestro
código ni en react-pdf, es que `@react-pdf/hyphenate` solo declara condición
`"import"` en su `exports` (es un paquete ESM puro), y el hook de resolución
de módulos de `tsx` intenta resolver ese subpath también por el lado
`require` (CJS) y lo rechaza. Next.js/webpack nunca pisan este problema
porque resuelven distinto (no aplican la validación estricta de `exports`
de Node), así que en producción (vía Next.js/webpack) esto no afecta — pero
sí afecta en cualquier otro runtime con resolución estricta, ver la
corrección arriba.**
Workaround histórico para poder probar sin el fix permanente de arriba:
copiar
`node_modules/@react-pdf/hyphenate/package.json`, agregarle a mano un
campo `"require"` igual al `"import"` existente en cada entrada de
`exports` (`"."` y `"./*"`), correr la prueba, y restaurar el archivo
original de la copia al terminar (no es un cambio para commitear — vive en
`node_modules`, y una reinstalación lo pisa solo). Con ese parche temporal,
un script `.ts` dentro del propio `informes-app/` (tiene que estar ahí
para que la resolución de `node_modules` llegue) puede llamar
`renderToBuffer(...)` directo y cronometrar/confirmar que un caso grande
(ej. 120 circuitos, el bloque más denso con 142 `<Text>` en 477pt) termina
rápido y no cuelga — exactamente la prueba que hacía falta antes de
confiar en un rediseño del dibujo del unifilar que cambió mucho la
densidad de comandos por punto de altura (ver § 15) sin tener la certeza
de que el límite de altura seguro (`ALTO_MAX_BLOQUE_SEGURO`, ver § 10)
seguía siendo válido con ese nuevo layout.

## 15. Rediseño del unifilar a "escalera" (barra arriba, columnas abajo) — fiel a los planos reales, no al criterio propio

**Cuando el usuario ya definió a mano cómo tiene que verse algo (le mostró
varios PDF reales de AutoCAD con el estilo que usa en el trabajo), la
referencia es esa, no una interpretación "razonable" de la convención
general — y conviene pedirla/leerla ANTES de iterar más veces a ciegas.**
Pasó en Informes con el esquema unifilar de Tableros: después de dos
rondas de ajustes (symbolos + agrupación por categoría, segunda ronda con
más símbolos reales) el usuario seguía diciendo "sigue dibujando igual" —
recién cuando adjuntó 4 planos reales de AutoCAD (tableros TSBT, CAS,
unifilares 24V/220V) quedó claro que el problema no era de símbolos sino de
**orientación**: los planos reales usan una barra horizontal arriba con
cada circuito colgando hacia abajo en su propia columna (estilo
"escalera"), agrupados de a ~5 columnas por fila con un símbolo de llave
seccionadora real (dos bornes + cuchilla diagonal) o de borne de salida
(par de círculos), un bloque de 2-3 líneas de datos debajo, y una cajita de
identificación del circuito al pie — nada que ver con la lista vertical
(aunque ya tuviera buenos símbolos) que se había armado en las rondas
anteriores. Dos lecciones:

1. **Pedir la referencia real apenas el usuario la mencione como
   disponible** ("te voy a buscar un ejemplo de cómo lo dibujo en
   AutoCAD") en vez de seguir iterando sobre la propia interpretación —
   cuesta una ronda de ida y vuelta, pero ahorra varias rondas de "no es
   eso" después.
2. **El dato real de los planos (nomenclatura, numeración de circuitos
   C1/D1, IDs de cable A80/A81, "CIRCUITO X — ...") es información de
   producto, no solo de estilo** — confirma qué campos hacen falta y cómo
   nombrarlos, más allá de la geometría.

**Límite aceptado a propósito, no un descuido:** los planos reales a veces
encadenan más de un dispositivo en la misma columna (ej. bornera de
entrada → térmica → disyuntor, los tres en la misma bajada, porque
físicamente un circuito pasa por más de una protección en serie) y también
incluyen una vista "topográfica" aparte (dónde queda cada módulo
físicamente dentro del gabinete, con sus medidas). Ninguna de las dos cosas
se replicó: el modelo de datos actual (`tablero_circuitos`) guarda cada
dispositivo como un circuito independiente sin relación "este alimenta a
este otro", y no hay coordenadas físicas de montaje — harían falta campos
nuevos (relación entre circuitos, posición X/Y), no solo una función de
dibujo distinta. Documentado y comunicado explícitamente al usuario en vez
de fingir una réplica 1 a 1 que el dato disponible no sostiene.

## 16. Encadenado de circuitos en una columna: cerrando el límite de la § 15

Cierra una de las dos brechas documentadas en la § 15 (la de "bornera →
térmica → disyuntor en la misma bajada" — la vista topográfica con
coordenadas X/Y sigue sin implementarse, esa sí requiere un modelo de
datos totalmente distinto). El patrón que terminó andando:

- **Campo de relación por N°, no por id.** `circuito_padre_id` (uuid, FK a
  `tablero_circuitos`) es lo que se persiste, pero el formulario de alta
  elige el padre por **número de circuito** (`padreNumero` en el tipo de
  UI), no por id — porque en el form un circuito recién agregado en la
  misma visita todavía no tiene id hasta guardar. La resolución
  N°→id pasa a una segunda pasada DESPUÉS del insert loop (`actions.ts`):
  se insertan todos los circuitos primero, se arma un mapa N°→id con los
  ids ya generados, y recién ahí se hace el `update` de
  `circuito_padre_id` — así no importa si el padre y el hijo se cargaron
  en el mismo visita o si el padre ya existía de una visita anterior.
- **Altura simulada, no estimada.** El riesgo real al agregar "más de un
  dispositivo por columna" es que la función que calcula cuánto mide cada
  bloque (para el corte seguro de react-pdf, ver § 10/§ 14) empiece a
  **subestimar** la altura real dibujada — si eso pasa, el bloque se
  arma por debajo del límite seguro en el cálculo pero el dibujo real lo
  supera, y vuelve el cuelgue silencioso. La función
  `alturaColumna(profundidad)` evita ese riesgo literalmente replicando
  paso a paso el mismo avance de `y` que hace el loop real de dibujo
  (`dibujarColumna`), en vez de una fórmula aproximada — cualquier cambio
  futuro al loop de dibujo que no se refleje en `alturaColumna` es un bug
  de altura por construcción, no silencioso: alcanza con mirar que ambas
  funciones avancen `y` de la misma forma.
- **Un solo hijo por padre, con fallback silencioso documentado como tal.**
  Si dos circuitos distintos apuntan al mismo padre (dato mal cargado),
  solo el de N° más bajo continúa la cadena — los demás quedan como
  cabeza de su propia columna en vez de fallar o loopear. Nunca pasa con
  el uso real (una térmica tiene un único disyuntor aguas abajo), pero es
  mejor un fallback predecible que una excepción en el render de un PDF
  de producción.
- **Validado con el mismo método de la § 14, ahora con cadenas reales.**
  Antes de confiar en el rediseño de altura, se corrió el mismo tipo de
  prueba (patch temporal a `@react-pdf/hyphenate` + `tsx` + reversión) con
  un tablero sintético de 78 circuitos incluyendo cadenas de profundidad 2
  y 3 — el bloque más alto dio 446pt (seguro, el límite es 480pt) y
  renderizó en <500ms sin colgarse.

**Lo que se dejó explícitamente para después (acordado con el usuario, no
un olvido):** la detección automática de encadenado desde la foto (que la
IA de `leer-foto` reconozca "esta térmica tiene un disyuntor pegado abajo"
y pre-cargue `padreNumero`) no se implementó en este incremento — el campo
se carga a mano en el form. Igual con la etiqueta de cable
(`etiqueta_cable`): es texto libre que tipea el técnico, nunca
autogenerado, porque el esquema de numeración propio del cliente
(continuidad entre planos, por ejemplo "A80") no es algo que el sistema
pueda inventar de forma confiable sin ver el resto de los planos del
sitio.

## 17. Por qué una herramienta generativa (foto → dibujo en un paso) y un pipeline determinístico no son la misma solución al mismo problema

El usuario comparó este feature con pasarle una foto a Claude Cowork y
pedirle que dibuje el plano directo — con menos correcciones de ida y
vuelta que las rondas que costó este unifilar. Vale la pena dejarlo
escrito porque es una pregunta que va a volver a aparecer con cualquier
output "visual" que el sistema tenga que generar:

- **Cowork resuelve "dibujame esto una vez, que se parezca"**: un modelo
  con visión mira la foto/PDF de referencia y genera directamente el
  dibujo final (SVG/código de dibujo) en un solo paso, usando su criterio
  de qué es "parecido" sobre ESE caso puntual. Barato en iteración
  porque no hay pipeline que mantener, pero el resultado no es
  reproducible (la misma foto dos veces puede salir distinta), no
  escala a miles de tableros sin re-pagar el costo de IA por cada uno, y
  no da garantías de que el PDF/DXF resultante sea válido para abrir en
  AutoCAD real (texto bien formado, entidades correctas, campos
  editables) — el output es "una imagen que se ve bien", no un plano
  técnico con estructura de datos detrás.
- **Esta app resuelve "de estos datos estructurados (circuitos, amperaje,
  categoría, relación padre-hijo), generá SIEMPRE el mismo dibujo
  correcto"**: la IA de `leer-foto` solo clasifica circuitos individuales
  desde una foto (texto, categoría, amperaje) — el layout del unifilar
  (`lib/tableros/unifilar.ts`) es código determinístico, cero IA, que
  arma el mismo dibujo pixel-exacto a partir de los mismos datos, sin
  importar cuántas veces se regenere. Esto es necesario acá porque: (1)
  el PDF/DXF se vuelve a generar en cada visita y tiene que seguir
  viéndose igual de prolijo sin reintentos ni revisión manual; (2) tiene
  que abrir sin errores en AutoCAD real (de ahí los bugs de § 13); (3) el
  costo de IA por imagen no se puede pagar por cada uno de los miles de
  tableros relevados; (4) cualquier corrección al estilo de dibujo (como
  el encadenado de la § 16) tiene que aplicarse retroactivamente a TODOS
  los tableros existentes con un solo cambio de código, no volviendo a
  generar imagen por imagen.
- **La contrapartida real**: cuando el layout determinístico no reconoce
  un patrón nuevo de los planos reales (como pasó con el encadenado antes
  de la § 16), hay que programarlo a mano — no "simplemente funciona"
  como con un modelo generativo. Por eso la lección de la § 15 (pedir la
  referencia real cuanto antes) importa tanto acá: cada patrón nuevo que
  el código no contempla todavía es una ronda de ida y vuelta, a
  diferencia de una herramienta generativa que "adivina" razonablemente
  bien sobre casos que nunca vio.

**Conclusión para el próximo proyecto con un output visual similar:** si
el resultado tiene que ser reproducible, barato de regenerar en volumen,
y válido para un formato técnico externo (CAD, no solo una imagen), un
pipeline determinístico (datos estructurados → reglas de dibujo en
código) es la elección correcta aunque cueste más iteración inicial que
pedirle a un modelo con visión que lo dibuje directo.

## 18. Comparar el output de una herramienta generativa puntual contra el pipeline determinístico puede señalar una brecha de ESTÁNDAR, no solo de estilo

Seguimiento real de la § 17: en otra sesión se armó un plano a mano
(script Python + ezdxf, fuera de la app) para reconstruir el unifilar de
un tablero real a partir de 4 fotos, siguiendo un documento de reglas de
dibujo CAD bastante más completo que lo que ya hacía
`lib/tableros/unifilar.ts` (grilla 1-16/A-H con flechas de centrado,
sello "PARA REVISIÓN", rótulo IEC completo abajo a la derecha,
numeración de conductores `A n` correlativa con par de bornes N/F en
cada punto de conexión, marca diagonal de formación de cable en cada
tramo, tabla de PUESTA A TIERRA). El usuario comparó ese resultado
contra lo que ya existía y pidió llevar el mismo nivel de detalle al
generador real de la app — un pedido válido y distinto de "arreglame
este plano puntual": la pregunta correcta no es "¿cuál de los dos se ve
mejor?" sino "¿el estándar que sigue el de afuera es el que el
generador de producción debería seguir también?".

**División en etapas, no todo junto.** Dado el tamaño (toca
`lib/tableros/unifilar.ts`, `lib/dxf/writer.ts`, y potencialmente
`lib/pdf/tablero.tsx` + el modelo de datos), se dividió en etapas
confirmadas una por una con el usuario antes de tocar código: (1)
símbolo de borne + marca de cable + numeración `A n` sobre el layout
"escalera" ya existente (sin cambiar su forma); (2) rótulo IEC completo
+ grilla + sello (pendiente — necesita datos que hoy no existen, ver
abajo); (3) hoja de cabecera + tabla de PUESTA A TIERRA (pendiente).
Cada etapa se valida y pushea por separado.

**Un dato que "suena" fijo (nombre de la contratista) puede no serlo —
preguntar, no asumir, ni siquiera copiando un ejemplo ya usado en otro
lado.** El script manual (de otra sesión) había puesto `"TerraLogic"`
como contratista en el rótulo — un nombre que no aparece en ningún lado
del código ni de los datos reales de esta app. Al proponer llevar ese
mismo dato al generador de producción, el usuario lo marcó de inmediato
como sospechoso ("Terralogic???????"): la contratista real es otra
(`SONDA`). Mismo criterio que "no inventar" ya aplicado en todos los
prompts de IA de este proyecto (ver § 5), pero acá aplicado a una
decisión de otra sesión de Claude que se iba a propagar sin chequear.

**"¿De dónde sale este dato del rótulo?" puede revelar que falta un
campo entero, no solo un valor.** Al armar el rótulo real (cliente,
contratista, obra), aparecieron dos huecos reales en el modelo de
datos: "cliente" no existía en Tableros (sí en Informe Técnico, con
`catalogo_clientes` + alta al vuelo — mismo patrón a reusar, pendiente
para la etapa 2) y el nombre de la empresa contratista no existía como
texto en ningún lado (`config_general` solo tenía el logo como imagen,
`logo_empresa_url`, sin nombre). Se agregó `nombre_empresa` a
`config_general` (default `"SONDA"`, la contratista real) junto al
logo existente en Configuración → Datos de la Empresa, en vez de
hardcodear el nombre en el código del plano — mismo criterio que el
resto de esta app: un dato de la empresa es config, no una constante en
el generador.

**Simplificar a propósito la fidelidad visual de una convención a mano
cuando hay un costo de performance real detrás — y dejarlo escrito
como decisión, no como omisión.** El plano de referencia (a mano)
dibuja el par de bornes N/F en LOS DOS extremos de cada tramo de cable
(mismo número, pero el símbolo se repite físicamente en cada terminal).
El generador de producción dibuja ese par una sola vez por dispositivo
(en su entrada) — sigue siendo 100% correcto según la regla real ("el
número cambia al atravesar una protección, no a lo largo de un cable"),
pero genera la mitad de bornes dibujados. La razón no es estética: cada
línea nueva de verdad cuesta en este archivo puntual, porque
`@react-pdf/renderer` tiene un historial real de cuelgue por altura de
bloque (§ 10/§ 14/§ 16) — duplicar los bornes habría duplicado también
el crecimiento de altura por circuito. Elegir la versión más liviana
y documentar por qué (en vez de copiar la convención a mano 1 a 1 sin
pensarlo) es el mismo criterio de la § 17: "esquema simplificado, no a
escala" es una decisión de diseño de esta app, no una limitación a
esconder.

**Revalidar el límite de altura segura CADA VEZ que cambia la densidad
de comandos por punto de altura — no asumir que un número que fue
seguro una vez lo sigue siendo.** `ALTO_MAX_BLOQUE_SEGURO = 480` se
calibró en su momento (§ 10) para la densidad de comandos de ESE
layout. Agregar bornes + marcas de cable casi duplicó el alto por
dispositivo (`PASO_DISPOSITIVO` nuevo ≈ 23.5pt vs. los ~13-18pt
anteriores) — el límite en sí no cambió, pero había que confirmar que
seguía siendo seguro con la nueva densidad, no asumirlo. Se repitió el
método exacto de la § 14 (parchear a mano
`node_modules/@react-pdf/hyphenate/package.json` agregando `"require"`
igual al `"import"` existente, correr un script `.ts` con `tsx` dentro
de `informes-app/`, restaurar el parche al final) con un tablero
sintético de 96 circuitos (igual orden de magnitud que el caso real de
§ 16): la paginación automática (que ya calcula el alto real vía
`alturaColumna`, no un número fijo de circuitos por bloque) produjo
bloques de hasta 470pt — justo debajo del límite — y renderizó en
888ms sin colgarse. Un segundo caso con 390 circuitos (11 bloques,
máximo 470pt) renderizó en 3.7s, también sano. Conclusión: el límite
de 480 seguía siendo válido, pero solo se supo probándolo de nuevo con
el layout real, no reusando la confianza de la medición anterior.

## 19. Etapa 2 del mismo rediseño: marco ISO + rótulo completo — un presupuesto de altura "reservado" hay que actualizarlo en el mismo commit que lo que reserva

Seguimiento directo de la § 18 (Etapa 1: bornes + numeración + marca de
cable). La Etapa 2 agregó al generador real de Tableros
(`lib/tableros/unifilar.ts`) el resto del estándar de dibujo por hoja:
grilla 1-16 arriba/abajo y A-H izq/der con flechas de centrado en los 4
lados, bloque de revisiones (RevNo/Revision note/Date/Signature/
Checked), título arriba a la izquierda, sello "PARA REVISIÓN", y el
rótulo completo abajo a la derecha (antes solo tenía sitio/tablero/
fecha/realizó/plano/hoja en 2 líneas; ahora suma CLIENTE y CONTRATISTA).

**Dos datos nuevos del rótulo que no existían en el modelo — se agregó
el campo real, no un texto fijo.** "Cliente" no existía en Tableros
(sí en Informe Técnico, con `catalogo_clientes` + alta al vuelo —
mismo patrón reusado acá: `tableros.cliente`, autocompletado, default
`"YPF"`). "Contratista" tampoco existía como texto en ningún lado
(`config_general` solo tenía el logo como imagen) — se agregó
`config_general.nombre_empresa` junto al logo en Configuración →
Datos de la Empresa (default `"SONDA"`, el nombre real, confirmado
por el usuario — nunca el que había usado el script manual de la § 18,
que resultó inventado). Mismo criterio en los dos casos: un dato que
"suena" fijo (el nombre de la propia empresa) se pregunta, nunca se
asume ni se copia de un ejemplo anterior.

**Texto sin alineación "derecha" en el formato de draw commands propio
— hay que calcular el ancho a mano para que no se corte contra el
borde.** `DrawCommand.text` (de este mismo proyecto, ver § 13) solo
tiene `x` (ancla izquierda) — no existe un modo "texto justificado a la
derecha". El sello "PARA REVISIÓN", pensado para terminar pegado al
borde derecho de la hoja, al principio se ancló directo en `x = borde`
(texto arrancando ahí, extendiéndose hacia afuera) y quedó cortado
fuera del lienzo en el render de prueba — invisible en cualquier lector
real, no solo "se ve distinto". Arreglo: estimar el ancho del texto a
mano (`texto.length * size * factor`, mismo criterio que ya usa
`truncar`/`truncarColumna` en este archivo para no pasarse de ancho) y
restarlo de la coordenada del borde antes de ubicar el `x`. Generaliza
a cualquier texto "ancla a la derecha/centrado" en un formato de dibujo
propio sin layout real: nunca asumir que un texto largo "entra", medir
u orientar el ancla para que el peor caso (el texto más largo posible)
siga adentro del lienzo — y confirmarlo con el mismo chequeo de
superposición/límites por coordenadas (no solo a ojo en un render)
que ya viene usándose para este archivo.

**Un presupuesto de altura "reservado para lo que se agrega después"
hay que actualizarlo en el MISMO cambio que agranda lo que reserva —
si no, el presupuesto queda mintiendo con el aspecto de seguir
vigente.** `construirUnifilarPaginado` ya reservaba espacio para el
rótulo ANTES de que existiera (`limiteBloque = ALTO_MAX_BLOQUE_SEGURO
- ALTO_ROTULO - MARGEN`, ver § 10) — ese cálculo seguía ahí, intacto,
compilando sin error, cuando el marco nuevo pasó a agregar ~90pt por
hoja (grilla + banda de título + rótulo) en vez de los ~38pt de antes.
Nada en el tipo ni en el build avisa que una reserva de altura quedó
desactualizada: es un número que sigue siendo "válido" sintácticamente
pero ya no describe lo que de verdad se agrega — el error solo
aparece como un bloque real que supera el límite seguro de
react-pdf, en producción, con un tablero real lo bastante grande.
Se encontró ANTES de pushear porque la Etapa 1 ya había dejado
instalado el hábito (§ 18) de revalidar el límite con el método de la
§ 14 cada vez que cambia la densidad de comandos — correr esa misma
prueba con el marco agregado mostró bloques superando 480pt hasta que
se corrigió `limiteBloque` para restar la altura real del marco
completo (`alturaMarco = BANDA_GRID*2 + 8 + BANDA_TITULO +
ALTO_ROTULO`), no solo la del rótulo viejo. Confirmado después con el
mismo tablero sintético de 390 circuitos: ahora parte en 14 bloques en
vez de 11 (cada uno con menos circuitos, por el overhead extra), todos
por debajo de 480pt, sin colgarse. Regla general: cuando un número
representa "cuánto se va a agregar después" (una reserva, un offset,
un margen calculado), buscarlo y actualizarlo explícitamente en el
mismo commit que cambia lo que ese número reserva — no asumir que
porque el valor anterior "andaba" sigue siendo correcto.

## 20. Etapa 3 del mismo rediseño: tabla de PUESTA A TIERRA — el mismo bug de presupuesto de altura, ahora en un bloque nuevo que nunca pasó por el chequeo viejo

Seguimiento directo de la § 19. La Etapa 3 agregó la tabla PUESTA A
TIERRA (A7 del estándar) al generador real: cada circuito que es un
destino real (hoja del árbol de encadenado, no un eslabón intermedio
como una térmica con un disyuntor colgando) recibe un `Tn` correlativo
único para todo el tablero, listado en una tabla aparte al pie del
DXF (hoja única) o como su propia hoja final en el PDF paginado.

**La hoja de cabecera fija (alimentación/térmica general/protector de
sobretensión/borneras BNR-01-02) quedó fuera a propósito — no por
quedarse corta de tiempo, por no inventar estructura que el dato no
sostiene.** Esa parte del estándar (A1/B1 de REGLAS_UNIFILAR) asume
una topología FIJA (bornera de entrada → térmica general → bornera de
reparto → protector/distribución) que no tiene equivalente en el
modelo actual de circuitos (un árbol flexible, sin concepto de "origen
de la alimentación" ni de "bornera de entrada" separados de los
circuitos). Ya hay una categoría `descargador_gaseoso` que cubre el
protector de sobretensión como un circuito más — construir la
cabecera fija completa pediría campos nuevos (de dónde viene la
alimentación, como mínimo) que nadie confirmó todavía. Mismo criterio
que la § 15 de este mismo documento (vista topográfica, nunca
replicada por la misma razón): documentarlo como decisión pendiente
de producto, no fingir una réplica que el dato disponible no sostiene.

**El mismo bug de presupuesto de altura de la § 19 — exactamente el
mismo tipo de error, en código nuevo que nunca pasó por el chequeo
anterior.** La tabla de tierra parte sus filas en bloques cuando no
entran en una sola hoja (`construirBloquesTierra`, mismo criterio de
partición que `construirUnifilarPaginado`), con un número de filas por
columna calculado a mano para quedar "bien debajo" del límite seguro
de 480pt. El error: ese cálculo se hizo contra los 480pt directo, sin
restar `ALTURA_MARCO_HOJA` (lo que agrega después `agregarMarcoYRotulo`
— grilla + banda de título + rótulo, ~90pt) — el mismo error conceptual
de la § 19, pero en una función nueva que nunca se benefició del fix
anterior porque ese fix solo tocó `construirUnifilarPaginado`, no este
código nuevo. Se encontró con el mismo método (tablero sintético de
550 circuitos / 350 destinos reales, forzando que la tabla de tierra
necesitara partirse en más de un bloque): el último bloque dio 486pt,
por encima del límite. Arreglo: se extrajo `ALTURA_MARCO_HOJA` como una
constante compartida (antes calculada inline, duplicada, dentro de
`construirUnifilarPaginado`) y se recalculó el presupuesto de filas de
la tabla de tierra contra `ALTO_MAX_BLOQUE_SEGURO - ALTURA_MARCO_HOJA`,
igual que ya hacía `limiteBloque`. Confirmado después: 24 bloques
(antes 23), el más alto en 462pt, renderiza en 7.4s sin colgarse.
**Lección que no se puede marcar "aprendida" después de aplicarse una
vez**: una constante compartida que describe "cuánto agrega el marco"
protege solo al código que la usa — cualquier función nueva que
calcule su propio presupuesto de altura a mano, aunque sea "bien por
debajo" a ojo, puede reintroducir el mismo bug si no deriva su número
de esa misma constante. Antes de escribir un número "seguro" a mano
para un presupuesto de altura en este archivo, buscar primero si ya
existe una constante que lo describe (`ALTURA_MARCO_HOJA`,
`ALTO_MAX_BLOQUE_SEGURO`) y calcular contra esas, nunca contra un
número redondo elegido por intuición.

## 21. Un botón que dispara un paso largo con IA no debe colgarse de la respuesta HTTP — encolar + worker aparte, no seguir achicando lotes

**Contexto:** el botón "Generar unifilar" de `informes-app` le pedía a
`motor-unifilares` (servicio aparte en Vercel) que generara el plano
completo (varios llamados a Claude + render de PDF/DXF) y esperaba la
respuesta en el mismo `POST /api/unifilar`. Se intentó, en orden,
reducir el modelo (Opus→Sonnet), partir la generación en lotes
secuenciales, pasar los lotes a paralelo (`Promise.all`), subir y bajar
el tamaño de lote, y subir el `max_tokens` por lote — cada iteración
arregló el síntoma inmediato (`stop_reason=max_tokens`, el guard de
streaming del SDK) pero el timeout de 60s de la función serverless
volvía a aparecer.

**El error de fondo:** correr los lotes en paralelo solo evita que sus
tiempos se SUMEN — el tiempo total de la función sigue siendo
`tiempo del lote más lento` + `tiempo del llamado final que depende de
todos los anteriores (si lo hay)` + `tiempo de cualquier render/upload
después`. Si un único lote bien detallado ya puede tardar 40-60s en que
la IA lo resuelva, ningún tamaño de lote lo arregla — achicar el lote
no baja el PISO de tiempo que tarda un llamado, solo reduce cuánto se
pierde si uno se cuelga. **Un único request HTTP que espera de punta a
punta una generación con IA no entra de forma confiable en el timeout
de ninguna función serverless**, sin importar cuánto se siga
retocando el batching puertas adentro.

**La solución real, una vez reconocido esto, fue arquitectónica, no otro
ajuste de parámetros:** desacoplar "pedir" de "generar".
1. El endpoint que atiende el click del botón solo valida y ENCOLA el
   pedido en una tabla (`estado: "pendiente"`) — responde en
   milisegundos, sin llamar a la IA.
2. Un worker aparte, que corre como **proceso de Node, nunca como
   función serverless**, es el que de verdad procesa la cola — sin
   ningún `maxDuration`, puede tardar los minutos que haga falta.
3. El worker escribe el resultado directo donde la UI ya lo espera
   (mismas columnas/tablas que antes llenaba la respuesta síncrona), así
   que la UI que consume el resultado no necesita cambios — solo
   necesita, además, mostrar un estado intermedio ("pendiente" /
   "generando" / "error") mientras tanto.
4. Mientras la calidad del generador todavía se está ajustando, está
   bien que ese worker se dispare A MANO (un script) en vez de
   automático — automatizar el disparo de algo que todavía no da
   resultados confiables solo genera más output para revisar sin que
   nadie lo pidió. Cablear un disparo automático (cron, "fire and
   forget" después de responder) es una mejora para después, no un
   prerrequisito de la arquitectura asincrónica.

**La señal para reconocer este caso a tiempo (antes de perder varias
iteraciones):** si una tarea con IA detrás de un botón sigue dando
timeout después de paralelizar Y de subir los topes de tokens Y de
reducir el tamaño de lote, el problema ya no es de tuning — es que la
tarea, por su naturaleza, no cabe en el contrato "un click = una
respuesta HTTP inmediata". Encolar + worker aparte no es la última
opción a probar cuando todo lo demás falló: es la primera pregunta a
hacerse apenas se sospecha que un paso con IA puede acercarse al límite
de tiempo de la plataforma.
