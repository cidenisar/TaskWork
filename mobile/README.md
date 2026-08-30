# Mobile — App de Personal

Arrancado 2026-08-30. Ver `ROADMAP.md` (sección 4) y `backend-server/README.md`
("Autoregistro de personas (Mobile)", "RLS: Mobile puede leer puntos de
encuentro...") para todo el contrato de backend que esta app consume —
estaba listo desde antes, esta carpeta es la primera vez que hay un
cliente de verdad para él.

## Stack y por qué

**Expo (React Native + TypeScript), navegación con React Navigation**
(`native-stack`, explícito — mismo estilo que `frontend-web` usa React
Router con `<Route>` declarados a mano, no ruteo por archivos). Elegido
sobre Expo Router/Flutter/nativo por lo mismo que ya guió otras
decisiones de esta sesión: es lo que más se parece al resto del stack
(TS de punta a punta) y Expo Go permite probar en un teléfono real sin
instalar herramientas de compilación nativas — mismo criterio que llevó
a `consola-virtual.html` en vez de pedirle al usuario que arme un
entorno de Raspberry Pi para ver algo andar.

`@supabase/supabase-js` con sesión persistida en `AsyncStorage` (no hay
`localStorage` en React Native) — mismo cliente/criterio que
`frontend-web/src/lib/supabase.ts`, siempre con la clave anon, nunca
`service_role`.

## Cómo correr esto

```bash
cd mobile
cp .env.example .env   # completar con la URL/anon key de Supabase + la URL de backend-server
npm install
npm run start           # levanta Metro — escaneá el QR con la app Expo Go (Android/iOS)
```

Necesita `backend-server` corriendo y alcanzable desde el teléfono (no
`localhost` si el teléfono no es el mismo dispositivo — usar la IP de
la máquina en la red local, o un túnel tipo `ngrok`/`expo tunnel`).

**Sin Firebase configurado, los push no van a andar** — ver "Push" más
abajo. Todo lo demás (registro, ver el estado propio, confirmar una
alerta manualmente desde "Mis alertas") funciona sin eso.

## Qué hay

- **Sesión sin login**: al abrir la app por primera vez se crea sola
  una sesión anónima de Supabase Auth (`signInAnonymously()`, confirmado
  habilitado en el proyecto real) — no hay ninguna pantalla de
  email/contraseña, coherente con que el wireframe original tampoco la
  tenía (ver `backend-server/README.md`, "Autoregistro de personas
  (Mobile)"). Se guarda en el dispositivo; la próxima vez que se abre
  la app ya existe.
- **Registro** — dos de los tres flujos documentados en
  `backend-server/README.md`:
  - **"Ya estoy en el padrón"** (`POST /personas/reclamar`) — legajo +
    DNI.
  - **"Tengo un código de acceso"** (`POST /personas/canjear-codigo`) —
    código + nombre + teléfono (+ DNI si el código lo pide).
  - **Falta "Autoregistro"** (`POST /personas/autoregistro`, "no me
    encontraron, pido el alta") — ver "Qué falta" más abajo, es una
    decisión de diseño pendiente, no una pantalla que falte escribir sin
    más.
- **Estado de la cuenta** — si la persona vinculada no está `activo`
  (`pendiente_aprobacion`, `rechazado`, `de_baja`, `vencido`), una
  pantalla explica cuál es la situación en vez de mostrar el Home como
  si estuviera todo bien — ninguno de esos 4 estados recibe alertas
  nuevas (el despacho solo dispara a `estado === 'activo'`).
- **Home** — nombre, botón para habilitar notificaciones push (ver
  abajo), acceso a "Mis alertas".
- **Mis alertas** — lista las confirmaciones propias (lectura directa
  contra Supabase, política `confirmaciones_self_read` + las otras 4
  del mismo grupo, ver `backend-server/README.md`) con el tipo de
  evento y su estado (pendiente/OK/ayuda). Tocar una pendiente de un
  evento todavía en curso abre la pantalla de confirmar.
- **Confirmar alerta** — elegir un punto de encuentro habilitado para
  ESE evento y mandar "Estoy bien" (`POST /confirmaciones`,
  `estado: "ok"`), o "Necesito ayuda" con una nota opcional
  (`estado: "ayuda"`). Misma regla que ya vale para el resto del
  sistema: la identidad de quién confirma sale del JWT, nunca de un
  campo del body.

## Push

`enviarPush` (backend-server) usa Firebase Admin directo — necesita el
**token nativo real** del dispositivo (FCM en Android/APNs en iOS,
`Notifications.getDevicePushTokenAsync()`), no el token del servicio de
push propio de Expo (`getExpoPushTokenAsync()`, que backend-server no
sabe interpretar). Ver `src/lib/push.ts`.

**Limitación real, no de este código**: desde el SDK 53 de Expo, las
notificaciones push remotas están deshabilitadas en Expo Go — hace
falta un *development build* (`npx expo run:android` /
`npx expo run:ios`, o un build de EAS) para probar el registro y la
recepción de verdad en un dispositivo físico. Nada de esto se pudo
probar en este entorno (sandbox sin dispositivo físico ni Android
Studio/Xcode) — el registro del token (`POST /personas/push-token`) SÍ
se validó de punta a punta contra Supabase/backend-server reales, con
un token de prueba inventado (ver "Validado" más abajo); lo que falta
es la parte nativa (pedir permiso, obtener el token real, recibirlo en
segundo plano), que necesita ese build y un teléfono.

**`google-services.json`** (Android) hace falta para eso — es el mismo
proyecto de Firebase que ya usa `backend-server` (`FIREBASE_PROJECT_ID`
en su `.env`), así que ya existe, solo falta bajar el archivo de
configuración de Android desde la consola de Firebase y ponerlo en
`mobile/google-services.json` (gitignoreado, como el resto de las
credenciales de este repo). `app.json` ya lo referencia.

## Qué falta (a propósito, ver `ROADMAP.md`)

- **Autoregistro** ("no me encontraron, pido el alta") — el endpoint
  (`POST /personas/autoregistro`) pide un `sitioId`, pero HOY no hay
  forma de que una sesión sin persona vinculada sepa qué sitios existen
  para elegir: `sitios` es `org_isolation` (admin-only), y antes de
  registrarse no hay ninguna fila de `personas` de la que derivar una
  organización. Tres caminos posibles, ninguno construido:
  1. Configurar la app por organización (una variable de entorno con el
     `organizacion_id`, cada cliente real instala su propio build) y
     agregar una política RLS de lectura de `sitios` acotada a esa
     organización.
  2. Un endpoint nuevo de backend, algo como `GET /sitios/publicos?organizacionId=`.
  3. Una política RLS abierta (`sitios`, solo `id`+`nombre`) — hoy hay
     una sola organización real en producción, así que el riesgo de
     enumeración entre organizaciones es bajo, pero deja de serlo el
     día que el plan multi-tenant (ver ROADMAP.md, charla del toggle de
     SMS) sea real.
  Es una decisión de producto/seguridad, no una que convenga tomar sola
  — queda pendiente de acordar con el usuario.
- **Push real** (recepción en segundo plano, permiso, token real) —
  necesita un development build y un teléfono físico, ver arriba.
- **Autoaprobación de personal fijo nuevo** — depende de que se
  construya autoregistro primero.
- **Íconos/splash reales** — quedaron los que trae el template de Expo
  por default; `app.json` no tiene un `notification-icon.png` propio
  todavía (usa el default de `expo-notifications`).
- **Ubicación** (`ubicacionLat`/`ubicacionLng` en `POST /confirmaciones`)
  — el contrato ya la acepta, esta primera versión siempre manda `null`
  (no se pidió, y pedir permiso de ubicación es otra decisión de
  producto aparte).

## Validado (2026-08-30)

De punta a punta contra Supabase y `backend-server` reales (broker MQTT
local + backend corriendo, mismo entorno que se usó para validar
`consola-virtual.html`), simulando exactamente lo que hace esta app —
sin poder abrir la app en sí en este entorno (sin dispositivo físico,
Expo Go no se puede automatizar acá), así que se armó un script que
repite las mismas llamadas (misma sesión anónima real, mismos
endpoints, mismas queries directas a Supabase con la clave anon) que
`src/lib/*.ts` haría de verdad:

1. Sesión anónima real (`signInAnonymously()`).
2. `POST /personas/reclamar` con una persona de prueba real → `200`;
   reintento desde la misma sesión → idempotente.
3. Lectura de la propia persona (`personas_self_read`) — nombre/estado/
   sitio correctos.
4. Un evento real disparado por MQTT (mismo mecanismo que
   `consola-virtual.html`) contra el sitio de esa persona.
5. "Mis alertas" (`confirmaciones_self_read` + `eventos_notificado_lectura`
   + `tipos_evento_lectura_persona`, con el embed completo que usa
   `lib/alertas.ts`) — el evento aparece, con el tipo resuelto bien.
6. Puntos de encuentro habilitados de ese evento
   (`eventos_puntos_estado_lectura_notificado` +
   `puntos_encuentro_lectura_sitio_propio`) — los 2 puntos reales del
   sitio, correctos.
7. `POST /confirmaciones` con `estado: "ok"` y un punto real → `200`,
   la fila queda `estado: "ok"` con el `punto_id` correcto.
8. `POST /personas/push-token` con un token inventado → `200`.
9. Segunda sesión anónima, `POST /personas/canjear-codigo` con un
   código de prueba real → `201`, activa al instante.

Todo pasó. Datos y cuentas de Auth de prueba borrados al terminar. Ver
`backend-server/README.md` para un hallazgo aparte encontrado en el
camino (recursión infinita en una política RLS, ya arreglada, y una
nota sobre un plan cacheado por el pooler de conexiones).

`npm run typecheck` limpio. Sin tests unitarios propios todavía — esta
app no tiene lógica pura propia (todo es orquestación de I/O contra
Supabase/backend-server, ya cubiertos por sus propios tests) salvo
`src/lib/*.ts`, que son wrappers finos sin ninguna decisión que valga
la pena testear en aislamiento — mismo criterio que
`frontend-web/src/lib/*.ts`.
