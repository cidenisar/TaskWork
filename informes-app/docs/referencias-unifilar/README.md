# Referencias del unifilar de Tableros

Esta carpeta existe porque las capturas/PDF pegados en un chat se pierden
cuando la conversación se resume o cuando se abre una sesión nueva — un
archivo commiteado acá no. Antes de tocar `lib/tableros/unifilar.ts`,
`lib/dxf/writer.ts` o `lib/pdf/tablero.tsx`, revisar esta carpeta primero.

## Estándar objetivo — "TerraLogic"

- **`REGLAS_UNIFILAR.md`** — el estándar de dibujo completo que hay que
  seguir: juego de planos, formato de hoja/rótulo, códigos de equipo
  (Cnn/BNR-nn/PD-n/U-n/BT-n/CV-n/FT-n), numeración de conductores (series
  A/P/T), símbolos, capas, y las reglas de interpretación de fotos de
  tablero (Parte G). Incluye la "regla de oro": si un dato no está en el
  relevamiento, no se inventa — se dibuja `A CONFIRMAR`. Hay un plan de
  reescritura del motor de `informes-app` para seguir este estándar en
  `/root/.claude/plans/foamy-squishing-candle.md` (vive fuera del repo,
  en la sesión de Claude Code — si no está disponible, reconstruir el plan
  desde este README + el propio `REGLAS_UNIFILAR.md`).

- **`2026-10-22_referencia-objetivo_TABLERO-SECCIONAL-380V.dxf`** — DXF
  real ya dibujado siguiendo el estándar de arriba (tablero "TABLERO
  SECCIONAL 380V", relevado por fotos). Formato AC1027/R2013, generado
  con la librería Python `ezdxf`, geometría plana (sin bloques con
  atributos): LINE/CIRCLE/TEXT(UTF-8 directo)/LWPOLYLINE/HATCH/SOLID. Es
  la referencia de "cómo debería quedar" — compararlo contra lo que
  genere el motor nuevo en cada fase.

- **`fotos-tablero-seccional-380v/`** — las fotos físicas del mismo
  tablero (3 fotos de rieles + 1 de gabinete completo) y las 2 hojas del
  plano ya dibujado en PNG (`plano-hoja1-cabecera.png` = acometida,
  protección general, protector de sobretensión, bornera, tabla PUESTA A
  TIERRA; `plano-hoja2-circuitos-c01-c08.png` = circuitos C01-C08). Útil
  para validar visualmente los símbolos (Fase 4 del plan) contra el
  equipo real.

## Archivos de regresión

- `2026-10-22_antes-del-fix_TAB-2026-8682_Tablero-de-Prueba-11.pdf` — PDF
  real generado por la app (Tablero de Prueba 11, REFINERIA LUJAN DE CUYO,
  53 circuitos) que mostró el bug de truncado de texto (ver commit
  `049afdb` — "Fix: el unifilar truncaba el texto a la mitad del ancho
  real disponible"). Queda como referencia del "antes": si el truncado
  vuelve a aparecer, comparar contra este archivo.
