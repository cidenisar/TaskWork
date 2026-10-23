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
real (ej. una captura de AutoCAD) + una explicación corta:

```bash
ANTHROPIC_API_KEY=... npm run ensenar -- foto.jpg "cómo se conecta esto..." [tag-opcional]
```

Esto le pide a Claude que convierta la imagen + la explicación en un
fragmento de `DrawCommand[]` reusable, lo valida igual que el generador
principal, y lo guarda en `reglas/ejemplos/<tag>.json` (ver el README de
esa carpeta). El script también escribe un DXF de previsualización en
`/tmp` para confirmar visualmente que quedó bien antes de commitear. Desde
ese momento, cada ejemplo guardado se suma automáticamente al prompt de
`generarUnifilar()` junto con las reglas — no hace falta tocar código.

## Cómo correrlo

```bash
npm install
npm run dev       # tsx watch, recarga en caliente
# o
npm run build && npm start
```

Variable de entorno: `PORT` (default 8787). No hace falta `ANTHROPIC_API_KEY`
acá — viaja por request, no por entorno.

## Qué falta (en orden)

1. **Paginar en varias hojas A3** (B2: máximo 8 circuitos por hoja) — la
   IA todavía arma un solo dibujo continuo, sin cortar en hojas, igual que
   hacía `construirUnifilar` (no paginado) del lado de `informes-app`. El
   renderer de PDF ya soporta una sola hoja; paginar significa que la IA
   (o una pasada propia) devuelva varios `UnifilarDrawing`, uno por hoja.
2. **Enganchar el botón real en `informes-app`** — hoy el PDF de
   relevamiento no genera ningún unifilar (ver el commit que lo sacó); el
   plan es un botón nuevo que llame a este servicio y suba lo que devuelva.
