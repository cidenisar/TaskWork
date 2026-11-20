Vas a construir el módulo «Guardia General» dentro de `informes-app/` (repo TaskWork), la app de informes de TerraLogic. Trabajá en la rama `claude/guardia-general-traspaso` (sale de la rama por defecto del repo).

Leé primero, en este orden y completos:
1. informes-app/docs/guardia-general/HANDOFF-guardia-general.md
2. informes-app/docs/guardia-general/codigo-motor/motor-guardia.mjs y motor-guardia.test.mjs
Después abrí informes-app/docs/guardia-general/prototipo/guardia-general-prototipo.html en el navegador y recorré el circuito (botón «Simular llamada de operación central»; en la oficina: Cronograma, Calendario, Personas, Parámetros).

Reglas del encargo:
1. FASE 0 primero, sin escribir código: la sección 2.bis del HANDOFF trae un reconocimiento preliminar hecho leyendo nombres de archivo; **confirmalo y completalo leyendo el código** (stack, roles y funciones SQL, `profiles.telefono`, reporte de fallas, auditoría, numeración, push, sistema de diseño). Leé también `AGENTS.md` (este Next.js no es el que conocés: leé `node_modules/next/dist/docs/`) y el `CRITERIOS_Y_IDEAS.md` de la raíz del repo (§3, §4, §6, §26–§28). Escribí NOTAS-integracion.md con lo que encontraste y un plan por fases (sección 14 del documento). Después DETENETE y esperá que Ivan lo apruebe. No sigas sin esa aprobación.
2. Orden de trabajo: núcleo y pruebas de aceptación primero, sin interfaz. Portá el motor tal cual con sus 22 tests y agregá tests para el cronograma (sección 7). El caso de aceptación A de la sección 13 tiene que dar 7,5 activaciones (A 3,0 · B 2,0 · C 0,5 · D 1,5 · E 0,5).
3. Lo que no está decidido (sección 16, «Siguen abiertas») no lo inventes: usá el default que está ahí, dejalo como parámetro y anotá la decisión pendiente en NOTAS-integracion.md.
4. Las reglas viven en el servidor; el rol se verifica en cada pedido, nunca por app ni por dispositivo; escribí un test por rol de lo que ese rol NO puede hacer. Corregir (horas, hora de llamada, cronograma, cambios, feriados, personas) es siempre solo de administrador y supervisor.
5. Parámetros de negocio en pantalla con historial (quién, cuándo, antes, después); un cambio vale hacia adelante y nunca mueve un período cerrado. Nada de horarios, valores ni la hora de cambio de guardia clavados en el código.
6. Reporte de fallas desde el principio (sección 12.6). Listas acotadas de a 30 con «ver más» y corte por año (12.7). Íconos en escritorio, palabras en móvil (12.8). Respetá el sistema de diseño de la app de informes.
7. WhatsApp: no hay número de empresa. Se usa el teléfono de cada usuario y enlaces wa.me que abre quien dispara el aviso; el aviso garantizado es el push (sección 9). No integres APIs de WhatsApp.
8. No agregues dependencias sin decirlo (la de push, `web-push`, es esperable: avisá). No toques nada de `informes-app` fuera de lo que este módulo necesita ni las otras carpetas del repo (`backend-server`, `consola-simulador`, `motor-unifilares`). Las migraciones SQL van en `informes-app/supabase/migrations/` con RLS desde el principio.
9. Al terminar cada fase: mostrale a Ivan lo mismo que va a ver al abrir, sin configurar nada antes, y decí qué cambió y qué no se ve. No digas que algo funciona sin haberlo comprobado.
