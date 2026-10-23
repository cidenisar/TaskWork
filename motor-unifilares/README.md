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

`informes-app` (o cualquier otro cliente) manda un `POST /api/unifilar`:

```json
{
  "circuitos": [ /* UnifilarCircuito[], ver src/types.ts */ ],
  "rotulo": { "sitio": "...", "tablero": "...", "cliente": "...", "contratista": "...", "fecha": "...", "realizo": "...", "numeroGeneracion": "..." }
}
```

con el header `X-Anthropic-Api-Key: <clave>` — **este servicio no tiene su
propia clave de Anthropic**, usa la de quien llama. De paso, eso filtra
quién puede usarlo (solo quien tenga una clave válida), que es el criterio
de acceso elegido por ahora.

Responde:

```json
{ "dxfBase64": "...", "pdfBase64": "..." }
```

El PDF es una sola hoja A3 apaisada (sin paginar todavía — ver "Qué falta"
abajo), con el mismo `DrawCommand[]` que el DXF, renderizado con
`@react-pdf/renderer` (mismo mapeo a `<Svg>`/`<Text>` que ya usa
`informes-app`, así los dos formatos se ven iguales). Este servicio
**nunca sube nada a storage**: el que llama se queda con los bytes y
decide qué hacer con ellos (en `informes-app` sería subirlos a Supabase
Storage, igual que ya hace con las fotos).

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
ya fija `maxDuration: 60` (el máximo del plan gratis — una generación de
un tablero grande puede acercarse a ese límite; si algún día un tablero
real lo supera, ahí se evalúa pasar a Vercel Pro, que sube el tope a 300s,
antes que mover el servicio a otra plataforma) y fuerza a incluir
`reglas/` en el bundle de cada función.

Variables de entorno (en el proyecto de Vercel, Settings → Environment
Variables):

- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — para guardar/leer los
  ejemplos enseñados (`GET /`, `GET /api/ejemplos`, `POST /api/ejemplos*`).
  Usar la **service role key** del proyecto de Supabase de `informes-app`
  (Settings → API → Project API keys → `service_role`, **nunca** la
  `anon`/pública) — sin estas dos variables, esos endpoints responden un
  error claro en vez de romper el resto del servicio.
- No hace falta `ANTHROPIC_API_KEY` acá — viaja por request (header
  `X-Anthropic-Api-Key`), no por entorno, tanto en `/api/unifilar` como en
  los endpoints de enseñar.
- `PORT` solo aplica al server local (`src/server.ts`), Vercel no lo usa.

Una vez desplegado, la URL que te da Vercel para este proyecto es la que
va en `MOTOR_UNIFILARES_URL` del lado de `informes-app`.

## Qué falta

1. **Paginar en varias hojas A3** (B2: máximo 8 circuitos por hoja) — la
   IA todavía arma un solo dibujo continuo, sin cortar en hojas, igual que
   hacía `construirUnifilar` (no paginado) del lado de `informes-app`. El
   renderer de PDF ya soporta una sola hoja; paginar significa que la IA
   (o una pasada propia) devuelva varios `UnifilarDrawing`, uno por hoja.

El botón real ya está enganchado: `informes-app` llama a este servicio
desde "Generar unifilar" en Historial de Tableros (ver
`src/app/(app)/tableros/historial/unifilar-actions.ts` de ese repo) y
sube el DXF/PDF que devuelve a Supabase Storage.
