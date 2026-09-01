# Runbook: de "anda en mi sandbox" a un server real

Escrito 2026-09-01, después de la primera vez que `backend-server` salió de
un entorno de desarrollo/sandbox a una VM real (Oracle Cloud) alcanzable
desde internet, y de armar el primer build real de `mobile/` (EAS Build)
apuntando a esa VM. Todo lo de acá se **encontró haciéndolo**, no se
sabía de antemano — la idea es no volver a perder el tiempo con los mismos
problemas la próxima vez (este repo u otro).

No es una guía genérica de Oracle Cloud/EAS — es la lista concreta de
cosas que rompieron y cómo se resolvieron, en el orden en que aparecieron.

## 1. Elegir dónde hostear

Restricción real que arrancó todo esto: los teléfonos de la planta tienen
MDM que no deja instalar APKs sueltos, así que `mobile/` tiene que
distribuirse por una build real (EAS), y una build real necesita una URL
de backend que exista de verdad y sea siempre alcanzable — no
`localhost`, no un túnel de `ngrok` que se cae. Eso fuerza a desplegar
`backend-server` en algún lado antes de poder compilar `mobile/` en
serio.

**Oracle Cloud "Always Free"** se eligió por costo (gratis de por vida
dentro de los límites del free tier, contra ~5-10 USD/mes de alternativas
tipo Railway) — con la salvedad de que pide tarjeta de crédito para
verificar identidad, aunque no cobra dentro del free tier.

**Hallazgo:** la forma ARM del free tier (`VM.Standard.A1.Flex`, la más
promocionada) da error de **"Capacidad insuficiente"** en la práctica —
es un problema conocido y común, no algo mal configurado. La alternativa
real es la forma AMD **`VM.Standard.E2.1.Micro`** (1 OCPU, 1GB RAM),
mucho menos disputada. Está escondida bajo la pestaña **"Especialidad y
generación anterior"** del selector de forma — NO bajo la pestaña "AMD"
(que solo lista formas pagas nuevas, E5.Flex/E4.Flex).

## 2. Red: dos capas de firewall, no una

Esto costó la sesión entera de un día — ver la sección 3. El resumen:
Oracle tiene **dos firewalls independientes** y hay que abrir el puerto
en los dos, o no entra tráfico:

1. **Security List** de la VCN/subnet (nivel nube) — reglas de ingreso
   por puerto/protocolo/origen. Se configura en la consola o por
   `oci network security-list update`.
2. **`iptables` local**, adentro de la propia VM — las imágenes Ubuntu de
   Oracle **traen por defecto una regla que solo deja pasar el puerto 22**
   y rechaza todo lo demás (`REJECT ... reject-with icmp-host-prohibited`).
   Esto es específico de las imágenes de Oracle, no algo que traiga
   Ubuntu en otros proveedores — hay que verificarlo siempre, no asumir
   que abrir el Security List alcanza.

Checklist de puertos para este proyecto: 22 (SSH), 1883 (MQTT), 8090
(HTTP de `backend-server`), 9001 (MQTT sobre WebSocket) — abrir los 4 en
**ambos** lados.

```bash
# Dentro de la VM, insertar antes de la regla REJECT (normalmente la última):
sudo iptables -I INPUT 5 -p tcp -m state --state NEW -m tcp --dport 8090 -j ACCEPT
# ...repetir por puerto. Después, persistir para que sobreviva un reinicio:
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

Para el Security List, si hay CLI de Oracle a mano (Cloud Shell la trae
pre-autenticada) es mucho más rápido que la consola web:

```bash
COMPARTMENT_ID=$(oci iam availability-domain list --query 'data[0]."compartment-id"' --raw-output)
VCN_ID=$(oci network vcn list --compartment-id "$COMPARTMENT_ID" --query 'data[0].id' --raw-output)
SL_ID=$(oci network security-list list --compartment-id "$COMPARTMENT_ID" --vcn-id "$VCN_ID" --query 'data[0].id' --raw-output)
# oci network security-list update --security-list-id "$SL_ID" --force --ingress-security-rules '[...]'
```

(`oci iam compartment list` sin más devuelve **sub**-compartimentos, no
el raíz — si todo vive en el compartimento raíz de la cuenta, hay que
sacar el OCID de la tenancy con `oci iam availability-domain list`, no
con `compartment list`.)

**Verificar SIEMPRE desde afuera de verdad**, no solo con `curl
localhost` desde adentro de la VM — eso solo prueba que el proceso
escucha, no que la red deja pasar el tráfico. Un navegador normal
pegándole a `http://<ip-pública>:<puerto>` (o `curl` desde otra máquina)
es la única prueba real. Si no hay otra máquina a mano, un vistazo con
`sudo ss -tlnp | grep <puerto>` en la VM al menos confirma que el
proceso sí está escuchando, antes de salir a cazar el firewall.

## 3. SSH: la llave es inmutable después de crear la instancia

Oracle no deja cambiar la `ssh_authorized_keys` de una instancia después
de creada — ni por consola ni por `oci compute instance update`
(`InvalidParameter`, "must be provided with the already existing
value"). Si se pierde la llave privada (pasó dos veces en esta sesión:
una vez por bloqueo de red del lado del usuario, otra porque una sesión
de Cloud Shell no persistió `~/.ssh`), **no hay forma de recuperar
acceso a esa instancia** por API/consola.

La salida práctica, si todavía no se configuró nada importante en la VM:
**terminar la instancia y crear una nueva**, reutilizando la misma
VCN/subnet (así el Security List y las rutas no hay que rehacerlas). Si
ya hay trabajo real hecho en el disco que no se puede perder, la
alternativa es un "rescate" de disco (adjuntar el boot volume a una
instancia temporal, editar `authorized_keys` a mano, reasignar) — mucho
más largo, solo vale la pena si de verdad hay algo que no se puede
rehacer en minutos.

`ssh-keygen -t ed25519` puede fallar con **"ED25519 keys are not allowed
in FIPS mode"** en entornos con FIPS activado (Oracle Cloud Shell, ver
sección 6) — usar `ssh-keygen -t rsa -b 4096` ahí.

## 4. Mosquitto 2.x con autenticación real

Ubuntu 20.04 trae Mosquitto 1.6.9 por defecto — **sin el plugin
dynamic-security** (es de Mosquitto 2.0+). Hace falta el PPA:

```bash
sudo add-apt-repository -y ppa:mosquitto-dev/mosquitto-ppa
sudo apt update && sudo apt install -y mosquitto mosquitto-clients
```

El bootstrap de dynamic-security (init del admin, roles, ACLs, clientes)
está documentado paso a paso en `backend-server/README.md`, sección
"Autenticación de las consolas contra Mosquitto" — se siguió tal cual.

**Bug real encontrado acá:** `sudo mosquitto_ctrl dynsec init
dynamic-security.json ...` crea el archivo **con dueño `root`**, pero el
proceso de Mosquitto corre como usuario `mosquitto`. Sin corregir el
dueño, **todo** comando `mosquitto_ctrl` posterior (crear roles, ACLs,
clientes) falla con `Connection error: Not authorized` — con la
contraseña bien puesta, lo cual confunde mucho porque el error sugiere
credenciales mal, no permisos de archivo. Antes de sospechar de la
contraseña, chequear el dueño del archivo:

```bash
sudo chown mosquitto:mosquitto /etc/mosquitto/dynamic-security.json
sudo systemctl restart mosquitto
```

## 5. Clonar el repo: la rama por default no es la de trabajo

**Este fue el bug más largo de diagnosticar de toda la sesión.** Un
`git clone` sin `-b <rama>` baja la rama default del repo (`main`), que
puede estar muy atrás de la rama donde vive el trabajo real (acá,
`claude/emergencias-refineria-resume-kmlfvl`). El síntoma no fue un
error de git — fue que `backend-server` **compiló sin errores** y
**arrancó sin errores**, pero el servidor HTTP nunca abría el puerto
(sin tirar ninguna excepción, sin loguear nada raro). El motivo real: el
`dist/index.js` compilado correspondía a una versión mucho más vieja del
código (sin servidor HTTP, sin push, sin despachador) que sí existía en
`main` — nada estaba roto, se estaba corriendo código viejo sin saberlo.

**Cómo se encontró:** cuando algo arranca "bien" pero un pedazo entero
falta en silencio, antes de sospechar del entorno hay que comparar el
`dist/` compilado contra el `src/` esperado (`grep` por una función que
debería estar) — y si no coincide, lo primero a revisar es qué rama y
qué commit hay realmente (`git log --oneline -3`), no el código en sí.

```bash
git clone <url>
cd <repo>
git fetch origin <rama-de-trabajo>
git checkout <rama-de-trabajo>   # confirmar con git log que aparece el commit esperado
```

## 6. Reloj / JWT "issued in the future"

Se vio una vez, transitorio: la sincronización periódica contra Supabase
falló con `PGRST303 — JWT issued at future`. El reloj de la VM estaba
bien sincronizado (`timedatectl` mostraba NTP activo) y la key funcionaba
perfecto pegándole directo a la API con `curl` — así que no era ni la
key ni el reloj. No se pudo identificar la causa exacta (probablemente
algo transitorio de la primera conexión HTTPS saliente de una VM recién
booteada); reintentar arrancar el proceso lo resolvió y no volvió a
pasar. Anotado por si reaparece: **descartar reloj y validez de la key
por separado antes de asumir que es un problema de código** (un `curl`
directo a la API con la misma key, aparte del código de la app, aísla
rápido si el problema es la key/reloj o el cliente).

## 7. Dejarlo corriendo de verdad: `pm2`

```bash
sudo npm install -g pm2
pm2 start dist/index.js --name backend-server
pm2 save
pm2 startup   # imprime un comando "sudo env PATH=... pm2 startup systemd -u <user> --hp <home>" — copiarlo y correrlo tal cual
pm2 save      # repetir después del startup, para congelar la lista con el servicio systemd ya armado
```

Sin el `pm2 startup` + `systemctl enable` que genera, el proceso muere
al reiniciar la VM aunque `pm2 save` ya se haya corrido antes — el
`startup` es el que deja el servicio systemd que revive `pm2resurrect`
en el boot.

## 8. EAS Build: tres entornos distintos, tres problemas distintos

Armar el build de `mobile/` necesitó probar **tres entornos** hasta
encontrar uno que funcionara — vale la pena anotar por qué cada uno
falló, para no repetir el orden de descarte:

**a) El sandbox de Claude Code Remote (donde corre el asistente) —
bloqueado por política.** `api.expo.dev` está explícitamente denegado
por la política de red del proxy de salida (egress) del entorno —
`curl -v` muestra `connect_rejected`/`403` desde el proxy, no un timeout
de red. `npm install` funciona ahí igual (`registry.npmjs.org` sí está
permitido) pero cualquier llamada real a la API de Expo, no. No hay
vuelta que darle desde ese entorno — hace falta un entorno con salida a
internet sin esa restricción.

**b) Oracle Cloud Shell — FIPS rompe el hasheo interno de EAS.**
Cloud Shell corre con el sistema en **modo FIPS**, que deshabilita MD5 a
nivel de OpenSSL del sistema operativo (mismo motivo por el que
`ssh-keygen -t ed25519` falla ahí, ver sección 3). El CLI de Expo usa
`crypto.createHash` en varios puntos — telemetría (se esquiva con
`EXPO_NO_TELEMETRY=1`) pero también, más grave, **al comprimir y subir
el tarball del proyecto a EAS Build**, que no tiene variable de entorno
para saltearse. Ahí no hay workaround liviano — es una restricción de
FIPS a nivel de SO, no algo que se apague por proceso.

**c) La VM real (Ubuntu normal, sin FIPS) — funciona.** La misma VM
donde ya corre `backend-server` sirvió perfecto: Node 22 ya instalado,
sin restricción de red ni de FIPS. **Para cualquier build real de EAS,
usar una VM/máquina Linux normal — nunca Cloud Shell ni un sandbox con
egress restringido.**

## 9. Terminales web que enmascaran texto largo al pegar

Cloud Shell de Oracle (la interfaz web, no algo del SSH en sí — el mismo
problema aparece incluso usando esa terminal para hacer SSH a otra
máquina) **reemplaza automáticamente strings largos con forma de
token/secreto por puntos (`•••`) apenas se pegan**, y esto no es solo
visual — el archivo que termina en disco tiene los puntos literales, no
el valor real. Pasó con una clave JWT de Supabase (`anon` key) y con un
token de acceso de Expo, ambos de +40 caracteres.

**Cómo se detectó:** nunca confiar en "se ve bien" para un secreto largo
pegado en una terminal así — comparar un hash:

```bash
# valor esperado, calculado aparte (por ejemplo, con el string en texto plano fuera de esa terminal):
echo -n '<valor-real>' | sha256sum
# contra lo que quedó en el archivo:
grep 'CLAVE=' .env | cut -d= -f2- | tr -d '\n' | sha256sum
```

**Cómo se resolvió:** partir el string en pedazos cortos (~15-20
caracteres) que individualmente no disparan el detector de "esto parece
un secreto", asignarlos a variables de shell, y concatenarlos recién
adentro de la terminal:

```bash
P1="primeros20caracteres"
P2="siguientes20caracteres"
# ...
KEY="$P1$P2..."
```

Confirmar siempre con el hash después de armarlo. Esto no es específico
de Oracle — cualquier terminal web con "protección" de secretos al pegar
puede hacer lo mismo; vale la pena probarlo con un hash antes de asumir
que un `.env` armado así en un navegador quedó bien.

## 10. El `.env` no viaja al build de EAS

`mobile/.env` está en `.gitignore` (correcto — nunca debe ir al repo) y
**por eso mismo `eas build` no lo sube**: el tarball que se comprime y
manda a los servidores de EAS respeta `.gitignore`. El primer build de
esta sesión salió con el log **"No environment variables ... found for
the 'preview' environment on EAS"** — silencioso, no es un error, así
que es fácil no notarlo y terminar con un `.apk` que compila perfecto
pero no tiene ni la URL de Supabase ni la del backend adentro.

La solución es EAS Environment Variables, configuradas del lado de EAS
(no del `.env` local) **antes** de lanzar el build:

```bash
npx eas-cli env:set --name EXPO_PUBLIC_SUPABASE_URL --value "..." \
  --type string --visibility plaintext \
  --environment production --environment preview --environment development \
  --non-interactive
# repetir por cada variable EXPO_PUBLIC_*
```

**Verificar siempre**, en el log de `eas build`, la línea "Environment
variables ... loaded from the '<perfil>' environment on EAS:
<lista>" — si dice "No environment variables ... found", cancelar
(`eas build:cancel <id>`) y volver a lanzar después de cargarlas; un
build sin esas variables no vale la pena esperarlo.

## Resumen para la próxima vez

Antes de dar por buena una VM/deploy nuevo, en este orden:
1. ¿El Security List de la nube tiene el puerto? ¿Y el firewall local
   (`iptables`/`ufw`) de la VM? (dos capas, ambas)
2. ¿Se puede llegar desde AFUERA de verdad (navegador/otra máquina), no
   solo `curl localhost`?
3. ¿El código corriendo es el commit/rama que se cree que es? (`git log`
   antes de sospechar de la lógica)
4. Para cualquier CLI que suba algo a un servicio en la nube (EAS, y
   probablemente otros): ¿el entorno desde el que se corre tiene salida
   de red normal (no un sandbox con proxy restringido) y no está en modo
   FIPS?
5. Para builds con variables de entorno: ¿el log confirma que las cargó,
   o dice "no se encontraron"?
6. Para cualquier secreto largo pegado en una terminal web: ¿el hash
   coincide con el valor real?
