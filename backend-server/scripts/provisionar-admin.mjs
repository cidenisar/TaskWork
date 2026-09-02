#!/usr/bin/env node
// Crea el primer admin de una organización — bootstrap. Ver README,
// "Alta de operadores y login web para admins": `POST /operadores`
// necesita estar autenticado como un admin que YA existe, así que el
// primerísimo admin de cada organización no puede pasar por ahí — se
// crea con este script, corrido a mano con la service_role key (mismo
// criterio que provisionar-consola.sh para la primera consola).
//
// A diferencia de provisionar-consola.sh (bash + mosquitto_ctrl), esto
// necesita el cliente de Supabase y bcrypt — más directo en Node plano
// (sin tsx: no vale la pena que un script de bootstrap dependa del
// toolchain de TypeScript del proyecto).
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/provisionar-admin.mjs <organizacionId> <nombre> <email>
//
// Requiere que `@supabase/supabase-js` y `bcryptjs` ya estén instalados
// (`npm install` en backend-server/).

import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";

const [organizacionId, nombre, email] = process.argv.slice(2);
if (!organizacionId || !nombre || !email) {
  console.error("uso: node scripts/provisionar-admin.mjs <organizacionId> <nombre> <email>");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error("faltan las variables de entorno SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey);

// Mismo formato que logic/operadores.ts (generarPin) — 4 dígitos, el
// teclado numérico de consola-pi solo acepta ese largo.
function generarPin() {
  return randomInt(10000).toString().padStart(4, "0");
}

const { data: sitioCheck, error: errOrg } = await supabase.from("organizaciones").select("id").eq("id", organizacionId).maybeSingle();
if (errOrg) throw errOrg;
if (!sitioCheck) {
  console.error(`no existe la organización ${organizacionId}`);
  process.exit(1);
}

const { data: authUser, error: errInvite } = await supabase.auth.admin.inviteUserByEmail(email);
if (errInvite || !authUser.user) {
  console.error(`no se pudo invitar por email: ${errInvite?.message ?? "sin usuario devuelto"}`);
  console.error(
    "Nota: el envío de mails integrado de Supabase tiene un rate limit muy bajo por defecto — " +
      "si esto falla en un proyecto nuevo, puede ser necesario configurar un proveedor SMTP propio " +
      "en el dashboard de Supabase (Authentication > Email) antes de reintentar."
  );
  process.exit(1);
}

const pin = generarPin();
const pinHash = await bcrypt.hash(pin, 10);

const { data: operador, error: errCrear } = await supabase
  .from("operadores")
  .insert({
    organizacion_id: organizacionId,
    nombre,
    rol: "admin",
    alcance_tipo: "organizacion",
    pin_hash: pinHash,
    auth_user_id: authUser.user.id,
  })
  .select("id")
  .single();
if (errCrear) throw errCrear;

console.log(`Admin creado: ${operador.id}`);
console.log(`PIN inicial (se muestra una sola vez, después queda hasheado): ${pin}`);
console.log(`Invitación enviada a ${email} — el link para poner contraseña llega por mail.`);
