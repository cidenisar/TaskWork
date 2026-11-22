# Cómo pasar esto a Claude Code

## Ya está subido (si lo hizo Claude desde la conversación)
El paquete está en el repo **TaskWork**, rama **`claude/guardia-general-traspaso`**, carpeta **`informes-app/docs/guardia-general/`**, y la sección de reglas ya está agregada al final de **`informes-app/CLAUDE.md`**.
1. Abrí Claude Code (en el celular: app de Claude o claude.ai/code).
2. Elegí el repositorio **cidenisar/TaskWork** y la rama **`claude/guardia-general-traspaso`**.
3. Pegá el contenido de **`PROMPT-INICIAL.md`**. Empieza por la **Fase 0** (confirmar el reconocimiento de la app, sin escribir código) y se detiene a esperar tu aprobación del plan.

## Si lo hacés a mano desde la computadora
1. Copiá esta carpeta a `informes-app/docs/guardia-general/` del repo.
2. Pegá `CLAUDE-seccion-guardia.md` al final de `informes-app/CLAUDE.md` (no lo reemplaces).
3. Abrí Claude Code en el repo y pegá `PROMPT-INICIAL.md`.

## Qué hay en la carpeta
| Archivo | Para qué |
|---|---|
| `HANDOFF-guardia-general.md` | El encargo completo (sección 2.bis: lo que ya se sabe de la app de informes) |
| `PROMPT-INICIAL.md` | Lo que se pega en Claude Code para arrancar |
| `CLAUDE-seccion-guardia.md` | Reglas permanentes del módulo |
| `prototipo/guardia-general-prototipo.html` | Prototipo funcional (abrilo en el navegador). Referencia de pantallas y circuito, **no** es el código final |
| `prototipo/prueba-de-humo-prototipo.js` | 86 comprobaciones del prototipo (`npm i jsdom && node prueba-de-humo-prototipo.js`) |
| `codigo-motor/` | Motor de cálculo + 22 tests (`node --test`). Se porta tal cual |
| `referencia/` | Feriados 2026-2027 (validar contra fuente oficial) y tu nota manuscrita original |

## Tené a mano (Claude Code te los va a preguntar)
- Quién puede cerrar período, editar parámetros y gestionar personas (propuesto: solo administrador).
- Las preguntas abiertas de la sección 16 del documento: quién registra los cambios de guardia, si son por semana o por días, y qué pasa si el técnico no contesta.
- Que los **teléfonos** de cada persona de guardia estén cargados en su perfil, con código de país.
- Si los eventos de guardia llevan numeración correlativa sin huecos (lo que pediste en otras apps) o el número aleatorio que usa hoy esta app.
- 2 o 3 **eventos reales de un mes ya liquidado** (con tu planilla) para la prueba final contra el Excel.
