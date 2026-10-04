# Memoria compartida entre proyectos de este repo

Antes de arrancar trabajo nuevo (un bug, una feature, una decisión de
arquitectura), revisar `CRITERIOS_Y_IDEAS.md` — son criterios y
aprendizajes reales, juntados de varias apps (Informes, Via-Cash, el
Sistema de emergencias de refinería), pensados para servir en cualquier
proyecto nuevo, no solo en el que salieron.

**Ese archivo no está en esta branch** — vive en `main` (que desde
2026-10-04 es el contenido del proyecto Informes, pensado como branch
principal del repo). Esta branch (`emergencias-refineria`) es el proyecto
del Sistema de emergencias de refinería, aparte. Para encontrar el
archivo:
```
git fetch origin main
git show origin/main:CRITERIOS_Y_IDEAS.md
```
o simplemente traerlo a esta branch (`git checkout origin/main --
CRITERIOS_Y_IDEAS.md`) si se lo va a editar seguido desde acá, en vez de
ir a buscarlo cada vez.

Si en el camino aparece un bug real, un hallazgo de seguridad, un patrón
reusable o una decisión de arquitectura que valga la pena para la
**próxima** app (no solo para la actual), agregarlo a `CRITERIOS_Y_IDEAS.md`
— no crear un documento de "lecciones" nuevo por proyecto ni por branch.
Si se edita desde esta branch sin tener el archivo acá, traerlo primero
(ver arriba) para no perder lo que ya tiene.

Este mismo archivo también se referencia desde el repo `cidenisar/via-cash`
(ver su `CLAUDE.md`) — es un solo lugar compartido entre proyectos y
repos, no una copia por repo/branch.
