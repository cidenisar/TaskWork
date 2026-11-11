# NOTAS-integracion — Fase 0 (11/11/2026)

Confirmado leyendo el código de `informes-app/` en la rama `claude/guardia-general-traspaso`. No se escribió código del módulo. Falta que Ivan apruebe el plan.

## 1. Confirmado (lo anotado en HANDOFF 2.bis se sostiene)
- **Stack:** Next `^16.4.5` (App Router, Server Actions), React 19.2, Tailwind 4, Supabase (`@supabase/ssr`). `node_modules` no está instalado en este entorno: antes de programar hay que `npm ci` y leer `node_modules/next/dist/docs/` (lo exige `AGENTS.md`).
- **Roles:** `profiles.rol` (tecnico/supervisor/admin/superusuario). `requireProfile()` lee el rol de `profiles` en cada pedido y corta cuentas desactivadas. `requireAdmin()` deja pasar admin y superusuario; **no existe un `requireAdminOSupervisor()`**: hay que crearlo (en SQL sí está `is_admin_or_supervisor()`, ya ampliado con superusuario en `20261106000001`).
- **Teléfono:** `profiles.telefono` (texto, migración `20260902000008`); ya viaja en `getCurrentProfile()`. Falta validar formato internacional al guardar (hoy es texto libre).
- **Auditoría:** `audit_log` existe (init.sql) y solo guarda la acción; el módulo necesita historial propio con antes/después.
- **Push:** **no existe**. No hay service worker ni `web-push` (solo `public/manifest.webmanifest`, `display: standalone`). Hay que construirlo con Web Push + VAPID (`CRITERIOS_Y_IDEAS.md` §6). Agrega la dependencia `web-push` y claves VAPID en variables de entorno (avisar a Ivan).
- **Pruebas:** `package.json` **no tiene ningún runner de tests** (solo `lint` y `typecheck`). El motor se prueba con `node --test` (sin dependencias). Para el resto (permisos por rol, cronograma) hay que decidir: seguir con `node:test` o sumar vitest.
- **Estructura de módulos:** `src/app/(app)/<modulo>/…`, `src/components/<modulo>/`, `src/lib/<modulo>/`, ítem de menú en `src/components/app-shell.tsx` (mapa de submenús) y, para el panel de gestión, `src/components/panel/panel-nav.tsx` + `src/app/panel/…`. Configuración: `src/app/(app)/configuracion/{usuarios,errores,auditoria,…}`.
- **Numeración:** los demás módulos usan número aleatorio (`numero-generacion.ts`). Guardia pide correlativo sin huecos → secuencia propia en SQL; **decisión pendiente (16.11)**.
- **Reporte de fallas:** reutilizable (`client-error-reporter.tsx`, `/api/errores/reportar`, `client_errores`).

## 2. Ajustes al HANDOFF
- Agregar `requireAdminOSupervisor()` en `src/lib/auth.ts` (Fase 2).
- Agregar runner de tests o fijar `node:test` (decisión de Ivan, ver 4).
- Roles: en el HANDOFF decía `tecnico` para quien hace guardia; confirmar que todas las personas de guardia son usuarios de la app con ese rol.

## 3. Plan por fases (HANDOFF §14, con lo concreto)
1. **Núcleo sin UI** en `src/lib/guardia/`: motor portado + 22 tests, cronograma (`diaGuardia`, `inicioSemana`, `guardiaDe`, generar/regenerar, cambio vigente) con tests, caso A = 7,5. Sin dependencias nuevas.
2. **Datos y permisos:** migraciones (personas/áreas, cronograma, cambios, eventos, participaciones, parámetros con historial, feriados, períodos, secuencia) con RLS desde el inicio; Server Actions con hora del servidor, versión e idempotencia; `requireAdminOSupervisor()`; un test por rol de lo que NO puede.
3. **Oficina:** Personas, Parámetros, Feriados/Calendario, Cronograma.
4. **Móvil:** circuito completo y «Mis horas».
5. **Notificaciones:** push (service worker + VAPID + `web-push`), luego enlaces `wa.me`.
6. **Liquidación:** pantalla, CSV, cierre de período, reporte de fallas, listas de 30 + «ver más».
7. **Prueba con datos reales** contra el Excel.

## 4. Lo que necesito de Ivan para empezar la Fase 1
- Aprobar el plan.
- Elegir runner de tests: `node:test` (sin dependencias, recomendado) o vitest.
- Las preguntas abiertas de HANDOFF §16 siguen con su default; ninguna bloquea la Fase 1 salvo 16.11 (numeración) y 16.6–16.7 (zona y orden), que son parámetros.

## 5. No se verificó
- No se instaló ni corrió la app (sin `npm ci`, sin Supabase conectado): lo anterior sale de leer código y migraciones.
- No revisé el sistema de diseño más allá de la estructura (clases `btn`, `wireframe-ui.css`); se hace al empezar la Fase 3.
