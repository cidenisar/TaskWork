# Backend Online — Sistema de Emergencias Refinería

Servidor que recibe eventos de las Consolas Disparadoras por MQTT, resuelve
a quién avisar, activa los puntos de encuentro del evento y prepara el
despacho de alertas. Implementa el contrato de `05.3-programacion.md`
("Comunicación Pi ↔ Backend Online — MQTT") sobre los datos de
`03-backend-online.md` (proyecto de Supabase `emergencias-refineria`).

## Cómo está armado

```
src/
  types.ts              Tipos compartidos: modelo de datos + payloads MQTT
  logic/                 Lógica de negocio PURA, sin I/O — 100% testeada
    eventos.ts            Resolución de destinatarios, plan de qué hacer con un evento
    accountability.ts      Agregación del resumen ok/ayuda/pendiente
    eventoActivo.ts         A qué consolas (propio sitio + vecinos) avisar
    auth.ts                 Armado del registro de auditoría de PIN
  lib/
    db.ts                  Acceso a Supabase (service_role — bypasea RLS)
    mqtt.ts                Cliente MQTT y helpers de tópicos
  handlers/               Conectan lógica pura + db + mqtt para cada tópico
  index.ts                Punto de entrada
test/                    Tests de la lógica pura (node:test, sin mocks de red)
```

La separación es a propósito: **toda decisión de negocio vive en `src/logic/`,
sin tocar la red ni la base**, así se puede testear sin depender de nada
externo. Los `handlers/` son la parte "tonta" que conecta esa lógica con
Postgres y MQTT.

## Limitación de red de este sandbox (importante)

Este código se escribió en un entorno de Claude sin acceso a los registries
de `npm` ni `pip` (bloqueados por política de red del sandbox — no es una
limitación del código en sí). Por eso:

- **No se pudo correr `npm install`** — las dependencias reales
  (`@supabase/supabase-js`, `mqtt`, `dotenv`) están declaradas en
  `package.json` tal cual las necesita un proyecto Node normal, pero nunca
  se descargaron acá.
- Para poder tipar el código igual, se agregó `src/types/vendor-stubs.d.ts`
  con declaraciones mínimas de esos tres paquetes (y de los globals de
  Node — `console`, `process`, `Buffer` — que normalmente trae
  `@types/node`). **Borrar ese archivo en cuanto se corra `npm install` en
  una máquina con internet** — a partir de ahí, TypeScript va a usar los
  tipos reales y más completos de cada paquete.
- **La lógica pura (`src/logic/`) SÍ se pudo correr y testear de verdad acá**
  (`npm run test`, usando `tsx` — ya venía instalado en este sandbox) — 18
  tests, todos verdes.
- **Las queries de `src/lib/db.ts` se validaron a mano**, corriendo el SQL
  equivalente directo contra el proyecto real de Supabase (con acceso
  administrativo vía el conector, no con el código Node) — ver
  `backend/verificacion_queries_logica.sql` en la carpeta del módulo. Esto
  prueba que las consultas devuelven la forma de datos correcta, pero
  **no reemplaza correr el servidor Node real de punta a punta**.
- Lo que falta para tener esto corriendo de verdad: clonar/copiar esta
  carpeta a una máquina con acceso a internet, `npm install`, completar
  `.env` (copiando `.env.example`) con la `service_role key` real del
  proyecto de Supabase (Project Settings → API — **nunca pegarla en un
  chat ni commitearla**) y un broker MQTT (Mosquitto local alcanza para
  probar), y `npm run dev`.

## Cómo correr esto en una máquina con internet

```bash
npm install
cp .env.example .env   # completar con las credenciales reales
npm run test           # corre los tests de lógica pura
npm run typecheck      # type-check completo (con los tipos reales de cada paquete)
npm run dev            # levanta el servidor contra el Supabase/broker configurados en .env
```

Para probar sin las consolas físicas: instalar Mosquitto local
(`mosquitto -v`) y publicar un mensaje de prueba en el tópico
`consolas/{id}/eventos` con `mosquitto_pub` — el `{id}` tiene que ser el
`id` real de una fila de la tabla `consolas` en Supabase (ver "Cómo se
prueba sin la consola física" en `05.3-programacion.md`, que sugiere el
mismo enfoque para el lado de la Pi).

## Qué está implementado

- Ciclo completo de un evento: DISPARADO abre el evento, resuelve
  destinatarios (personal activo del sitio), activa los puntos de encuentro,
  y publica `evento-activo` al propio sitio y a sus sitios vecinos.
- OK cierra el evento en curso del sitio (no abre uno nuevo) — ver
  "OK vs. CANCELAR — resuelto" en la ficha de Programación.
- CANCELADO no dispara nada — queda como TODO explícito el guardar su
  auditoría (ver "Decisiones pendientes" abajo).
- Idempotencia ante reentrega de MQTT QoS 1 (mismo `eventoId` no se procesa
  dos veces).
- Auditoría de validación de PIN (la consola valida, acá solo se audita).
- Heartbeat y estado online/offline de cada consola (incluido lo que
  publica el broker por Last Will and Testament).
- Sincronización del padrón de operadores hacia las consolas de un sitio
  (alcance puntual + alcance organización).
- Agregación de Accountability en vivo (ok/ayuda/pendiente, total y por
  punto de encuentro).

## Qué NO está implementado todavía (a propósito, ver la ficha)

- **Despacho real de push/SMS** — el proveedor todavía no está elegido (ver
  "Próximos pasos" de `03-backend-online.md`). Hoy el servidor solo loguea
  cuántos destinatarios habría que notificar.
- **Endpoint para las confirmaciones de Mobile** ("estoy bien"/"necesito
  ayuda") — hoy `publicarAccountabilityDeEvento` existe pero nadie la llama
  todavía; falta el canal por el que Mobile manda la confirmación (ver
  "Próximos pasos" de la ficha: REST vs. WebSocket, todavía sin definir).
- **Publicación de `consolas/{id}/simulacro`** — la función de
  `handlers/padron.ts` para el padrón de operadores está armada; falta la
  equivalente para el próximo simulacro programado (mismo patrón, tabla
  `simulacros_programados`).
- **Marcar un simulacro como "no_realizado"** tras pasar un tiempo
  prudencial sin dispararse (ver ficha, "Programador de simulacros") — no
  hay todavía un job periódico para esto.
- **Contador incremental de Accountability** — `calcularAccountability`
  recalcula desde `confirmaciones` completa cada vez; a la escala real
  (2000-4000 personas, ver "Escala esperada" de la ficha) esto necesita
  pasar a contadores que se actualizan por evento en vez de recontar filas
  en cada publicación — queda señalado en el propio código
  (`src/logic/accountability.ts`).

## Decisiones pendientes (para no perderlas de vista)

- Dónde/cómo persistir el registro "CANCELADO (no se envió)" — hoy no hay
  tabla para eso, solo un `console.log` + comentario `TODO` en
  `handlers/eventos.ts`. La ficha dice que la consola ya lo guarda en su
  historial local; falta decidir si Backend Online también necesita su
  propia copia centralizada, o si alcanza con el historial de cada Pi.
- Autenticación de cada consola contra el broker MQTT (usuario/contraseña
  por consola vs. certificado por dispositivo) — ver "Próximos pasos" de la
  ficha de Programación, todavía sin elegir.
- Frecuencia de sincronización del padrón hacia las consolas (¿cada cuánto
  se llama `sincronizarPadronDeSitio`? ¿poll a intervalo fijo, o
  suscripción a cambios de Supabase Realtime sobre `operadores`?).
