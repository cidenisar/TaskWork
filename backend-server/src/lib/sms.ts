// Cliente de Twilio para el despacho de SMS — ver README, "Despacho real de
// push/SMS". Wrapper fino sobre el SDK de Twilio, mismo criterio que
// lib/db.ts sobre @supabase/supabase-js.

import twilioLib from "twilio";

export type ClienteSms = ReturnType<typeof twilioLib>;

/** null si faltan las credenciales — ver mismo comentario en lib/push.ts. */
export function crearClienteSms(): ClienteSms | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    console.warn(
      "[sms] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN no configurados — el despacho por SMS va a fallar hasta que se completen en .env."
    );
    return null;
  }
  return twilioLib(sid, token);
}

export async function enviarSms(client: ClienteSms, telefono: string, texto: string): Promise<void> {
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from) {
    throw new Error("Falta TWILIO_FROM_NUMBER — copiar .env.example a .env y completar.");
  }
  await client.messages.create({ to: telefono, from, body: texto });
}
