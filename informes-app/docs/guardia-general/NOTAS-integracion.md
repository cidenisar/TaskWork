# NOTAS de integración — Módulo Guardia General

Fase 0 (reconocimiento), completada leyendo el código real de `informes-app` (no solo nombres de archivo) y corriendo los 22 tests del motor + el caso de aceptación A contra `motor-guardia.mjs`. No escribí código de la app todavía — esto es el documento que la Fase 0 pide antes de aprobar el plan.

## 1. Motor y caso de aceptación — verificado, no solo leído

Corrí `node --test` sobre `codigo-motor/`: **22/22 verdes**. Armé las 19 participaciones de los 9 eventos de septiembre 2026 (sección 13 del HANDOFF) y las pasé por `liquidar()` real, sin tocar el motor:

```
A = 3,0 · B = 2,0 · C = 0,5 · D = 1,5 · E = 0,5 → TOTAL = 7,5
```

Coincide exacto con lo documentado. El motor se porta tal cual, como pide el encargo.

## 2. Confirmación de la sección 2.bis (leyendo el código, no nombres de archivo)

| Punto | Lo que decía 2.bis | Confirmado en el código |
|---|---|---|
| Stack | Next 16 App Router, React 19, TS, Tailwind 4, Supabase, `@react-pdf/renderer`, `exceljs`, `nodemailer`, SDK Anthropic | **Confirmado.** Además: ya construí 4+ módulos nuevos completos en esta misma rama hoy (Riesgo de Viaje, Control de Vehículo, cambios de permisos del Panel) — conozco las convenciones reales de este Next.js, no las de mi entrenamiento. `AGENTS.md` sigue avisando lo mismo para quien no venga de esta sesión. |
| Roles / guards | `src/lib/auth.ts` (`requireProfile`, `requireAdmin`, `requireAdminOrSupervisor`), SQL `is_admin()` / `is_admin_or_supervisor()` | **Confirmado**, y además agregué hoy `requireSuperusuario()` y `requirePanelAccess()` al mismo archivo. `is_admin_or_supervisor()` **ya incluye `superusuario`** (lo verifiqué con `pg_proc` en Supabase): `rol in ('admin','supervisor','superusuario')`. Así que «Administrador y supervisor» del HANDOFF = `is_admin_or_supervisor()` tal como está, sin tocarla. |
| `profiles.telefono` | Ya existe, revisar si es texto libre | **Confirmado: es `text` sin ninguna validación de formato** (migración `20260902000008`). Hoy cualquiera lo carga como quiera desde «Mi cuenta». Si Guardia depende de `wa.me/<numero>`, hay que normalizar/validar al guardar (E.164) — lo trato como trabajo nuevo, no asumido. |
| Reporte de fallas | `client_errores`, `client-error-report.ts`, `client-error-reporter.tsx`, `/api/errores/reportar`, pantalla admin | **Confirmado exacto**, código leído completo. Reutilizable tal cual con contexto `GRD-xx`. |
| Auditoría | `audit_log` + `logAudit()`, solo texto, sin valor anterior | **Confirmado** — inserta `actor_id, actor_nombre, actor_rol, accion` (texto libre), nada de antes/después. Guardia necesita sus propias tablas de historial (como ya dice el HANDOFF, sección 11). |
| Numeración | Random por módulo, ej. `RIESGO-2026-NNNN` con reintento por colisión | **Confirmado** (`src/lib/riesgo-viaje/numero-generacion.ts`: 4 dígitos random + reintento). Ningún módulo de esta app usa correlativo hoy — el pedido de Ivan de correlativo sin huecos para Guardia es **nuevo para este repo**, no una convención existente a copiar. |
| Push | No encontré nada | **Confirmado: no existe absolutamente nada** — sin `VAPID`, sin `web-push`, sin service worker, sin `manifest.json` de PWA. Se construye 100% desde cero. Es la pieza de infraestructura más grande de todo el encargo. |
| Convenciones de carpeta | `src/app/(app)/<modulo>/{nuevo,historial,editar}`, `src/components/<modulo>/`, `src/lib/<modulo>/` | **Confirmado**, es exactamente el patrón que usé hoy para Control de Vehículo y Riesgo de Viaje. |
| Diseño (tema claro/oscuro) | Pide interruptor propio, Ivan trabaja en claro | **Hallazgo nuevo, no estaba en 2.bis:** la app **no tiene ningún interruptor de tema hoy**. El CSS (`wireframe-ui.css`) ya tiene tokens para ambos (`:root` es oscuro por default, `:root[data-theme='light']` es el override), pero **ningún componente lo setea nunca** — toda la app corre siempre en oscuro. Si Guardia necesita el interruptor que pide 12.9, es trabajo nuevo que toca el shell general (`AppShell`/`PanelLayout`), no algo propio del módulo. **Pregunta para Ivan:** ¿lo construimos ahora como parte de este encargo (beneficia a toda la app), o Guardia se queda con el oscuro fijo de hoy y el interruptor se discute aparte?

## 3. Decisiones de arquitectura que tomo para armar el plan (ninguna toca código todavía)

**Dónde viven Personas/Parámetros/Feriados/Cronograma/Liquidación («oficina»):** en el **Panel de Supervisión** (`/panel/guardia/*`), no en Configuración. Motivo concreto: `Configuración` está gateada a `admin` + `superusuario` **solo** (`puedeVerConfiguracion`, sin supervisor — lo agregué/confirmé hoy mismo trabajando en el Panel). El HANDOFF (sección 4) es explícito: «Administrador y supervisor… Corregir es siempre solo de admin y supervisor». Meter esto en Configuración le niega el acceso a supervisor, que es justo a quien el encargo le da el permiso. El Panel ya tiene el gate correcto (`requireAdminOrSupervisor`/`requirePanelAccess`) y ya es la «oficina» de esta app. Dentro de esas pantallas, las dos acciones que el HANDOFF marca como **propuesta solo-admin** (cerrar período, editar parámetros — 16.8) van detrás de un chequeo `esAdmin` más estricto *dentro* de la pantalla, mismo patrón que ya usé hoy en Vehículos/Riesgo de Viaje (la pantalla la ve supervisor, el botón que corrige solo lo ve/puede admin).

**Dónde vive el circuito del evento («campo»):** `src/app/(app)/guardia/{nuevo,historial,...}`, tile propio en el home mobile — mismo patrón que every otro módulo. La pantalla «Nuevo evento» la ve cualquiera, pero solo tiene sentido/datos para quien está marcado de guardia general esa semana (igual que hoy «Dar de baja» se ve pero redirige/avisa si no corresponde).

**Mapeo de roles:** `tecnico` = guardia general o técnica (según `guardia_persona.area`); `supervisor`/`admin`/`superusuario` = oficina, vía `is_admin_or_supervisor()` ya existente. No creo un rol nuevo.

## 4. Lo que falta para no seguir a ciegas (de la sección 16, lo que bloquea el DISEÑO del esquema — el resto lo tomo con el default documentado y lo anoto como parámetro, sin preguntar de nuevo)

Estas tres sí cambian cómo diseño las tablas, así que las pregunto ahora en vez de adivinar y tener que migrar de nuevo:

1. **16.8 — ¿Cerrar período y editar parámetros es solo-admin, o admin+supervisor como el resto de «oficina»?** Default que usaría si no contestás: solo admin (como propone el HANDOFF).
2. **16.11 — ¿Los eventos de Guardia van con numeración correlativa sin huecos (como pediste en otras apps), o el patrón aleatorio que ya usa el resto de esta app?** Esto es una pieza de infraestructura nueva (contador transaccional) que no existe en ningún otro módulo — vale la pena confirmarlo antes de construirlo.
3. **16.9 — Cómo se corrige un período ya cerrado.** Dijiste que lo discutimos aparte: lo dejo afuera de las Fases 1-6 y lo encaro cuando lo charlemos, pero necesito saber si eso bloquea el cierre de el primer período real (Fase 7) o no.

Todo lo demás de la sección 16 (zona horaria, orden de rotación, quién registra cambios, técnico que no contesta, grupo de WhatsApp, feriados) lo tomo con el default que ya recomienda el propio HANDOFF, como parámetro editable, y lo anoto en el código para no perderlo.

## 5. Plan por fases (igual a la sección 14 del HANDOFF, con lo de arriba ya decidido)

0. **Este documento.** ← estamos acá, esperando tu aprobación.
1. **Núcleo** (`src/lib/guardia/motor.ts` portado tal cual + sus 22 tests, en centésimas enteras como pide la sección 6; funciones de cronograma `diaGuardia/inicioSemana/guardiaDe/generarProgramacion/regenerarDesde/cambioVigente` con tests de 7.1–7.6; parámetros con historial). Sin UI, sin tablas todavía. Vuelvo a mostrarte el caso de aceptación A en 7,5 con el motor ya viviendo en el repo.
2. **Datos + servidor + permisos**: migraciones de la sección 11 (con RLS desde el día uno, checklist SELECT/INSERT/UPDATE/DELETE de `CRITERIOS_Y_IDEAS.md` §3), endpoints con reloj de servidor/versión/idempotencia, un test por rol de lo que NO puede.
3. **Oficina** (`/panel/guardia/*`): Personas, Parámetros, Feriados/Calendario, Cronograma.
4. **Móvil** (`/guardia/*`): circuito completo, Mis horas, tarjetas de aviso.
5. **Notificaciones**: outbox + Web Push (VAPID, `web-push`, nunca Firebase — `CRITERIOS_Y_IDEAS.md` §6), después WhatsApp individual (`wa.me`, nunca una API de WhatsApp).
6. **Liquidación**: pantalla, CSV (`;`), cierre de período congelado, reporte de fallas, listas acotadas con corte por año.
7. **Prueba con tus 2–3 eventos reales** de un mes ya liquidado, contra tu Excel.

Cada fase termina con tests verdes y mostrándote exactamente lo que vas a ver al abrir, sin configurar nada antes — como pide el encargo.

---

## 6. Fase 1 — hecha (9/11/2026)

Decisiones de la sección 4 ya confirmadas por Ivan: **1)** cerrar período y editar parámetros = admin **+ supervisor** (no solo admin — ajusta el default propuesto); **2)** numeración de eventos **correlativa sin huecos** (se implementa en la Fase 2, es una pieza de base de datos — un contador transaccional, no hay nada "puro" que testear sin tabla); **3)** el interruptor de tema claro/oscuro se construye **para toda la app**, no solo para Guardia (queda anotado para la Fase 3/4, toca `AppShell`/`PanelLayout`, no es parte del núcleo).

**Qué se armó**, sin UI, sin tablas — solo lógica pura y sus tests:

- `src/lib/guardia/motor.ts` — el motor de activaciones portado del `.mjs` de referencia, en TypeScript, con el resultado en **centésimas enteras** (50/100) en vez de "medias" (1/2), como pide el HANDOFF §6.
- `src/lib/guardia/motor.test.ts` — los 22 tests originales portados (adaptando los números esperados a centésimas) **+ 1 test nuevo** con el caso de aceptación A completo (los 9 eventos reales de septiembre 2026): **42 total entre los dos archivos, los 42 en verde.**
- `src/lib/guardia/cronograma.ts` — `diaGuardia`, `inicioSemana`, `finSemana`, `semanasDelAnio`, `listaArea` (con orden de rotación editable, §16.7), `guardiaSemana`, `cambioVigente`, `guardiaDe`, `generarProgramacion`, `regenerarDesde`. A diferencia del prototipo (que muta un estado global), estas son funciones **puras**: reciben el cronograma actual y devuelven uno nuevo, nunca mutan — más fácil de testear y de razonar desde un server action.
- `src/lib/guardia/cronograma.test.ts` — 19 tests de los escenarios de §7.1–7.6: el miércoles antes/después de las 10:00, un cambio aceptado que gana sobre el cronograma, uno pendiente que NO rige, el último cambio que se superpone gana, generar programación anual sin pisar lo cargado, 2027 continuando la rotación de 2026, "Todas" las áreas, regenerar desde la semana que viene sin tocar el pasado, área sin gente que no rompe.

**Hallazgo al portar, no al leer:** la primera versión de `absoluto()` tenía un bug de desestructuración (un corrimiento de índice que hacía que CADA fecha se interpretara mal) — lo encontré porque 21 de los 22 tests fallaron apenas los corrí. Si hubiera "portado y confiado" sin corporizar los tests, el motor hubiera quedado roto en silencio. Por eso el orden del encargo (núcleo + tests ANTES de cualquier pantalla) importa en la práctica, no solo en la teoría.

**Dependencia nueva, como corresponde avisar:** agregué `tsx` (devDependency) para poder correr tests en TypeScript con `node --test` sin compilar — esta app no tenía ningún test ni test runner hasta ahora. Cero dependencias en producción (`tsx` no entra al build de Next, solo lo usa `npm test`). Quedó un script `npm test` en `package.json`.

**Para ver que corre:** `npm test` desde `informes-app/` (42/42 verdes). `npm run typecheck` y `npm run lint` también limpios con estos archivos.

**No toqué nada más** — ni tablas, ni rutas, ni el resto de la app. Antes de seguir a la Fase 2 (datos + servidor + permisos, con los roles ya confirmados), aviso y muestro esto.

## 7. Fase 2 — hecha (9/11/2026)

Datos + servidor + permisos (HANDOFF §11 y §5), con las dos decisiones de Ivan ya aplicadas en el esquema: cerrar período y editar parámetros = **admin + supervisor** (`is_admin_or_supervisor()`, igual que el resto de "oficina"), y numeración de eventos **correlativa sin huecos** (contador transaccional, ver abajo). Sin pantallas todavía — eso es la Fase 3/4.

**Migración** `supabase/migrations/20261109010000_guardia_general_nucleo_datos.sql`, aplicada al proyecto real (`oyhmoeqplifvbdktdwbm` "Informes"):

- `guardia_persona` (+ `_hist`) — quién hace qué guardia, no altera `profiles`. "Guardia general" y "técnico de área" **no son un `rol` nuevo**: son filas de esta tabla (`area = 'General'` vs. `'Infraestructura'/'Datos'/'Enlaces'`); sin fila = sin guardia. `profiles.rol` sigue con sus 4 valores de siempre.
- `guardia_config` — parámetros de negocio, **singleton** (mismo patrón que `config_general`, no una tabla clave/valor genérica — el HANDOFF sugería la genérica, pero esta app ya tiene su propia convención y la reusé). Con `_hist` para el valor anterior (`audit_log` no lo guarda).
- `guardia_feriado` (+ `_hist`), `guardia_cronograma_semana` (+ `_hist`), `guardia_cambio`, `guardia_asuncion` — el resto del modelo de §7 y §10, con RLS desde el día uno.
- `guardia_contador` + función `guardia_crear_evento(...)` — la numeración correlativa **sin huecos** que pidió Ivan: no es una `SEQUENCE` de Postgres (esa sí deja huecos si la transacción se revierte), es una tabla contador **sin ninguna policy** (ningún cliente la toca directo) más una función `SECURITY DEFINER` que incrementa el contador, crea el evento, la primera participación y la primera novedad, todo en una sola transacción — si algo falla, no sube el número.
- `guardia_evento`, `guardia_participacion`, `guardia_novedad`, `guardia_correccion`, `guardia_periodo_cierre` — el circuito del evento (§5). `version` entero en evento y participación (bloqueo optimista, §12.4: "dos personas editando lo mismo"). `idempotencia_key` único en participación y novedad (§12.3: un pedido repetido por mala señal de celular no duplica la fila).

**Permisos**, `src/lib/guardia/permisos.ts` + `permisos.test.ts` — helpers puros (`puedeRegistrarLlamada`, `puedeActivarGuardiaTecnica`, `puedeCerrarEvento`, `puedeCorregir`, `puedeCerrarPeriodo`, `puedeEditarParametros`, `puedeGestionarCronograma`, etc.), con el test por rol que pide el encargo: qué NO puede hacer un técnico de área, qué NO puede hacer la guardia general (nada de "oficina", aunque sea quien registró la llamada), que admin/supervisor/superusuario pueden todo lo de oficina. Esto es defensa en profundidad — RLS en la base es la que realmente bloquea, estos helpers son para que la UI de la Fase 3/4 no muestre botones que el servidor igual va a rechazar.

**Reloj de servidor**, `src/lib/guardia/reloj.ts` — `horaGuardiaIso()` convierte el UTC real del servidor a hora de pared de Argentina (America/Argentina/Buenos_Aires, parámetro pendiente de confirmar si hace falta otra zona — HANDOFF §16.6). Ninguna acción recibe una hora del cliente: inicio y fin de cada participación siempre los pone el servidor.

**Server actions del circuito del evento** (§5), con verificación de rol en el servidor en cada una (nunca se confía en lo que manda el cliente):

- `src/app/(app)/guardia/nuevo/actions.ts` → `crearEventoAction` — única puerta de entrada, llama a `guardia_crear_evento()`.
- `src/app/(app)/guardia/actions.ts` → `activarGuardiaTecnicaAction` (resuelve quién está de guardia AHORA por área con `guardiaDe()`, no activa nada en un área sin nadie asignado y lo avisa en vez de romper), `aceptarActivacionAction`, `noContestaAction` (cierra la fila original como `no_contesto` y abre una nueva para la persona siguiente), `agregarNovedadAction` (con `idempotenciaKey` opcional), `terminarParticipacionAction`, `cerrarEventoAction` (cierra las participaciones que quedaron abiertas y el evento, con un novedad final "Evento cerrado.").

**Para ver que corre:** `npm test` (52/52 verdes), `npm run typecheck` y `npm run lint` limpios, `next build` sin errores. Sin páginas nuevas todavía — por eso no aparecen rutas nuevas en el build; `/guardia/nuevo` y `/guardia` hoy solo tienen `actions.ts`, la pantalla es la Fase 4.

**Deliberadamente NO armado en esta fase** (queda para cuando se construya su pantalla, Fase 3/4/5/6, no antes): `guardia_notificacion` (outbox de avisos), server actions de cronograma (generar/editar/regenerar), cambios de guardia (crear/aceptar/rechazar/anular), asunción semanal, edición de parámetros, marcar feriados desde oficina, cierre de período, liquidación/CSV, reporte de fallas específico de este módulo.

**No toqué nada fuera de este módulo.** Antes de seguir a la Fase 3 (pantallas de oficina: Personas, Parámetros, Feriados/Calendario, Cronograma, bajo `/panel/guardia/*`), aviso y muestro esto.

## 8. Fase 3 — hecha (9/11/2026)

Las cuatro pantallas de oficina bajo `/panel/guardia/*` (hub + Personas + Parámetros + Calendario + Cronograma/Cambios), todas detrás de `requireAdminOrSupervisor()` en un `layout.tsx` propio — un técnico, aunque sea la guardia general, no entra. Entrada nueva "Guardia General" en el sidebar del Panel (`PanelNav`, junto a Estadísticas/Configuración — no dentro de Configuración, que excluye a Supervisor). Sin migración nueva: las tablas y el RLS de estas pantallas ya estaban en la migración de la Fase 2, solo faltaba tipar en `database.types.ts` las que no había tocado todavía (`guardia_persona_hist`, `guardia_config_hist`, `guardia_feriado`, `guardia_feriado_hist`, `guardia_cronograma_hist`, `guardia_cronograma_semana`, `guardia_cambio`) — lo encontré porque TypeScript tiraba `'campo' does not exist in type 'never[]'` en cuanto intenté insertar en una tabla no tipada, no porque lo haya recordado de antes.

**Interruptor de tema claro/oscuro para toda la app** (decisión de Ivan del 9/11, adelantada de donde la había anotado — "Fase 3/4" — a ahora, que es cuando se tocan los shells): `src/components/theme-toggle.tsx`, con un script inline en `layout.tsx` que aplica el tema guardado ANTES del primer render (evita el parpadeo). No fue necesario tocar la hoja de estilos — `wireframe-ui.css` ya tenía los tokens de `[data-theme='light']` desde antes (hallazgo de la Fase 0: estaban armados pero nada los activaba). Botón en el `AppShell` (móvil) y en el pie del sidebar del Panel.

- **Personas** (`/personas`) — selector Sin guardia/General/Infraestructura/Datos/Enlaces + orden de rotación, por cada técnico activo. Al cambiar a alguien, `asignarPersonaDeGuardiaAction` reescribe el cronograma desde la semana que viene (`regenerarDesde`) para el área que deja y la que entra, con historial de cada celda tocada — lo pasado y la semana en curso no se mueven. Aviso si alguien de guardia no tiene teléfono de WhatsApp cargado.
- **Parámetros** (`/parametros`) — horarios en HH:MM, valores de media/entera en decimal (se guardan en centésimas enteras), hora de cambio de guardia, período de liquidación; un campo por vez, con historial completo abajo (quién, cuándo, antes, después). La regla de "no mover un período cerrado" queda anotada en el código como el lugar exacto donde hay que enganchar el bloqueo cuando se construya el cierre de período (Fase 6) — todavía no hay períodos cerrados, así que no hay nada que bloquear hoy.
- **Calendario** (`/calendario`) — vista mensual lunes a domingo, navegación por mes/año, las cuatro guardias por día (con `↔` si hay un cambio aceptado vigente ese día), fin de semana atenuado, día actual con borde, feriado marcado en rojo / feriado nacional sin marcar en amarillo, marcar/quitar feriado por día. Lista de feriados nacionales precargados (`src/lib/guardia/feriados-argentina-2026-2027.json`, copia de la referencia del traspaso) con "Marcar los N sin marcar" y "Marcar" por fila — con la advertencia de la fuente (notas periodísticas, no decreto oficial) visible en la pantalla, no solo en un comentario.
- **Cronograma** (`/cronograma`) — por año (2026-2028) y área: generar programación anual (`generarProgramacionAction`, reusa el `generarProgramacion()` puro de la Fase 1, con "pisar lo ya cargado" opcional), tabla de las 52 semanas con selector editable por semana (marca la semana actual), y Cambios de guardia: alta con validaciones (fechas obligatorias, no la misma persona, devolución opcional y posterior) y anulación. **Decisión de alcance, anotada en el código, no inventada:** un cambio queda "Pendiente" hasta que quien tiene que cubrir lo acepte desde su celular — esa pantalla (HANDOFF §7.5/§7.6, "Asumo la guardia") es Fase 4, todavía no existe, así que por ahora un cambio recién creado no rige el cronograma real hasta que se construya ese circuito. Se dice así, en la pantalla, en vez de simular una aceptación automática que el HANDOFF no pidió.

**Para ver que corre:** `npm test` (54/54 verdes — 2 tests nuevos de `celdasCambiadas`), `npx tsc --noEmit` y `npx eslint .` limpios (solo quedan avisos preexistentes de otros módulos, ninguno de Guardia General), `next build` sin errores — las 5 rutas nuevas aparecen en la lista de rutas del build.

**Deliberadamente NO armado en esta fase** (Fase 4/5/6, no antes): pantallas móviles del circuito del técnico (incluida "Asumo la guardia" y la respuesta Asumo/No puedo de un cambio), notificaciones (push + outbox), liquidación y cierre de período, reporte de fallas específico del módulo, listas paginadas de eventos (hoy no hay tantos eventos todavía como para necesitarlo).

**No toqué nada fuera de este módulo ni de los shells compartidos que el interruptor de tema necesitaba tocar.** Antes de seguir a la Fase 4 (pantallas móviles del circuito del técnico), aviso y muestro esto.
