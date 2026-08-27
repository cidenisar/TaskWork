#!/usr/bin/env bash
# Provisiona una consola nueva contra el broker Mosquitto (plugin
# dynamic-security) — ver README, "Autenticación de las consolas contra
# Mosquitto". Crea un rol dedicado a esa consola (ACLs literales, no
# plantilla: %u/%c NO se sustituyen en las ACLs de dynamic-security en
# Mosquitto 2.0.18, se confirmó al probarlo — por eso un rol por consola en
# vez de uno compartido), un cliente con esa contraseña, y le asigna el rol.
#
# Uso:
#   DYNSEC_ADMIN_USER=... DYNSEC_ADMIN_PASS=... ./provisionar-consola.sh <consolaId>
#
# Variables de entorno:
#   MOSQUITTO_HOST   (default: localhost)
#   MOSQUITTO_PORT   (default: 1883)
#   DYNSEC_ADMIN_USER  (obligatoria — el admin de dynsec, no el de la propia consola)
#   DYNSEC_ADMIN_PASS  (obligatoria)
#
# Requiere mosquitto_ctrl (paquete mosquitto-clients) y node (para generar
# la contraseña).

set -euo pipefail

CONSOLA_ID="${1:?uso: provisionar-consola.sh <consolaId>}"
HOST="${MOSQUITTO_HOST:-localhost}"
PORT="${MOSQUITTO_PORT:-1883}"
ADMIN_USER="${DYNSEC_ADMIN_USER:?falta la variable de entorno DYNSEC_ADMIN_USER}"
ADMIN_PASS="${DYNSEC_ADMIN_PASS:?falta la variable de entorno DYNSEC_ADMIN_PASS}"

CONN=(-h "$HOST" -p "$PORT" -u "$ADMIN_USER" -P "$ADMIN_PASS")
ROLE="consola-$CONSOLA_ID"
PASSWORD=$(node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))")

mosquitto_ctrl "${CONN[@]}" dynsec createRole "$ROLE"
mosquitto_ctrl "${CONN[@]}" dynsec addRoleACL "$ROLE" publishClientSend "consolas/$CONSOLA_ID/eventos" allow
mosquitto_ctrl "${CONN[@]}" dynsec addRoleACL "$ROLE" publishClientSend "consolas/$CONSOLA_ID/auth" allow
mosquitto_ctrl "${CONN[@]}" dynsec addRoleACL "$ROLE" publishClientSend "consolas/$CONSOLA_ID/heartbeat" allow
mosquitto_ctrl "${CONN[@]}" dynsec addRoleACL "$ROLE" publishClientSend "consolas/$CONSOLA_ID/estado" allow
mosquitto_ctrl "${CONN[@]}" dynsec addRoleACL "$ROLE" subscribeLiteral "consolas/$CONSOLA_ID/padron" allow
mosquitto_ctrl "${CONN[@]}" dynsec addRoleACL "$ROLE" subscribeLiteral "consolas/$CONSOLA_ID/simulacro" allow
mosquitto_ctrl "${CONN[@]}" dynsec addRoleACL "$ROLE" subscribeLiteral "consolas/$CONSOLA_ID/evento-activo" allow
mosquitto_ctrl "${CONN[@]}" dynsec addRoleACL "$ROLE" subscribePattern "consolas/$CONSOLA_ID/accountability/+" allow

mosquitto_ctrl "${CONN[@]}" dynsec createClient "$CONSOLA_ID" -p "$PASSWORD"
mosquitto_ctrl "${CONN[@]}" dynsec addClientRole "$CONSOLA_ID" "$ROLE"

echo ""
echo "Consola $CONSOLA_ID provisionada."
echo "  username: $CONSOLA_ID"
echo "  password: $PASSWORD"
echo ""
echo "Guardar esta contraseña ahora — dynsec no la devuelve de nuevo (solo se"
echo "puede resetear con 'mosquitto_ctrl dynsec setClientPassword'). Va en la"
echo "configuración MQTT de la Pi de esa consola, nunca en este repo."
