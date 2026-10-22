# Referencias del unifilar de Tableros

Esta carpeta existe porque las capturas/PDF pegados en un chat se pierden
cuando la conversación se resume o cuando se abre una sesión nueva — un
archivo commiteado acá no. Antes de tocar `lib/tableros/unifilar.ts`,
`lib/dxf/writer.ts` o `lib/pdf/tablero.tsx`, revisar esta carpeta primero.

## Archivos

- `2026-10-22_antes-del-fix_TAB-2026-8682_Tablero-de-Prueba-11.pdf` — PDF
  real generado por la app (Tablero de Prueba 11, REFINERIA LUJAN DE CUYO,
  53 circuitos) que mostró el bug de truncado de texto (ver commit
  `049afdb` — "Fix: el unifilar truncaba el texto a la mitad del ancho
  real disponible"). Queda como referencia del "antes": si el truncado
  vuelve a aparecer, comparar contra este archivo.

## Pendiente

- Falta la referencia de "cómo debería quedar" (captura/PDF de una sesión
  anterior, fuera de este repo, que el usuario consideró satisfactoria).
  Esa referencia todavía no se recuperó — si el usuario la vuelve a pasar,
  guardarla acá con un nombre tipo `AAAA-MM-DD_referencia-objetivo_<detalle>.pdf`
  y actualizar esta lista.
