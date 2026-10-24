# motor-unifilares

Servicio aparte que genera el plano unifilar de un tablero eléctrico (DXF,
y PDF en un paso siguiente) a partir de los circuitos ya relevados en
`informes-app`. Vive como su propia app en este repo, con su propio deploy,
para que iterar acá (prompt, modelo, reglas de dibujo) nunca arriesgue el
deploy de `informes-app`.

## Por qué existe

`informes-app` tuvo un motor geométrico (código que calculaba a mano la
posición de cada símbolo) que nunca llegó a dar un resultado utilizable —
ver `CRITERIOS_Y_IDEAS.md` en la raíz del repo. La alternativa que sí
funcionó fue pedirle a un modelo de IA que interprete los circuitos +
`REGLAS_UNIFILAR.md` (el estándar de dibujo "TerraLogic") y arme el plano
él mismo, con criterio, en vez de una fórmula fija. Este servicio es esa
alternativa, ya separada del código de `informes-app`.

## Cómo se usa

`POST /api/unifilar` **solo encola el pedido** — no genera nada en el
momento (ver "Generación asincrónica" más abajo sobre por qué):

```json
{
  "medicionId": "uuid de tablero_mediciones (informes-app)",
  "circuitos": [ /* UnifilarCircuito[], ver src/types.ts */ ],
  "rotulo": { "sitio": "...", "tablero": "...", "cliente": "...", "contratista": "...", "fecha": "...", "realizo": "...", "numeroGeneracion": "..." }
}
```

Responde al toque (sin header de API key — este endpoint no llama a la IA):

```json
{ "jobId": "uuid del pedido en motor_unifilares_jobs" }
```

El PDF/DXF final no vuelve por esta respuesta — un worker aparte
(`scripts/procesar-cola.ts`) los genera después y los escribe directo en
`tablero_mediciones` (`dxf_url`/`unifilar_pdf_url`) del lado de
`informes-app`, con su service role key. El PDF es una sola hoja A3
apaisada (sin paginar todavía — ver "Qué falta" abajo), con el mismo
`DrawCommand[]` que el DXF, renderizado con `@react-pdf/renderer` (mismo
mapeo a `<Svg>`/`<Text>` que ya usa `informes-app`, así los dos formatos se
ven iguales).

## Enseñarle casos puntuales

Además de `REGLAS_UNIFILAR.md`, el motor acepta ejemplos puntuales ya
resueltos — útil para algo que las reglas escritas no cubren bien solo con
texto (un equipo nuevo, una conexión particular). Se enseña con una imagen
real (ej. una captura de AutoCAD) + una explicación corta, y queda
guardado en una tabla propia de Supabase (`motor_unifilares_ejemplos`, en
el mismo proyecto que usa `informes-app` — tabla aparte, sin acoplar
código entre las dos apps, con RLS habilitado y sin políticas: solo este
servicio puede leerla/escribirla, con la service role key). Desde que se
guarda, cada ejemplo se suma automáticamente al prompt de
`generarUnifilar()` junto con las reglas — no hace falta tocar código.

Dos formas de enseñar:

- **Interfaz web** (`GET /` — ver `public/index.html`): subís la imagen,
  escribís la explicación, pegás tu clave de Anthropic (se guarda solo en
  el navegador, en `localStorage`, nunca llega al servidor salvo como
  header de cada pedido), y el servicio genera una previsualización en PDF
  para revisar antes de confirmar. Desde ahí podés editar el tag/la
  descripción, guardar, o descartar. También lista y permite borrar los
  ejemplos ya enseñados. La imagen se recomprime en el navegador antes de
  mandarla (máx. 1600px, JPEG) — necesario porque el deploy real corre en
  funciones serverless de Vercel, que rechazan cualquier pedido de más de
  4.5MB.
- **CLI** (`npm run ensenar -- foto.jpg "cómo se conecta esto..." [tag]`):
  misma lógica (`src/ensenar.ts`), pensada para probar rápido o
  automatizar en lote. Escribe un PDF de previsualización en `/tmp` y pide
  confirmación antes de guardar.

## Cómo correrlo

**Local (desarrollo):** un server Node plano (`src/server.ts`), sin
framework — solo para probar en esta máquina, no es lo que corre en
producción.

```bash
npm install
npm run dev       # tsx watch, recarga en caliente
# o
npm run build && npm start
```

**Deploy real: Vercel.** No corre como proceso persistente — cada ruta es
una función serverless bajo `api/` (zero-config, Vercel las detecta
solas, sin necesitar un framework) y `public/index.html` se sirve como
estático. Es un proyecto de Vercel APARTE del de `informes-app`, con
root directory `motor-unifilares` dentro del mismo repo/monorepo (mismo
patrón que ya usa `informes-app` como su propio proyecto). `vercel.json`
ya fija `maxDuration: 60` (el máximo del plan gratis). `generarUnifilar()`
usa `claude-sonnet-5-5` (no Opus) puntualmente por esto: con Opus, un
tablero con varios circuitos + el prompt completo (reglas + ejemplos
enseñados) podía superar los 60s y la función moría con
`Vercel Runtime Timeout Error` — Sonnet genera el mismo JSON estructurado
sensiblemente más rápido (y más barato) sin pérdida de calidad relevante
para esta tarea. Si algún día un tablero muy grande vuelve a acercarse al
límite, ahí se evalúa pasar a Vercel Pro (sube el tope a 300s) antes que
mover el servicio a otra plataforma. `vercel.json` también fuerza a incluir en el
bundle de cada función `reglas/` y las fuentes estándar de `pdfkit`
(`node_modules/pdfkit/js/data/**` y `node_modules/pdfkit/js/standard-fonts/**`
— `pdfkit`, que usa `@react-pdf/renderer` por debajo, las carga en runtime
de forma dinámica y el rastreador de dependencias de Vercel no las detecta
solo; sin esto, cualquier PDF falla con `ERR_MODULE_NOT_FOUND` apuntando a
un archivo de fuente como `Helvetica.cjs`).

Variables de entorno (en el proyecto de Vercel, Settings → Environment
Variables):

- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — para guardar/leer los
  ejemplos enseñados (`GET /`, `GET /api/ejemplos`, `POST /api/ejemplos*`).
  Usar la **service role key** del proyecto de Supabase de `informes-app`
  (Settings → API → Project API keys → `service_role`, **nunca** la
  `anon`/pública) — sin estas dos variables, esos endpoints responden un
  error claro en vez de romper el resto del servicio.
- `/api/unifilar` ya no necesita `ANTHROPIC_API_KEY` en ningún lado —
  desde que pasó a ser asincrónico (ver "Generación asincrónica" más
  abajo), ese endpoint solo encola, nunca llama a la IA. Los endpoints de
  enseñar (`/api/ejemplos/previsualizar`, interfaz web) siguen tomando la
  clave por request (header `X-Anthropic-Api-Key`), igual que siempre.
- `PORT` solo aplica al server local (`src/server.ts`), Vercel no lo usa.

Una vez desplegado, la URL que te da Vercel para este proyecto es la que
va en `MOTOR_UNIFILARES_URL` del lado de `informes-app`.

## Generación asincrónica (la cola + el worker)

**Por qué:** incluso con todo lo de "Generación por tramos EN PARALELO"
(más abajo) — lotes chicos, en paralelo, streaming — un tablero con el
nivel de detalle que pide `REGLAS_UNIFILAR.md` por circuito puede dejar
`generarUnifilar()` entero (el lote más lento + el llamado final de
marco/rótulo, que es siempre secuencial después de los lotes + el render
de PDF/DXF) por encima de los 60s de una función serverless de Vercel, sin
importar cuánto se siga achicando el lote — achicar el lote no baja el
piso de tiempo que tarda un solo llamado bien detallado, solo reduce
cuánto se pierde si alguno se cuelga. Un solo `POST /api/unifilar` que
espera la generación completa de punta a punta **no entra en 60 segundos**
de forma confiable.

**La solución: desacoplar "pedir" de "generar".**

1. El botón "Generar unifilar" de Historial de Tableros (`informes-app`)
   hace `POST /api/unifilar` con `medicionId` + circuitos + rótulo.
2. Este servicio solo valida y guarda una fila en `motor_unifilares_jobs`
   (`estado: "pendiente"`, ver migración
   `informes-app/supabase/migrations/20261024200000_motor_unifilares_generacion_asincronica.sql`)
   y responde `202 { jobId }` — típicamente en milisegundos, cero llamados
   a la IA en este paso. `informes-app` marca
   `tablero_mediciones.unifilar_estado = "pendiente"` y listo, no espera
   nada más.
3. `scripts/procesar-cola.ts` (worker) es quien de verdad genera: lee los
   pedidos `"pendiente"`, corre `generarUnifilar()` + el render de PDF/DXF
   para cada uno, sube los archivos al bucket `informes-pdf` (mismo bucket
   y misma ruta — `${createdBy}/tableros/${medicionId}/unifilar.{dxf,pdf}`
   — que usaba antes `informes-app`), y escribe el resultado directo en
   `tablero_mediciones` (`unifilar_estado: "listo"`, `dxf_url`,
   `unifilar_pdf_url`) con la **service role key** — nunca vuelve a pasar
   por HTTP ni por `informes-app`.
4. Como `scripts/procesar-cola.ts` corre como **proceso de Node**, nunca
   como función serverless de Vercel, no tiene ningún `maxDuration` — un
   tablero grande puede tardar los minutos que haga falta sin que nada se
   corte. Por eso procesa los jobs **uno por vez** (no en paralelo entre
   sí): no hay ningún límite de tiempo que justifique el riesgo de
   concurrencia extra contra la API de Anthropic.
5. Los botones "Ver plano unifilar" / "Descargar DXF" y el visor público
   (`/planos/tablero/[id]`, el QR) no necesitaron ningún cambio — ya
   estaban escritos para mostrarse/habilitarse solo cuando
   `dxf_url`/`unifilar_pdf_url` existen, así que se habilitan solos apenas
   el worker termina esa medición en particular.

**Correrlo:** por ahora es un paso manual, a propósito — mientras se
valida/mejora la calidad real del plano que genera la IA (prompt, reglas,
ejemplos enseñados), tiene más sentido correr el worker a mano que dejarlo
desatendido generando cosas que todavía no se revisaron:

```bash
ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  npm run procesar-cola
```

Procesa todo lo que esté `"pendiente"` en ese momento y termina (no queda
corriendo) — volver a correrlo toma lo nuevo que se haya encolado desde la
última vez. Nota importante sobre `ANTHROPIC_API_KEY`: antes viajaba por
request (header `X-Anthropic-Api-Key`, la de quien llamaba); ahora, como
la generación pasa a ser asincrónica, no hay ningún request del que
colgarla en el momento en que de verdad hace falta — el worker la toma de
**su propio entorno** al correr, igual que ya hace `scripts/ensenar.ts`.
El deploy de Vercel de este servicio **ya no necesita `ANTHROPIC_API_KEY`
en ningún lado** (ni por header, ni por variable de entorno): `/api/unifilar`
no llama a la IA, solo encola.

**Qué falta para que esto sea automático de verdad:** hoy no hay nada que
dispare `procesar-cola` solo. Dos caminos, ninguno implementado todavía:
un Cron Job de Vercel (en el plan Hobby corre como máximo una vez por
día — muy poco para iterar; Pro permite cada minuto), o que el propio
`/api/unifilar` dispare un llamado a sí mismo / a otra función después de
responder (patrón "fire and forget" — hay que tener cuidado con que Vercel
puede congelar la función apenas termina de responder, no es tan directo
como un `fetch` sin `await`). Se deja para cuando el motor ya esté dando
resultados confiables — automatizar el disparo de algo que todavía no se
terminó de ajustar solo generaría más planos para revisar a mano.

## Generación por tramos EN PARALELO (por qué `generarUnifilar` hace varios llamados)

(Esto describe el `generarUnifilar()` que corre **adentro de
`scripts/procesar-cola.ts`** — ver la sección de arriba. Nació como
mitigación del límite de 60s de Vercel, y ese límite ya no aplica una vez
que la generación corre en el worker; se mantiene igual porque sigue
siendo una buena idea: lotes más chicos son más fáciles de que la IA
resuelva bien, y correrlos en paralelo sigue acortando el tiempo real de
espera del worker.)

Un tablero con bastantes circuitos (ej. 53) pedido entero en un solo
llamado a la IA podía superar el `maxDuration: 60` de la función
serverless y morir con `Vercel Runtime Timeout Error` — ni siquiera
cambiar a un modelo más rápido (Sonnet en vez de Opus, ver más abajo)
alcanzaba para tableros grandes reales. Partir la generación en varios
llamados más chicos **pero uno atrás del otro** no alcanza tampoco: el
tiempo de Vercel es por invocación completa de la función, así que la
suma de 7-8 llamados secuenciales de ~10s cada uno sigue superando los
60s igual de fácil. La solución real es correr los llamados **en
paralelo** (`Promise.all`), donde el tiempo total es el del lote más
lento, no la suma de todos. `generarUnifilar` (ver
`src/anthropic-client.ts`):

1. **Códigos de equipo calculados en código, no por la IA**
   (`src/codigos-equipo.ts`, mismo algoritmo ya validado en
   `informes-app/src/lib/tableros/codigos-equipo.ts`, REGLAS_UNIFILAR.md
   A3) — es mecánico, no de criterio visual, y tiene que ser consistente
   entre llamados que ni se ven entre sí, así que se calcula una sola vez
   antes de llamar a la IA.
2. **Partido en lotes sin cortar un grupo a la mitad**
   (`src/lotes.ts`, `src/tree.ts`) — cada lote es uno o más árboles de
   encadenado completos (nunca medio grupo `PD-n`), con un tope de 3
   circuitos por lote (`CIRCUITOS_POR_LOTE`) — no es el "máximo 8
   circuitos por hoja" de B2 (eso es sobre una hoja impresa final, no
   sobre cuánto puede tardar en generarse): cada circuito necesita más
   tokens de salida de lo esperado, y como correr en paralelo solo evita
   que el tiempo de los lotes se SUME (no acorta cada lote individual),
   el tope tiene que mantener a cada lote, por sí solo, bien por debajo
   de los 60s.
3. **Todos los lotes se piden a la IA al mismo tiempo** (`Promise.all`),
   cada uno dibuja SOLO su tramo (empezando en Y=0, nunca el marco/
   título/rótulo/recuadro de tierra) — el primero además dibuja la
   cabecera (B1, sin el recuadro PUESTA A TIERRA). Como los lotes no se
   ven entre sí, cada uno numera sus conductores (A4: series A/P/T)
   arrancando de 1 por su cuenta, y reporta aparte qué `Tn` usó y para
   qué destino.
4. Recién con TODOS los lotes resueltos, el código renumera los
   conductores globalmente (`renumerarConductoresGlobal` — mismo texto
   dentro de un lote = mismo número nuevo, para que un cable conserve su
   número en sus dos puntas, H8) y arma la lista completa `Tn – destino`
   para el recuadro PUESTA A TIERRA (A7).
5. Un último llamado — chico, y recién ahí sí secuencial porque necesita
   el resultado de todos los anteriores — dibuja el marco/título/rótulo/
   sello y ese recuadro de tierra ya armado y numerado (no lo renumera,
   solo lo dibuja tal cual se lo pasan).
6. El código traslada cada tramo a su posición Y real y concatena todo en
   un único `UnifilarDrawing` — el contrato externo (`POST /api/unifilar`,
   `RespuestaUnifilar`) no cambió, esto es un detalle interno.

El prompt de sistema (reglas + ejemplos enseñados, que es grande) se arma
una sola vez por generación y se marca con `cache_control` para que la API
de Anthropic no lo vuelva a procesar en cada uno de los varios llamados de
una misma generación.

Esto es distinto de la paginación en varias hojas A3 (ver "Qué falta" más
abajo) — acá se sigue armando un único dibujo continuo, solo que en varios
pedidos internos en paralelo; paginar de verdad (una hoja física por
tanda, cada una con su propio marco/rótulo) es trabajo a futuro que podría
reusar esta misma partición en lotes.

Los llamados a la IA usan `messages.stream(...).finalMessage()` en vez de
`messages.create(...)` — con el `max_tokens` grande que usan los lotes, el
SDK de Anthropic rechaza un pedido bloqueante normal (calcula que, en el
peor caso, podría tardar más de 10 minutos y exige streaming). Si en algún
runtime log aparece `Messages.create` en el stack trace del error (en vez
de algo relacionado a `stream`), significa que ese deploy quedó atrás de
este commit — hacer "Redeploy" de un deployment viejo en Vercel reconstruye
ESE commit puntual, no la punta real de la rama.

**Riesgo no probado:** varios lotes pegándole a la API de Anthropic al
mismo tiempo, con la misma clave, podría eventualmente chocar con un
límite de concurrencia/tasa de la cuenta en un tablero muy grande (muchos
lotes a la vez) — no se pudo probar en este entorno (sin API key). Si
aparece un error 429 de Anthropic con tableros grandes, ese es el motivo.

## `patch-package` — por qué está

`@react-pdf/hyphenate` (dependencia transitiva de `@react-pdf/renderer`)
tiene un `exports` roto en su `package.json`: solo declara condición
`"import"`, nunca `"require"`. En el runtime de funciones serverless de
Node.js de Vercel (que sí aplica la resolución estricta de `exports` de
Node, a diferencia de Next.js/webpack) esto hace que el bundler descarte en
silencio el archivo que importa `@react-pdf/renderer` — sin error en el
log de build — y en runtime tire `ERR_MODULE_NOT_FOUND: Cannot find module
'.../pdf-renderer.js'`. Ver `CRITERIOS_Y_IDEAS.md` §14 para el detalle
completo. El fix vive en `patches/@react-pdf+hyphenate+0.1.0.patch` +
`"postinstall": "patch-package"` en `package.json` — se reaplica solo en
cada `npm install`, incluido el de Vercel en cada deploy. No tocar
`node_modules` a mano.

## Qué falta

1. **Paginar en varias hojas A3** (B2: máximo 8 circuitos por hoja) — la
   IA todavía arma un solo dibujo continuo, sin cortar en hojas, igual que
   hacía `construirUnifilar` (no paginado) del lado de `informes-app`. El
   renderer de PDF ya soporta una sola hoja; paginar significa que la IA
   (o una pasada propia) devuelva varios `UnifilarDrawing`, uno por hoja.

El botón real ya está enganchado: `informes-app` llama a este servicio
desde "Generar unifilar" en Historial de Tableros (ver
`src/app/(app)/tableros/historial/unifilar-actions.ts` de ese repo), que
solo encola el pedido — ver "Generación asincrónica" más arriba sobre
quién genera y sube el resultado de verdad.
