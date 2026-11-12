# Traspaso a Claude Code — Módulo «Guardia General» dentro de la app de informes

Fecha del traspaso: 9/11/2026 · Dueño y superusuario: Ivan Denisar (TerraLogic)
Idioma de la app y de los textos: español rioplatense.

> **Cómo usar este documento.** Es el encargo completo. Lo que dice acá y lo que hace el prototipo (`prototipo/guardia-general-prototipo.html`) es la fuente de verdad del **comportamiento**; el motor (`codigo-motor/`) y sus 22 tests son la fuente de verdad de las **reglas de cálculo**. Si algo de este documento contradice al prototipo, avisá a Ivan antes de decidir. Lo que no está acá ni en el prototipo **no está decidido**: preguntalo (ver sección 16), no lo inventes.

---

## 0. Contenido del paquete

| Archivo | Qué es | Cómo se usa |
|---|---|---|
| `HANDOFF-guardia-general.md` | Este documento | Leer entero antes de tocar nada |
| `prototipo/guardia-general-prototipo.html` | Prototipo funcional de una sola pieza (móvil + oficina sobre los mismos datos, con el circuito completo andando). HTML/JS sin dependencias. Abrilo en el navegador | Referencia de **comportamiento y pantallas**. **No es el molde del código final** (el criterio de Ivan: el prototipo sirve para discutir, el código final separa núcleo, móvil, oficina y servidor) |
| `prototipo/prueba-de-humo-prototipo.js` | 86 comprobaciones del circuito completo sobre el prototipo (jsdom) | `npm i jsdom && node prueba-de-humo-prototipo.js`. Sus escenarios son los **casos de aceptación** (sección 13) |
| `codigo-motor/motor-guardia.mjs` + `.test.mjs` | Motor de cálculo de activaciones, sin dependencias, 22 tests verdes | `node --test`. Es el **núcleo** a portar tal cual |
| `referencia/feriados-argentina-2026-2027.json` | Feriados nacionales cargados (con advertencias de fuente) | Semilla de la tabla de feriados |
| `referencia/nota-manuscrita-cronograma.jpg` | Foto de la nota original de Ivan (cronograma anual, intercambios) | Referencia del pedido |

---

## 1. Qué se está construyendo y por qué

TerraLogic tiene una **guardia general** (la que atiende las llamadas de alarma crítica y decide) y **guardias técnicas** (infraestructura, datos, enlaces) que se activan cuando hace falta. Hoy todo se hace con teléfono, un grupo de WhatsApp y una planilla de Excel donde se anotan las horas extras por activación. Se quiere **reemplazar el Excel y ordenar el circuito**: registrar cada evento, avisar a quien corresponde, calcular las activaciones por persona y por día, y manejar el cronograma de guardias.

**Dónde vive:** como módulo dentro de la **app de informes** (app de TI de informes técnicos, con dictado por voz). Las personas son **los usuarios de esa app**; en la guardia se marca quién hace cuál.

**Fuera de alcance (Ivan dijo «para más adelante»):**
- Integrar el **mail corporativo** como origen de eventos (el circuito ya no empieza con un mail).
- **Vincular con el sistema de tickets**: hoy incidencia/ticket/tarea de cambio es un campo de texto.
- Cualquier cambio a la app de informes **fuera** de lo que este módulo necesita.

---

## 2. Primer paso obligatorio: reconocer la app de informes (Fase 0, sin escribir código)

No asumí el stack, el login, ni el diseño de la app de informes: **no los conozco**. Antes de planificar, leer el repositorio y dejar por escrito (en un `NOTAS-integracion.md`) lo que sigue; si algo no se puede determinar, preguntar a Ivan:

1. Stack y estructura (frontend, backend, base de datos, hosting, cómo se despliega).
2. Cómo funciona el **login y los roles**, y dónde está la **tabla de usuarios** (acá se agregan los datos de guardia).
3. Si ya existe **infraestructura de notificaciones push** y de **envío de mensajes** (WhatsApp u otros).
4. Si ya existe un **registro de fallas** (criterio fijo de Ivan: toda app lo lleva, ver 12.6) y un **historial de cambios**.
5. El sistema de **diseño** (tokens CSS, temas, claro/oscuro) para que el módulo se vea como el resto.
6. Cómo está dividido en móvil/oficina, si lo está.

Si el repo ya resuelve algo de esto, **se reutiliza**; no se duplica. Si contradice un criterio de la sección 12, decidir con Ivan.

Criterios generales de Ivan para apps nuevas (por si la de informes no los cumple todavía): servidor decide la hora; versionado optimista; historial con valor anterior; backup automático + export CSV; numeración correlativa; parámetros de negocio en pantalla con historial; reporte de fallas desde el día uno; listas acotadas. Sugerencia de stack para una app nueva (no obligatoria acá): Vercel + Supabase (Postgres).

---

## 2.bis. Reconocimiento preliminar del repo (hecho el 9/11 por Claude, leyendo archivos; la Fase 0 lo confirma)

La app de informes vive en el repo **`cidenisar/TaskWork`**, carpeta **`informes-app/`** (hay otras carpetas, `backend-server/`, `consola-simulador/`, `motor-unifilares/`: **no se tocan**). Rama por defecto: `claude/proyecto-informes-9l1n2g`; este paquete viaja en la rama `claude/guardia-general-traspaso`.

**Lo que encontré** (confirmar en Fase 0 leyendo el código; esto sale de nombres de archivo y algunos fragmentos):
- **Stack:** Next.js 16 (App Router, Server Actions), React 19, TypeScript, Tailwind 4, **Supabase** (Postgres + RLS + Auth + Storage), `@react-pdf/renderer`, `exceljs`, `nodemailer`, SDK de Anthropic. **`informes-app/AGENTS.md` avisa que este Next.js tiene cambios incompatibles con lo que conocés: leer `node_modules/next/dist/docs/` antes de escribir código.**
- **Migraciones SQL:** `informes-app/supabase/migrations/` (92 hoy, nombre `AAAAMMDDHHMMSS_descripcion.sql`). Tipos en `src/lib/database.types.ts` (regenerar tras cada migración).
- **Roles:** enum `rol` = `tecnico`, `supervisor`, `admin`, `superusuario` (el superusuario es **superset** de admin, no un rol al costado: ver `CRITERIOS_Y_IDEAS.md` §26 y §28). Perfil en la tabla `profiles` (`nombre_completo`, `rol`, `telefono`, `activo`, …). Guards en `src/lib/auth.ts` (`requireProfile`, `requireAdmin`); en SQL, `is_admin()` e `is_admin_or_supervisor()`. **«Administrador y supervisor» de Ivan = `is_admin_or_supervisor()` ampliado con superusuario** (verificar que lo incluya). El rol se lee siempre de `profiles` en cada pedido, nunca del cliente.
- **Teléfono:** `profiles.telefono` ya existe (migración `20260902000008`). **Reutilizarlo para WhatsApp** en vez de crear otro campo; revisar si hoy es texto libre y validar formato internacional al guardar.
- **Reporte de fallas ya existe:** `src/app/api/errores/reportar/route.ts`, `src/lib/client-error-report.ts`, `src/components/client-error-reporter.tsx`, migración `client_errores`, pantalla Configuración → Errores del dispositivo (solo admin). **Reusar, con códigos propios `GRD-xx`; no crear otro.**
- **Auditoría:** `audit_log` + `logAudit()` guardan solo una acción en texto, **sin valor anterior**. Para el historial con antes/después que pide Ivan, el módulo necesita **tablas de historial propias**.
- **Numeración:** hoy cada módulo genera un número **aleatorio** (`REND-2026-NNNN`, en `src/lib/<modulo>/numero-generacion.ts`). Para los eventos de guardia Ivan decidió (en otras apps) **correlativo sin huecos y sin reinicio anual**: es una **diferencia con el patrón de esta app que hay que confirmar con Ivan**, no copiar el patrón aleatorio.
- **Push:** no encontré push implementado en `informes-app` (revisar service worker en `public/` y otras carpetas). El criterio de Ivan en `CRITERIOS_Y_IDEAS.md` §6: **Web Push estándar con VAPID y la librería `web-push`, no Firebase**; hay trampas documentadas (clave VAPID pública en ambas puntas, suscripciones viejas, etc.). Hay que construirlo.
- **Convenciones de carpetas:** `src/app/(app)/<modulo>/{nuevo,historial,editar}`, `src/components/<modulo>/`, `src/lib/<modulo>/`; ajustes en `src/app/(app)/configuracion/…`. Decidir en Fase 0 si Personas/Parámetros/Feriados/Cronograma van en Configuración o en un módulo propio `guardia`.
- **Memoria compartida del repo:** el `CLAUDE.md` de la raíz exige revisar `CRITERIOS_Y_IDEAS.md` antes de arrancar trabajo nuevo (relevantes: §3 RLS, §4 secretos, §6 push, §8 debugging, §26 y §28 roles, §27 checklist de seguridad) y **agregar ahí los aprendizajes reutilizables** (no crear otro documento de lecciones).

---

## 3. Glosario

- **Llamada**: llamada de operación central (donde llegan todos los eventos) a la guardia general. Es el inicio de un evento.
- **Guardia general**: grupo de personas (hoy A, H, I en el prototipo) que atienden la llamada, revisan en el **SCADA** y deciden. Una por semana.
- **Guardia técnica**: infraestructura, datos o enlaces. Una persona por área por semana.
- **Evento**: una llamada y todo lo que pasa hasta cerrarlo.
- **Participación**: una persona atendiendo un evento (la guardia general que atendió la llamada, o un técnico activado). Tiene inicio, fin, modalidad (remoto/campo).
- **Activación** (de guardia): la persona fue llamada fuera de su horario de trabajo y cuenta para liquidar. Se mide en **media activación** o **entera** por día.
- **Dedicación funcional**: la persona fue llamada **dentro** de su horario de trabajo; se paga todos los meses y **no suma** activación.
- **Cronograma**: quién está de guardia cada semana, por área. **Semana de guardia: de miércoles 10:00 a miércoles 10:00.**
- **Cambio de guardia**: alguien no puede hacer su guardia y otro la cubre esos días aunque el cronograma diga otra cosa.
- **Intercambio**: el cambio con devolución (el que no pudo cubre más adelante el turno del otro).
- **Asumir la guardia**: botón con el que quien tiene que estar de guardia confirma que la asume.
- **Período de liquidación**: rango de fechas (hoy 01/09–30/09 en el prototipo) que se cierra y se congela.
- **Administrador / supervisor (oficina)**: ven y **corrigen** todo. Ivan es el dueño y superusuario de la app.

---

## 4. Roles y permisos

| Rol | Puede | NO puede |
|---|---|---|
| **Guardia general** (persona marcada «General») | Registrar llamada (crea el evento), registrar SCADA, activar guardias técnicas (para revisar o asistir), cargar novedades, cerrar eventos, marcar «hoy es feriado», compartir al grupo | Corregir horas, cerrar período, cambiar parámetros/cronograma/personas |
| **Técnico de guardia** (persona marcada Infra/Datos/Enlaces) | Ver los eventos en los que participa, aceptar la activación (remoto/campo) o no, marcar «terminó» **solo lo suyo**, agregar novedad en sus eventos, ver «Mis horas» propias, asumir su guardia, responder pedidos de cambio | Ver eventos ajenos, activar a otros, ver horas de otros |
| **Administrador y supervisor** (oficina) | Todo lo de oficina: ver todos los eventos, **corregir** (horarios de un evento y hora de la llamada con valor anterior registrado, cronograma, cambios de guardia, feriados, personas de guardia), liquidación, reporte de fallas. **Corregir es siempre solo de admin y supervisor (confirmado por Ivan).** Cerrar período y editar parámetros: **propuesta** solo admin (a confirmar, 16.8) | — |

Reglas de seguridad (criterio de Ivan): **autorizar por rol en cada pedido, en el servidor**; nunca por app, dispositivo o cabecera; el rol se consulta en cada pedido (no vive en un token). Esconder un botón no protege nada. **Un test por rol de lo que ese rol NO puede hacer.** **Mapeo preliminar a los roles de la app de informes** (sección 2.bis): quien hace guardia (general o técnica) tiene hoy rol `tecnico`; «Administrador y supervisor» = `supervisor`, `admin` y `superusuario` (vía `is_admin_or_supervisor()` ampliado). Confirmar en Fase 0 y con Ivan (16.8).

---

## 5. El circuito del evento (lo que hace el prototipo)

Estados de un evento: `abierto` → `cerrado`. (El prototipo antiguo tenía «pendiente / sin atender» desde un mail; **ya no existe**: el evento nace abierto cuando la guardia general registra la llamada.)

1. **Suena el teléfono** (en el prototipo: botón «Simular llamada de operación central», que pone a la guardia general de esa semana en pantalla). La persona de guardia general abre «Nuevo evento».
2. **Registrar la llamada.** Campos: tipo de alarma (Grupo electrógeno / Router / UPS / Otro), sitio o equipo, «qué comentó operación central» (texto libre; **es el texto que va a WhatsApp**), tipo de ticket (Incidencia / Ticket / Tarea de cambio) y número (texto libre, opcional). **La hora de la llamada la pone el servidor**, la persona no la edita; solo la oficina puede corregirla y queda registrado con valor anterior.
   Al registrar: se crea el evento `abierto`, se crea la participación de la guardia general (rol «Guardia general», remoto, inicio = hora del servidor) y se agrega la novedad «Llamada de operación central: … Atiende <nombre>».
3. **Avisar en el grupo.** Se arma el texto del aviso y se muestra con «Copiar» y «Abrir en WhatsApp» (ver 9: hoy es un `wa.me/?text=`; la app no sabe si se envió). Cada novedad tiene su propio botón «Compartir», y hay «Compartir resumen completo».
4. **Revisión en el SCADA.** Dos botones: «Sin novedad» / «Hay novedad». Cada uno agrega una novedad («Revisado en el SCADA: sin novedad.» / «…hay novedad, se evalúa activar la guardia técnica.») y deja listo el texto para compartir.
   - **Sin novedad** → se avisa en el grupo y se **cierra** el evento.
   - **Hay novedad** → se decide si activar guardia técnica.
5. **Activar guardia técnica.** Se elige **para qué** (`revisar` o `asistir al sitio`) y **qué guardia(s)** (Infraestructura / Datos / Enlaces; multi-selección; una ya activada queda deshabilitada «activada»). «Activar y avisar»:
   - A cada área se le resuelve **quién está de guardia en ese instante** (función `guardiaDe(área, instante)`, sección 7).
   - Se crea una participación (rol = área, modalidad sin confirmar, **inicio = instante de la activación**, `acepto = null`), una **notificación** «Te activaron» a esa persona (con el pedido) y una novedad («Se activa la guardia de <área> (<nombre>) para revisar/asistir al sitio.»), cuyo texto queda listo para compartir.
   - Si para ese instante **no hay nadie asignado** en un área, **no se activa**: se avisa «No hay nadie asignado en <áreas> para este momento. Cargalo en el Cronograma.» y no se rompe nada.
6. **El técnico activado** ve la tarjeta «Te activaron» (alarma, sitio, hora del llamado, «Te piden: revisar / asistir al sitio») y elige **«Voy remoto»** o **«Voy al sitio»**. Eso fija la modalidad y `acepto`, y agrega la novedad «<nombre> acepta (remoto / va al sitio).».
   **Si el técnico activado no contesta** (Ivan: «no lo tengo resuelto, pero creo que se llama a otro»): en el detalle del evento, junto a quien no aceptó, la guardia general tiene el botón **«No contesta»**. Se abre un selector con las **otras personas de esa misma guardia que todavía no están en el evento** (en el prototipo, la lista completa del área) y el botón **«Llamar a otro»**. Efecto: la participación original queda marcada **«no contestó»** (con fin = ahora y **fuera del cálculo de activaciones**), se crea una participación nueva para la persona elegida (mismo rol y mismo pedido, revisar o asistir), se le manda el «Te activaron», y se agrega una novedad lista para compartir («<A> no contesta. Se activa a <B> (<área>) para revisar.»). **Es una propuesta mía para confirmar con Ivan:** (a) que lo de quien no contestó **no cuente** como activación; (b) si «otro» es cualquiera del área o hay un **suplente ordenado**; (c) si hace falta un **temporizador** («minutos para responder», parámetro) que avise a la guardia general solo — hoy el botón lo aprieta la persona, no hay temporizador.
7. **Durante el evento**: cualquiera de los participantes (y la guardia general) agrega novedades; cada participante o la guardia general marca **«Terminó»** (fija el fin de esa participación; **no se permite** si el reloj es anterior al inicio). Se puede compartir cada novedad al grupo.
8. **Cerrar evento** (solo guardia general): a los que no terminaron se les pone fin = ahora (con la misma validación), estado `cerrado`, novedad «Evento cerrado.». Pasa a la oficina y a la liquidación.

**La notificación «Te activaron» en el prototipo es una tarjeta en el móvil del técnico** (simula el push). En producción: push + WhatsApp individual (sección 9).

**Qué muestra el móvil** (pantallas): Guardia (avisos pendientes arriba, «De guardia ahora: General X · Infraestructura Y · Datos Z · Enlaces W» para la guardia general, tarjeta «Hoy · tipo de día» con botón Marcar/Quitar feriado para la guardia general, eventos abiertos, últimos 3 cerrados, botón «Nuevo evento» solo para guardia general), Nuevo evento, Detalle del evento, y **Mis horas** (período, un renglón por día con tipo de día, cantidad de eventos, horas del día y «Media/Entera · valor», total del período; nota «la dedicación funcional no suma acá»; «en curso» si hay una participación abierta).

---

## 6. Reglas de cálculo de activaciones (CONFIRMADAS por Ivan — no tocar sin consultar)

Estas reglas costaron varias vueltas con Ivan. El código de referencia es `codigo-motor/motor-guardia.mjs` (puro, sin dependencias, minutos enteros). **Portarlo tal cual y mantener sus 22 tests.**

**Todo lo que la empresa puede revisar vive en parámetros (sección 8), no en el código.** Valores actuales:

| Parámetro | Valor | Significado |
|---|---|---|
| `entradaMin` | 07:30 | desde acá, en día hábil, un llamado es dedicación funcional |
| `salidaActivacionMin` | 17:00 | desde acá, en día hábil, un llamado es activación (se salen 16:30 pero cuenta desde 17:00: «se entiende que ya no estamos en el lugar de trabajo») |
| `madrugadaHastaMin` | 07:30 | una activación de madrugada cuenta **solo hasta** acá |
| `topeMediaMin` | 4:30 (270 min) | hasta esto en el día = **media** activación; más = **entera** |
| `valorMedia` / `valorEntera` | 0,5 / 1,0 | resultado por día. **Guardarlo como entero (centésimas: 50 / 100)** para que se pueda cambiar a 0,25 sin tocar el código |

**Reglas:**
1. **El INICIO del llamado clasifica** el evento de esa persona. Si el llamado entra un **día hábil entre 07:30 y 17:00 (excl.)** → **dedicación funcional para todo el evento, aunque se extienda hasta las 20:00 o más; no suma activación**.
2. Todo lo demás es **activación**: día hábil 00:00–07:30 (cuenta **solo hasta 07:30**), día hábil desde 17:00 (cuenta hasta la medianoche), **fin de semana o feriado: 0–24**.
3. **Se evalúa cada día calendario por separado** (0 a 24). Un evento que cruza la medianoche **se parte** en los días que toca. El día siguiente de un evento nocturno en día hábil cuenta **solo hasta 07:30** (si no es feriado/finde).
4. **Se suman los minutos por persona y por día entre todos sus eventos, y recién después se aplica el corte** (nunca evento por evento): ≤ 4:30 → media; > 4:30 → entera. **4:30 exacto es media; 4:31 es entera.** Ej.: 9 hs un día y 6 hs al otro = 2 activaciones enteras.
5. **La guardia general también se anota** por atender la llamada (su participación entra al cálculo igual que la de un técnico).
6. «Día hábil» = lunes a viernes **que no sea feriado marcado**. **Solo cuentan los feriados MARCADOS** en la app (sección 10); un feriado nacional sin marcar cuenta como día hábil.
7. Una participación abierta se calcula hasta «ahora» (marcada «en curso»).
8. Los datos entran como **hora local de la zona de la guardia** (`AAAA-MM-DDTHH:MM`); el servidor convierte desde UTC antes de llamar. **Zona = parámetro** (default propuesto `America/Argentina/Buenos_Aires`, UTC-3, sin horario de verano; **confirmar con Ivan**, 16.6).
9. Todo en **minutos enteros**; nunca decimales ni coma flotante.

**Casos límite que el motor ya cubre y deben seguir cubiertos** (ver el test): 16:59 vs 17:00; 7:29 vs 7:30; 7:15 que cuenta 15 minutos; martes 22:00 → miércoles 10:00 = 1,5 activaciones (martes 2 h = media; miércoles 0–7:30 = 7:30 h = entera); viernes 23:00 → sábado 03:00 = dos medias; domingo 22:00 → lunes 10:00 (domingo 2 h, lunes solo hasta 7:30); feriado marcado vs no marcado; el corte cambia con el parámetro sin tocar código; error si fin ≤ inicio o fecha mal escrita.

**Corrección menor del motor:** el comentario de la línea 44 decía «entre 07:00 y 17:00»; ya lo corregí a 07:30 en la copia del paquete (la lógica usaba bien el parámetro).

**Diferencia a unificar:** el motor usa «medias» (1 y 2) y el prototipo usa centésimas (50 y 100). Quedarse con **centésimas enteras** en base y mostrar «0,5 / 1,0».

**Dato de aceptación (de los 9 eventos de ejemplo, septiembre 2026, ver sección 13):** total **7,5 activaciones**.

---

## 7. Cronograma de guardia, cambios, asumir (CONFIRMADO salvo lo marcado)

### 7.1 Semana de guardia
- **Guardia semanal, de miércoles 10:00 a miércoles 10:00 (CONFIRMADO por Ivan el 9/11).** La hora de cambio es el parámetro `cambioMin` (**default 10:00 = 600 min**; antes estaba en 00:00 sin confirmar). Ivan dijo «por lo general»: dejarlo editable por si cambia. En el calendario de lunes a domingo el **miércoles tiene dos guardias** (hasta las 10:00 la anterior, desde las 10:00 la nueva); el prototipo muestra la que empieza ese día y marca «desde 10:00».
- `diaGuardia(instante) = floor((instante_local_en_minutos − cambioMin) / 1440)`.
- `inicioSemana(instante)` = el miércoles (≤ diaGuardia) anterior o igual, como fecha ISO. Es la **clave** de la semana.
- Semanas de un año: los miércoles desde el miércoles ≤ 1/ene hasta el 31/dic.

### 7.2 Quién está de guardia
`guardiaDe(área, instante)`:
1. Si hay un **cambio de guardia ACEPTADO** de esa área que cubra el *día de guardia* del instante (`desde ≤ día ≤ hasta`) → la persona de ese cambio (**si hay varios, gana el último registrado**).
2. Si no → la persona del **cronograma** de esa semana para esa área (puede ser «sin asignar»).

Las áreas son cuatro: `General`, `Infraestructura`, `Datos`, `Enlaces`. **Cada una tiene su propio cronograma con sus propias personas; una persona hace una sola guardia, no se mezclan.**

### 7.3 Generar programación anual
- Por área y año. Toma la **lista ordenada** de personas de esa área y asigna **rotando una por semana**.
- **Continúa la rotación desde quien estuvo de guardia la semana anterior** (continuidad entre años: la rotación de 2027 sigue donde terminó 2026).
- **No pisa** lo ya cargado, salvo que se marque «pisar lo ya cargado».
- «Todas» las áreas o una sola. Años ofrecidos: 2026–2028 (extensible).
- Queda registrado en el historial («Programación generada · 2027 · Todas (N turnos)»).
- **Orden de rotación:** el prototipo usa el orden de la lista de personas. En producción hace falta un **campo de orden** editable por área (pregunta abierta 16.7).
- Cada semana se puede **editar a mano** con un selector (por semana y área), cada edición queda en el historial con quién/cuándo/antes/después.
- La grilla se filtra por año y mes; marca la semana actual («ahora»).

### 7.4 Personas de guardia (marcar quién hace cuál)
Pantalla «Personas»: para cada usuario, su **teléfono de WhatsApp** y un selector **Sin guardia / General / Infraestructura / Datos / Enlaces**. En producción esto es **un campo en el usuario de la app de informes** (más orden de rotación, teléfono de WhatsApp: ver 9 y 11).
Al cambiar a alguien:
- Se registra en el historial (antes → después).
- **Se rehace el cronograma desde la SEMANA QUE VIENE** para el área que deja y el área a la que entra. **Lo pasado y la semana en curso no se tocan**, salvo que la persona de esta semana ya no esté en esa guardia. (Principio de Ivan: un cambio vale de ahí en adelante y nunca reescribe el pasado.)
- Si un área queda sin personas, sus semanas futuras quedan «sin asignar».
- Algoritmo `regenerarDesde(área)`: para cada semana ≥ semana en curso en orden, tomar la persona de la semana anterior en esa área, y asignar la siguiente en la lista actual del área (si la anterior ya no está en la lista, empezar por la primera).

### 7.5 Cambio de guardia e intercambio
Lo carga hoy **la oficina** («Cambio de guardia» en Cronograma). Campos: área, **quién no puede**, **quién lo cubre** (solo candidatos de esa área), **desde / hasta** (rango de días de guardia), **devolución opcional** (otro rango en el que el que no pudo cubre el turno del otro) y motivo.
- Validaciones: «desde» y «hasta» obligatorios y hasta ≥ desde; no puede ser la misma persona; la devolución se completa entera o no; la devolución es **posterior** al turno que se cubre.
- Se guardan **1 o 2 filas** con un mismo `par`: `tipo = cubre` (persona = quien cubre, original = quien no puede) y, si hay devolución, `tipo = devuelve` (persona = el que no pudo, original = el que cubrió).
- **Estado: `pendiente` → `aceptado` | `rechazado`.** Mientras está pendiente **no rige**: sigue la persona del cronograma y los avisos de activación le llegan a ella.
- **Se le notifica a quien tiene que asumir** («Te piden asumir la guardia»: área, fechas, quién lo pide, motivo, y si hay devolución «<X> te devuelve la guardia <fechas>»). Dos botones: **«Asumo la guardia»** (→ aceptado; rige; queda en el historial «Asume la guardia · <área>») y **«No puedo»** (→ rechazado; el cambio no se hace; la guardia sigue como el cronograma; se registra).
- **Anular** un cambio (oficina, ícono de papelera): borra las filas del par y las notificaciones pendientes; vuelve a regir el cronograma.
- En el cronograma, las semanas con cambio muestran una etiqueta (Cambio / Pendiente / No aceptado) y quién cubre. En el calendario un ↔ marca un cambio aceptado.
- Vale **igual para la guardia general y para las técnicas.**
- **Decisiones abiertas:** quién puede registrar un cambio (¿solo oficina, la guardia general, o el propio que no puede desde su móvil?) y si requiere aprobación; si el cambio es por semana completa o por días sueltos (el prototipo permite rango de días); qué hacer con cambios que se superponen (hoy gana el último; recomendado: validar y avisar) y con cambios sobre fechas pasadas (recomendado: bloquear) — 16.2, 16.3.

**Cómo es en la práctica (Ivan, 9/11):** la guardia se transfiere **una vez que a uno le toca**, y le **transfieren el teléfono de guardia activa**: en ese momento quien lo recibe **asume la guardia**. El botón «Asumo la guardia» de la app representa ese acto, tanto en el cambio de semana como en un cambio o intercambio puntual.

### 7.6 «Asumo la guardia» semanal
Cada miércoles a las 10:00 (`cambioMin`) a **quien tiene que estar de guardia** en cada una de las cuatro áreas se le muestra «Asumís la guardia · <área> · semana … · desde el miércoles HH:MM» con el botón **«Asumo la guardia»**. Registra `{semana, área, persona, cuándo}`. No aparece si esa persona está cubriendo por un cambio aceptado (el «Asumo» del cambio ya cuenta).
- En el prototipo es una tarjeta que aparece mientras la persona esté de guardia y no haya apretado el botón.
- **Producción:** crear en el servidor un registro «asunción pendiente» por área y semana al cambiar la semana, notificar (push + WhatsApp) y registrar el «Asumo».
- **Pendiente decidir:** qué pasa si no aprieta el botón en X minutos (recomendado: recordatorio por WhatsApp y aviso a la guardia general/oficina), 16.5. **No** bloquear los avisos de eventos por no haber apretado: sigue siendo de guardia por cronograma.

---

## 8. Parámetros del negocio (criterio fijo de Ivan: nada clavado en el código)

Pantalla «Parámetros» en la oficina, con **historial** (quién, cuándo, parámetro, antes, después). Un parámetro editable: horarios (entrada, salida, madrugada, corte de media), **valores** de media y entera, **hora de cambio de guardia del miércoles**, **período de liquidación** (desde/hasta). Más: **feriados** (sección 10) y el cronograma.

**Regla que lo hace seguro:** un cambio de parámetro **vale hacia adelante y nunca mueve un período ya cerrado**. Al cerrar un período se guarda **una foto** (parámetros + resultado) que no se recalcula. Si el período está cerrado, sus fechas no se pueden editar hasta reabrirlo (en el prototipo «Reabrir» es solo para la demo; en producción definir con Ivan cómo se corrige algo cerrado, que **él dejó para discutir aparte**, 16.10).

---

## 9. Notificaciones y WhatsApp (decisión de Ivan, actualizada el 9/11)

**Decisión:** **no se contrata un número de WhatsApp para la empresa.** La idea de Ivan es **usar el número de cada uno de los que usan la app y tienen WhatsApp**. Por lo tanto:

- **WhatsApp es un aviso que dispara una persona desde su propio WhatsApp, no un envío automático.** Cada usuario tiene cargado **su teléfono** (formato internacional, ej. `+54 9 11 5555 5555`). Cuando la guardia general activa a alguien (o necesita avisarle algo), la app **abre WhatsApp en el celular de la guardia general, en el chat de esa persona, con el mensaje ya escrito**: `https://wa.me/<teléfono sin signos>?text=<texto>`. La guardia general toca «Enviar» en WhatsApp.
- **Consecuencia que hay que tener presente:** la app **no puede saber si el mensaje se envió ni si se leyó**. Para un aviso que tiene que estar garantizado, el canal **controlado** es la **notificación push de la app** (con estado de entrega y de lectura en la oficina); WhatsApp queda como **refuerzo manual**. Si algún día se necesita envío automático garantizado por WhatsApp, haría falta una cuenta de WhatsApp Business con número propio y plantillas aprobadas por Meta; Ivan decidió **no** ir por ahí. Dejar la capa de notificaciones con **una interfaz por canal** para poder sumarlo sin reescribir.
- **El prototipo ya lo hace:** en «Personas» cada usuario tiene su campo **«Teléfono de WhatsApp»** (se valida que lleve código de país y de área); en el detalle del evento, junto a cada técnico activado que todavía no terminó, hay un botón **«WhatsApp»** (si no tiene teléfono muestra «Sin teléfono»). El texto: «Te activaron en la guardia de <área>: <tipo de alarma> – <descripción> (<sitio>). Te piden: revisar / asistir al sitio. Abrí la app para aceptar.»

**Qué cosas se notifican y por qué canal:**
| Disparador | Destinatario | Push (controlado) | WhatsApp (manual, desde el celular de quien dispara) |
|---|---|---|---|
| Se activa su guardia técnica en un evento | el técnico de guardia del área (o el «otro» si no contesta) | «Te activaron…» con Voy remoto / Voy al sitio | botón «WhatsApp» en el detalle del evento (guardia general) |
| Pedido de cambio de guardia | quien tiene que cubrir | «Te piden asumir la guardia…» con Asumo / No puedo | opcional: botón que abre su chat (a agregar) |
| Cambio de semana (miércoles 10:00) | el de guardia de cada área | «Asumís la guardia…» con Asumo | — |
| Respuesta a un pedido de cambio | quien lo pidió + oficina | «<nombre> asumió / no puede…» | — |

**El grupo «Novedades de guardia» (≤ 15 personas)** sigue como **compartir manual**: botón → se arma el texto → se abre `https://wa.me/?text=<texto>` y la persona elige el grupo y envía. Se mantiene «Copiar». Un link de WhatsApp **no puede apuntar a un grupo** y la app no sabe si se envió (decirlo en pantalla). Cada novedad tiene su botón «Compartir» y hay «Compartir resumen completo».

**Cómo construirlo:**
- Datos por persona: `telefono_whatsapp` (E.164), `activo`. Validar el formato al guardar y **no mostrar el teléfono a quien no corresponda** (es dato personal: lo ven admin, supervisor y la guardia general).
- **Capa de notificaciones** `notificar(usuarioId, tipo, datos, refId)` que escribe una fila en una **tabla de salida (outbox)** y un trabajador que envía el **push**. Estados: `pendiente → enviada → entregada → leida | fallida`, con reintentos y error guardado. **Idempotente** por `(tipo, refId, usuario, canal)`. **Que una falla de envío no frene la operación** (criterio de Ivan: si falla, la operación sigue y queda en cola).
- Mostrar en la oficina **el estado de cada aviso** (para ver si un técnico no recibió su «Te activaron»).
- Verificar al implementar las reglas vigentes de push en iOS/Android para una web app/PWA (permiso del usuario, app instalada, etc.): **condiciona qué tan confiable es el aviso**. Si la app de informes ya tiene push, reutilizarlo.

**Por qué no se usó la API de grupos de WhatsApp:** requiere cuenta de empresa oficial y admite **8 participantes por grupo** (el grupo actual llega a 15); además no está claro que pueda escribir en un grupo creado a mano. Fuente: documentación de Meta para desarrolladores (Groups API).

---

## 10. Calendario y feriados

**Calendario** (oficina): vista mensual, **semana de lunes a domingo**, navegación por mes (flechas con ícono) y selectores de mes y año. Cada día muestra **quién está de guardia en cada una de las cuatro** (Gen / Inf / Dat / Enl + nombre), `↔` si hay un cambio aceptado, el fin de semana con fondo atenuado, el día «actual» (reloj de la demo) con borde, el feriado marcado con etiqueta «Feriado» en rojo y el feriado nacional **sin marcar** con etiqueta «Feriado nacional sin marcar». Tocar un día abre un panel con tipo de día, feriado (marcar/quitar) y la guardia de cada área con el detalle del cambio. Para cada día se usa quién **empieza** la guardia ese día (a la hora de `cambioMin`).
- Accesibilidad: la información no depende solo del color (hay texto en cada etiqueta); cada día tiene `aria-label`.

**Feriados de Argentina:**
- Tabla de feriados marcados: `{fecha, nombre, por, cuándo}`. Los marca la **guardia general** (desde el móvil: «Marcar feriado» de **hoy**) o la oficina (desde el calendario o desde Parámetros). **Solo los marcados afectan el cálculo.**
- **Calendario nacional precargable** (`referencia/feriados-argentina-2026-2027.json`): se muestra en una lista del año (fecha, nombre, estado Marcado/Sin marcar), con **«Marcar los N sin marcar»** (los marca todos de una vez) y «Marcar» por fila. Cada marca queda en el historial.
- **ADVERTENCIAS:** (a) la fuente son notas periodísticas, **no un decreto oficial**: validar contra el Boletín Oficial / argentina.gob.ar antes de liquidar; (b) 2027 está calculado por ley, traslado del 20/11 y puentes **a confirmar**; (c) **no se cargan** los días no laborables con fines turísticos (2026: 10/07 y 07/12) ni feriados provinciales/locales: la empresa los marca a mano si corresponde; (d) recomendado: alerta en la oficina cuando falte cargar el calendario del año próximo y cuando haya feriados nacionales **sin marcar** dentro de un período abierto (afecta la liquidación).

---

## 11. Modelo de datos propuesto (adaptar al esquema real de la app de informes)

Convenciones: ids según las de la app; timestamps `timestamptz` en UTC; **la hora de negocio la pone el servidor**; se guardan también la hora del dispositivo y su diferencia donde aplique; **todas las filas con `version` (bloqueo optimista)**; tablas de historial con `antes`/`despues`.

- **`guardia_persona`** (extiende al usuario): `usuario_id`, `area` (`NINGUNA|GENERAL|INFRAESTRUCTURA|DATOS|ENLACES`), `orden` (rotación dentro del área), `orden` y `area` (el teléfono ya existe: **`profiles.telefono`**, ver sección 2.bis; es el número personal de cada usuario, ver sección 9), `activo` (ya existe en `profiles`).
- **`guardia_parametro`**: clave única, valor (enteros), `vigente_desde`. **`guardia_parametro_hist`**: `par`, `antes`, `despues`, `quien`, `cuando`.
- **`feriado`**: `fecha` (PK), `nombre`, `origen` (`NACIONAL|MANUAL`), `marcado_por`, `marcado_at`. + historial.
- **`cronograma_semana`**: `semana_inicio` (miércoles, fecha), `area`, `usuario_id` (nullable = sin asignar), PK `(semana_inicio, area)`. + historial de cada edición manual y de cada generación.
- **`cambio_guardia`**: `par_id`, `tipo` (`CUBRE|DEVUELVE`), `area`, `desde`, `hasta` (fechas de día de guardia), `persona_id`, `original_id`, `motivo`, `estado` (`PENDIENTE|ACEPTADO|RECHAZADO|ANULADO`), `registrado_por`, `registrado_at`, `respondido_at`.
- **`asuncion_guardia`**: `semana_inicio`, `area`, `usuario_id`, `asumio_at` (null = pendiente), PK `(semana_inicio, area)`.
- **`evento`**: `id`, `numero` (correlativo **sin huecos y sin reinicio anual**, tabla-contador dentro de la transacción; se muestra con ceros: `#0001`), `estado` (`ABIERTO|CERRADO`), `origen` (`LLAMADA`; reservar `MAIL`), `tipo_alarma`, `sitio`, `descripcion`, `ticket_tipo`, `ticket_numero`, `scada` (`SIN_NOVEDAD|CON_NOVEDAD|null`), `creado_at` (servidor), `cerrado_at`, `version`.
- **`evento_participacion`**: `evento_id`, `usuario_id`, `rol` (`GUARDIA_GENERAL|INFRAESTRUCTURA|DATOS|ENLACES`), `modalidad` (`REMOTO|CAMPO|null`), `pedido` (`REVISAR|ASISTIR|null`), `inicio_at` (**instante de la llamada a esa persona**), `acepto_at`, `fin_at` (null = en curso).
- **`evento_novedad`**: `evento_id`, `at`, `texto`, `por` (usuario o sistema).
- **`evento_correccion`**: `evento_id`, `participacion_id`, `campo`, `antes`, `despues`, `por`, `at` (**siempre el valor anterior**: es lo único que no se puede agregar retroactivamente).
- **`periodo_cierre`**: `desde`, `hasta`, `cerrado_at`, `cerrado_por`, `parametros_json` (foto), `resultado_json` (foto por persona/día). **Inmutable.**
- **`notificacion`** (outbox): `id`, `usuario_id`, `tipo`, `ref_tipo`, `ref_id`, `canal`, `payload`, `estado`, `intentos`, `error`, `creada_at`, `enviada_at`, `entregada_at`, `leida_at`, clave única de idempotencia `(tipo, ref_id, usuario_id, canal)`.
- **`falla`** (reporte de fallas): `codigo`, `mensaje`, `contexto`, `pantalla`, `usuario`, `aparato` (línea legible: sistema · navegador · pantalla), `version`, `cuando`. Reutilizar el de la app de informes si ya hay uno.

**Derivados, no guardados:** la liquidación por persona y día se **calcula** con el motor a partir de las participaciones y los feriados vigentes; **solo al cerrar el período** se guarda la foto. Nunca guardar un total que se actualice a mano.

---

## 12. Reglas técnicas y de arquitectura (criterios de Ivan, fijos)

12.1 **Reloj:** manda el servidor. Ninguna decisión de cálculo depende del reloj del teléfono. Se pueden guardar las dos horas (oficial y del dispositivo) y marcar diferencias grandes.
12.2 **Reglas en el servidor, pantallas en el cliente.** Núcleo compartido (cálculo, cronograma, formatos) + móvil + oficina + servidor; un solo login, el rol decide a qué app entra y lo **frena el servidor**.
12.3 **Sin señal:** cada pedido trae **cuándo pasó** aparte de cuándo llegó y es **idempotente** (id generado por el teléfono; el servidor lo acepta una sola vez). El técnico de campo puede perder señal: «Voy al sitio» / «Terminó» no deben perderse ni duplicarse.
12.4 **Dos personas editando lo mismo:** versión por registro; el servidor rechaza el cambio viejo con un mensaje legible («<nombre> cambió esto mientras lo tenías abierto»), con la diferencia a la vista.
12.5 **Historial siempre con valor anterior.** Parámetros, cronograma, cambios, correcciones, personas, feriados.
12.6 **Reporte de fallas (criterio fijo, desde el día uno):** captura con códigos propios (`GRD-01`…) + redes globales (`window.onerror`, promesas rotas) → una función de anotado; contexto: qué, pantalla, registro, quién, **aparato (línea legible)**, versión; en pantalla un cuadro con **código corto** dictable, detalle y «Copiar» con tres escalones (API moderna, `execCommand`, «sacale una foto»); el cuadro se dibuja **a mano, sin depender del render de la app**; texto que empieza tranquilizando («no es culpa tuya y no se perdió lo que cargaste»); en la oficina lista, contador, export CSV y botón «Generar falla de prueba». Un único lugar manda la falla al servidor. **Nunca decir que algo salió bien sin haberlo comprobado.**
12.7 **Listas acotadas** (una sola solución para todos los scroll): ventana por defecto, buscador y filtros arriba, **de a 30 con «ver más»**, lo más nuevo arriba, **el pie dice siempre cuántos hay en total**; la app pide **una página por vez** al servidor, el total sale de una consulta de conteo y los filtros viajan como parámetros (**nunca filtrar en el navegador una lista bajada entera**). Listas que crecen con el tiempo (eventos, cierres de período, historial) van **cortadas por año con subtotal del año entero filtrado**, año como filtro, **un renglón por cosa y detalle al tocar**, buscador por lo que hay adentro. El año se cuenta por **el período al que pertenece el registro**, no por cuándo se apretó el botón. Las listas acotadas por la operación (personas de una guardia, 7 días de calendario) no se paginan. El prototipo muestra la tabla de eventos completa: **no es el molde**.
12.8 **Iconos:** en escritorio (oficina) los botones de acción de lista (ver, editar, borrar, anular) son **íconos** con `title` + `aria-label`. En el móvil, para gente de campo, **botón con palabra, nunca ícono solo**.
12.9 **Apariencia:** colores como **tokens CSS**, tema claro y oscuro con **interruptor propio dentro de la app** (no depender del sistema operativo), mismos tokens que el resto de la app de informes. Ivan trabaja en claro. Verificar con estilos calculados y con un script que barra la app buscando texto ilegible; no verificar solo con capturas. El estilo de la app de informes manda sobre el del prototipo.
12.10 **Plata/valores:** acá no hay moneda pero sí valores de activación: **enteros** (centésimas), redondeo en un solo lugar con su prueba. Minutos enteros siempre.
12.11 **Respaldo:** backup automático diario del hosting, «Bajar todo» a CSV (se abre en Excel, que es lo que usan) y **probar la restauración con fecha fija** verificando que el caso de aceptación (sección 13) siga dando el mismo número. CSV separado por punto y coma: ver `csvDe` en el prototipo (Persona; Guardia; Fecha; Tipo de día; Eventos; Horas de activación; Resultado del día + fila TOTAL por persona).
12.12 **Orden de trabajo obligatorio:** primero **núcleo + pruebas de aceptación, cero interfaz**; recién después pantallas.

---

## 13. Casos de aceptación (con números)

**A. Liquidación de ejemplo (septiembre 2026; salida del motor, verificada):** 19 participaciones en 9 eventos. Total **7,5 activaciones**. Por persona (activaciones): **A 3,0 · B 2,0 · C 0,5 · D 1,5 · E 0,5**. Detalle esperado:
- A: 12/09 = 300 min → **entera** (sábado: 08:00–10:00, 12:00–13:30 y 20:00–21:30 suman 5 h); 13/09 = 120 min → media; 15/09 = 150 min → media; 16/09 = 30 min → media (madrugada 05:00–05:30); 18/09 = 30 min → media. El evento del 14/09 07:45 y el del 17/09 15:00 son **dedicación funcional** (no suman).
- B: 12/09 78 min · 15/09 138 min · 18/09 50 min · **19/09 180 min** (el evento 18/09 23:10 → 19/09 03:00 se parte) → cuatro medias = 2,0.
- C: 15/09 110 min → 0,5. D: 12/09 80 · 13/09 105 · 16/09 140 → 1,5 (el 17/09 15:00 es DF). E: 12/09 100 → 0,5 (el 14/09 07:50 es DF).
- **Tras un evento nuevo** del prototipo el total pasa de 7,5 a 8,5 (caso en la prueba de humo).
- Datos de entrada de este caso: `prototipo/guardia-general-prototipo.html`, función `estadoInicial` (eventos `mk(...)`), y `prueba-de-humo-prototipo.js`.

**B. Escenarios que la prueba de humo ya recorre (replicar como tests de integración/e2e):** el circuito completo (llamada → aviso → SCADA → activar → aceptar → novedades → terminó → cerrar → aparece en oficina y liquidación); activar con el reloj en jornada / 16:45 / 19:30 / madrugada / fin de semana; cambiar el cronograma cambia a quién se avisa; la guardia general también rota; generar 2027 continúa la rotación; intercambio con devolución (rige solo después de aceptar; más adelante el que no pudo devuelve el turno; anular vuelve al cronograma); rechazo del cambio; «Asumo la guardia» semanal para general y técnica; personas: marcar/mover a alguien rehace el cronograma desde la semana que viene sin tocar lo pasado; calendario del mes (30 días en septiembre), navegar meses, marcar los 16 feriados de 2026, quitar uno; **sin guardia asignada no se rompe**; **el miércoles 05:00 todavía es la guardia anterior y desde las 10:00 es la nueva**; **técnico que no contesta → se llama a otro y lo suyo no suma**; **teléfono de cada persona y botón WhatsApp con su número**; cierre de período congela el resultado aunque cambien parámetros; feriado y madrugada; cambio de hora a 08:00; reporte de fallas con falla de prueba.
**C. Tests por rol de lo que NO puede** (agregar; el prototipo no los tiene): técnico no ve eventos ajenos ni horas ajenas; técnico no activa; guardia general no corrige horas, no cierra período, no cambia parámetros; nadie salvo oficina anula cambios ni edita cronograma; cada pedido se rechaza en el **servidor** aunque el botón esté oculto.

---

## 14. Plan de trabajo sugerido (cada fase termina con tests verdes y con Ivan viendo algo)

0. **Reconocimiento** de la app de informes: **confirmar y completar la sección 2.bis** leyendo el código + plan escrito → Ivan lo aprueba.
1. **Núcleo**: portar el motor y sus 22 tests; agregar funciones de cronograma (`diaGuardia`, `inicioSemana`, `guardiaDe`, generar, regenerar, cambio vigente) con **tests propios** (casos de 7.1–7.6); parámetros con historial. Sin UI. Resultado: caso de aceptación A en verde.
2. **Datos + servidor + permisos**: tablas, endpoints (reloj del servidor, versión, idempotencia), **tests por rol**.
3. **Oficina**: Personas, Parámetros, Feriados/Calendario, Cronograma (generar, editar, cambios, anular).
4. **Móvil**: circuito completo (llamada → SCADA → activar → aceptar → terminar → cerrar), Mis horas, tarjetas de aviso.
5. **Notificaciones**: outbox + push; después WhatsApp individual (sandbox/número de prueba antes del definitivo; plantillas en aprobación mientras tanto).
6. **Liquidación**: pantalla, CSV, cierre de período congelado, reporte de fallas, listas acotadas con corte por año.
7. **Prueba con datos reales**: Ivan carga **2–3 eventos reales de un mes ya liquidado** (con su planilla) y se compara contra el Excel; recién ahí se usa en producción.

Para cada fase: mostrarle a Ivan **lo mismo que va a ver al abrir**, sin configurar nada antes; no guardar elecciones en el navegador mientras se itera; si un cambio no se ve en su pantalla, decírselo.

---

## 15. Trampas conocidas (cosas que ya salieron mal en este trabajo)

- El horario cambió tres veces en la charla. **El correcto es 07:30 / 17:00 / madrugada hasta 07:30**. En la memoria vieja del proyecto aparecen «7 a 17», «8:00», «16:30»: están **superados**.
- «Dedicación funcional» **no es** «activación que no cuenta»: es el nombre de lo que se paga mensualmente. Un martes 15:00–19:00 es dedicación funcional **todo** (no 2 horas de activación).
- Una **media** activación no se suma con otra del mismo día: el día se evalúa **completo** (suma de minutos de todos los eventos de la persona ese día) y recién ahí se corta en 4:30.
- Las horas de un evento que cruza medianoche se **parten por día**; el día siguiente cuenta solo hasta las 07:30 si es hábil.
- El prototipo usa el reloj de la demo y guarda todo en memoria (se pierde al recargar); **producción: reloj y datos en el servidor**.
- Un feriado sin marcar cambia la liquidación sin que nadie lo vea: de ahí la alerta recomendada en 10.
- Un enlace `wa.me` **no puede apuntar a un grupo** y la app no puede saber si el mensaje se mandó: por eso el aviso garantizado es el push.
- Documentos con la palabra «guardia» y «semana» mezclan dos cosas: **semana de guardia** (miércoles 10:00 a miércoles 10:00) ≠ semana calendario (lunes a domingo, que usa la vista de calendario).

---

## 16. Decisiones y preguntas abiertas

### Resueltas por Ivan el 9/11/2026
- **Cambio de guardia:** semanal, **miércoles 10:00 → miércoles 10:00** («por lo general»). Se transfiere el teléfono de guardia y quien lo recibe asume. Parámetro `cambioMin = 600`.
- **Corregir:** **siempre administrador y supervisor** (horas de un evento, hora de la llamada, cronograma, cambios de guardia, feriados, personas).
- **WhatsApp:** **sin número dedicado**; se usa **el número de cada usuario**. Ver sección 9 (aviso manual desde el WhatsApp de quien lo dispara + push como canal controlado).
- **Técnico que no contesta:** «se llama a otro». Implementado como botón «No contesta → Llamar a otro» (sección 5, paso 6). Los detalles de abajo siguen abiertos.

### Siguen abiertas (con mi recomendación por defecto)
1. **Excepciones al cambio de miércoles 10:00**: Ivan dijo «por lo general». ¿Hay feriados o casos en que cambie a otra hora o día? *Dejar `cambioMin` editable; las excepciones se resuelven con un cambio de guardia.*
2. **¿Quién registra los cambios/intercambios** (el propio que no puede desde su móvil, la guardia general, o solo admin/supervisor) y si requieren aprobación. *Recomendado: lo pide el que no puede o lo carga el supervisor; el que cubre acepta («Asumo»); admin/supervisor pueden anular. Corregir = admin/supervisor.*
3. **¿El cambio es por semana completa o por días sueltos?** Hoy el prototipo admite un rango de días.
4. **Grupo de WhatsApp:** seguir con compartir manual (recomendado).
5. **Técnico que no contesta:** (a) ¿lo suyo no cuenta como activación? (propuesto: no cuenta); (b) ¿«otro» es cualquiera del área o hay un suplente ordenado?; (c) ¿hace falta un temporizador que avise solo a la guardia general, y en cuántos minutos?
6. **Zona horaria** de la guardia (¿solo Argentina?). *Default America/Argentina/Buenos_Aires.*
7. **Orden de rotación** por área (¿alfabético, manual?). *Campo de orden editable.*
8. **Roles reales** de la app de informes y mapeo a los de la sección 4; **quién** puede cerrar período, editar parámetros y gestionar personas (propuesto: solo admin).
9. **Cómo se corrige algo ya cerrado** (período cerrado con un error descubierto después): Ivan lo dejó para discutir aparte. Es lo más caro de agregar tarde.
10. **Feriados:** validar la lista 2026/2027 contra fuente oficial; ¿se marcan días no laborables turísticos y feriados provinciales?
11. **Numeración** de eventos: correlativa sin reiniciar por año (lo que ya decidió para otras apps) — confirmar que aplica acá.
12. **Entregable de la liquidación a RRHH/sueldos:** hoy CSV con `;`. ¿Hace falta otro formato?

---

## 17. Prompt sugerido para pegar en Claude Code al arrancar

```
Vas a construir el módulo «Guardia General» dentro de la app de informes de TerraLogic.
Leé primero, en este orden y completos: HANDOFF-guardia-general.md, codigo-motor/motor-guardia.mjs y su test.
Después abrí prototipo/guardia-general-prototipo.html y recorré el circuito (botón «Simular llamada de operación central»; pestañas Cronograma, Calendario, Personas, Parámetros).

Reglas del encargo:
1. FASE 0 primero, sin escribir código: reconocé el repo de la app de informes (stack, login y roles, tabla de usuarios, notificaciones, reporte de fallas, sistema de diseño) y escribí NOTAS-integracion.md con lo que encontraste y un plan por fases. No sigas hasta que Ivan lo apruebe.
2. Orden de trabajo: núcleo y pruebas de aceptación primero, sin interfaz. Portá el motor tal cual con sus 22 tests y agregá tests para el cronograma (sección 7). El caso de aceptación A de la sección 13 tiene que dar 7,5 activaciones.
3. Lo que no está decidido (sección 16, «Siguen abiertas») no lo inventes: usá el default que está ahí, dejalo como parámetro y anotá la decisión pendiente.
4. Las reglas viven en el servidor; el rol se verifica en cada pedido; escribí un test por rol de lo que ese rol NO puede hacer.
5. Parámetros de negocio en pantalla con historial; un cambio vale hacia adelante y nunca mueve un período cerrado.
6. Reporte de fallas desde el principio (12.6). Listas acotadas (12.7). Íconos en escritorio, palabras en móvil (12.8).
7. No agregues dependencias sin decirlo, y no toques nada de la app de informes fuera de lo que este módulo necesita.
8. Cuando termines una fase, mostrale a Ivan lo que va a ver al abrir, sin configurar nada antes, y decí qué cambió y qué no se ve.
```
