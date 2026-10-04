# Memoria compartida entre proyectos de este repo

Antes de arrancar trabajo nuevo (un bug, una feature, una decisión de
arquitectura), revisar `CRITERIOS_Y_IDEAS.md` — son criterios y
aprendizajes reales, juntados de varias apps (Informes, Via-Cash, el
Sistema de emergencias de refinería), pensados para servir en cualquier
proyecto nuevo, no solo en el que salieron.

**Ese archivo no está en esta branch** (esta branch — `claude/
emergencias-backend-e2e-j71sgc` — es la que tiene el código del Sistema de
emergencias de refinería, pero el archivo de criterios se escribió desde
otra branch de este mismo repo: `claude/proyecto-informes-9l1n2g`, la del
proyecto Informes). Para encontrarlo:
```
git fetch origin claude/proyecto-informes-9l1n2g
git show origin/claude/proyecto-informes-9l1n2g:CRITERIOS_Y_IDEAS.md
```
o simplemente hacer merge de esa branch a esta si se quiere tener el
archivo real acá, en vez de ir a buscarlo cada vez.

Si en el camino aparece un bug real, un hallazgo de seguridad, un patrón
reusable o una decisión de arquitectura que valga la pena para la
**próxima** app (no solo para la actual), agregarlo a `CRITERIOS_Y_IDEAS.md`
— no crear un documento de "lecciones" nuevo por proyecto ni por branch.
Si se edita desde esta branch sin tener el archivo acá, traerlo primero
(ver arriba) para no perder lo que ya tiene.

Este mismo archivo también se referencia desde el repo `cidenisar/via-cash`
(ver su `CLAUDE.md`) — es un solo lugar compartido entre proyectos y
repos, no una copia por repo/branch.
