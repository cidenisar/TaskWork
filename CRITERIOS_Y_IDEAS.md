# Criterios e ideas para futuras apps web

Notas de diseño/arquitectura que salieron de construir **Informes** (`informes-app/`)
y que vale la pena reusar en el próximo proyecto, aunque sea una app distinta.
No es documentación de Informes en sí (eso está en `informes-app/README.md`) —
son los **criterios generales** detrás de las decisiones, para no tener que
redescubrirlos de cero la próxima vez.

## 1. Ubicación/catálogo con alta "al vuelo" + aprendizaje por uso

Cuando una app necesita que el usuario elija algo de una jerarquía (sitio,
cliente, categoría...) y esa jerarquía no está 100% cargada de antemano:

- **Precargar lo que se pueda** desde una fuente real (planilla, catálogo
  existente) en vez de arrancar de cero y que todo lo cargue el usuario a mano.
- **Alta al vuelo con upsert idempotente**: si el usuario escribe algo que no
  está, se crea ahí mismo (no hay pantalla de "administrar catálogo" aparte
  bloqueando el flujo) — y si dos personas crean "lo mismo" casi en paralelo,
  el choque de unicidad (`23505` en Postgres) se resuelve reusando la fila que
  ganó la carrera, no duplicando.
- **El catálogo se afina con el uso real, no con corrección manual**: con GPS,
  la primera vez que alguien confirma una ubicación desde el punto exacto,
  esas coordenadas quedan guardadas. La próxima persona que use el mismo botón
  desde el mismo lugar físico cae directo en esa ubicación ya existente (match
  por cercanía, ej. <300m) en vez de tener que elegir/escribir de nuevo — la
  app "aprende" sitio por sitio a medida que se usa, sin ningún paso de
  entrenamiento ni intervención manual. Cuantos más técnicos confirman GPS,
  más precisa se pone la detección automática para los próximos. Este patrón
  (geocodificar → buscar match cercano → si no hay, dejar elegir/crear →
  guardar el punto la primera vez que se confirma → nunca pisarlo después)
  sirve para cualquier app con "lugares" repetidos: sucursales, obras,
  clientes con dirección fija, etc.
- **Jerarquía en pasos separados, no un solo select gigante**: si el catálogo
  tiene niveles (Provincia → Sitio → Planta → Oficina), cada nivel es su propio
  paso con su propio "+ Crear nuevo...", y un nivel se salta solo cuando tiene
  una única opción posible (no hacer elegir algo que no hace falta elegir). Un
  solo combo con todas las combinaciones juntas se vuelve inmanejable en
  mobile en cuanto el catálogo crece (cientos de opciones para un solo
  desplegable).

## 2. Nunca traer una tabla completa sin paginar

**Bug real que costó una sesión completa de diagnóstico**: Supabase/PostgREST
corta en silencio cualquier `.select(...)` sin `.range()`/`.limit()` explícito
en el límite por defecto del proyecto (normalmente 1000 filas) — sin tirar
error, la respuesta simplemente llega incompleta. Si la tabla crece con el
tiempo (ej. un catálogo que se va cargando), el bug no aparece el día 1 — aparece
semanas/meses después, cuando se cruza el umbral, y el síntoma ("en la lista
no aparece tal cosa, aunque sé que está cargada") es indistinguible a simple
vista de un bug de UI/scroll.

**Criterio para la próxima app**: cualquier fetch de "todo el catálogo/tabla X"
va en una función paginada (loop de `.range(desde, desde+999)` hasta que
devuelve menos de una página completa), nunca en un `.select()` suelto — sin
importar cuántas filas tenga la tabla el día que se escribe el código. Si al
debuggear "falta algo de una lista" el conteo real de la tabla da más de ~1000,
sospechar esto primero.

## 3. URLs firmadas de Storage: pedirlas frescas al usarlas, nunca guardarlas

Un link a un archivo privado (PDF, foto) en Supabase Storage vence. Si la URL
firmada que se generó al crear/cerrar un registro se guarda y se reusa después
(aunque sea minutos después), eventualmente aparece `InvalidJWT`/
`"exp" claim timestamp check failed`. Patrón correcto: un componente/acción
que pide la URL firmada **en el momento del click**, no antes — centralizado
en un solo lugar (no reimplementado por cada pantalla que muestra un link
"ver PDF").

## 4. RLS: toda tabla con `.update()` necesita su policy de UPDATE explícita

Si una tabla tiene policy de SELECT e INSERT pero no de UPDATE, un
`.update(...)` desde el cliente **no tira error** — simplemente afecta 0 filas,
en silencio. Esto puede pasar desapercibido durante meses si nada en la UI
compara "¿se guardó lo que pedí guardar?". Checklist para cualquier tabla
nueva con RLS: SELECT, INSERT, UPDATE y DELETE (los que apliquen) definidos
desde el principio, no solo los que el flujo "feliz" ejercita al probarlo una
vez.

## 5. Un módulo genérico con IA que clasifica, en vez de N módulos casi iguales

Cuando el usuario necesita relevar/registrar cosas de **distintos tipos** que
comparten la misma forma de uso (se fotografían, se ubican, se describen) pero
difieren en "qué son": no conviene un módulo nuevo por tipo (un módulo para
UPS, otro para cámaras, otro para control de acceso...) si la única diferencia
real es la categoría. Mejor: un solo flujo que saca fotos y una IA de visión
identifica la categoría/marca/modelo — agregar un tipo nuevo después es
ampliar un enum, no crear tabla+migración+formulario nuevos. Reservar un
módulo propio y dedicado solo cuando la entidad es realmente un
**contenedor** con estructura interna distinta (ej. un tablero con sus
circuitos, un rack con su lista de equipamiento) — ahí sí se justifica.

## 6. Pantallas de "dónde hay actividad" ≠ el catálogo completo

Si existe un catálogo grande de referencia (ubicaciones, clientes, lo que sea)
precargado para que el usuario elija/cree al trabajar, la pantalla de
navegación/resumen ("Sitios", "Clientes", lo que sea) no tiene por qué mostrar
ese catálogo completo — filtrar server-side a "lo que ya tiene algo cargado
encima" antes de mandarlo al cliente evita una lista enorme que es puro ruido
para esa pantalla en particular. El catálogo completo sigue existiendo para
elegir/crear, solo no se lista entero en todos lados.
