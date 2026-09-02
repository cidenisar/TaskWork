// Cliente de Twilio para el despacho de SMS — ver README, "Despacho real de
// push/SMS". Wrapper fino sobre el SDK de Twilio, mismo criterio que
// lib/db.ts sobre @supabase/supabase-js.
//
// "Modo consola" (2026-08-30): sin TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN, el
// SMS no falla — se imprime acá, en esta terminal, en vez de salir de
// verdad. Pensado para poder probar el despacho de punta a punta (incluida
// la consola virtual) sin tener que dar de alta una cuenta en ningún
// proveedor de SMS (Twilio, Vonage, etc.) solo para desarrollo/demo. Antes
// de esto, faltando Twilio, el despacho por SMS directamente fallaba (ver
// README, "Despacho real de push/SMS" — el comportamiento de push sigue
// siendo ese, fallar con el error logueado, no se tocó acá: no lo pidieron).
import twilioLib from "twilio";

export type ClienteSms = { modo: "twilio"; client: ReturnType<typeof twilioLib> } | { modo: "consola" };

export function crearClienteSms(): ClienteSms {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    console.warn(
      "[sms] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN no configurados — modo consola: el SMS se va a imprimir acá en vez de enviarse de verdad."
    );
    return { modo: "consola" };
  }
  return { modo: "twilio", client: twilioLib(sid, token) };
}

export async function enviarSms(cliente: ClienteSms, telefono: string, texto: string): Promise<void> {
  if (cliente.modo === "consola") {
    console.log(`[sms] (modo consola — no se envía de verdad, ver TWILIO_* en .env) para ${telefono}:\n    "${texto}"`);
    return;
  }
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from) {
    throw new Error("Falta TWILIO_FROM_NUMBER — copiar .env.example a .env y completar.");
  }
  await cliente.client.messages.create({ to: telefono, from, body: texto });
}
