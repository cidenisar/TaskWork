# Memoria compartida entre proyectos de este repo

Antes de arrancar trabajo nuevo (un bug, una feature, una decisión de
arquitectura) en cualquier proyecto de este repo (`informes-app/`,
`backend-server/`, `consola-simulador/`, o cualquier otro que viva en otra
branch), revisar `CRITERIOS_Y_IDEAS.md` en esta misma carpeta raíz — son
criterios y aprendizajes reales, juntados de varias apps (Informes,
Via-Cash, el Sistema de emergencias de refinería), pensados para servir en
cualquier proyecto nuevo, no solo en el que salieron.

Si en el camino aparece un bug real, un hallazgo de seguridad, un patrón
reusable o una decisión de arquitectura que valga la pena para la
**próxima** app (no solo para la actual), agregarlo ahí mismo, en la
sección que corresponda — no crear un documento de "lecciones" nuevo por
proyecto ni por branch. Si la sección que corresponde no existe todavía,
crearla.

Este mismo archivo (`CRITERIOS_Y_IDEAS.md`) se referencia también desde el
repo `cidenisar/via-cash` (ver su `CLAUDE.md`) — es un solo lugar
compartido entre los dos repos, no una copia por repo. Si se agrega algo
nuevo desde una sesión que solo tiene uno de los dos repos adjunto, está
bien agregarlo ahí: no hace falta sincronizar manualmente, el próximo que
lo necesite lo va a buscar en este archivo.
