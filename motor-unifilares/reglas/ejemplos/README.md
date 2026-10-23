# Ejemplos enseñados

Cada archivo `.json` de esta carpeta es un caso puntual ya resuelto y
validado — algo que las reglas escritas en `REGLAS_UNIFILAR.md` no cubren
bien solo con texto (un equipo nuevo, una conexión particular), enseñado a
mano por el usuario con una imagen real (ej. una captura de AutoCAD) + una
explicación. `src/anthropic-client.ts` los carga todos y los suma al
prompt junto con las reglas — el generador los trata como "esto ya está
resuelto, dibujalo así cuando corresponda" en vez de inventar una variante
propia.

## Formato

```json
{
  "tag": "protector_sobretension_v2",
  "cuandoAplica": "Descripción corta de cuándo usar este ejemplo — qué equipo o situación es.",
  "commands": [ /* DrawCommand[], ver src/types.ts — mismas convenciones que el resto del motor */ ]
}
```

## Cómo se agrega uno nuevo

No a mano: se genera con `npm run ensenar -- <imagen> <explicación-o-archivo.txt> [tag]`
(ver `scripts/ensenar.ts`), que le manda la imagen + la explicación a Claude
junto con `REGLAS_UNIFILAR.md`, valida el `DrawCommand[]` que devuelve
exactamente igual que el generador principal, y lo escribe acá. Siempre se
revisa el DXF resultante (ver el script) antes de confirmar que el ejemplo
quedó bien, y recién después se commitea — igual criterio que las reglas.
