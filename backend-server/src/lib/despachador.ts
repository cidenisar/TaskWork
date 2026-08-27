// Decide push vs. SMS por persona (mismo criterio que canalDePersona, ver
// logic/eventos.ts) y llama al wrapper de I/O correspondiente. Punto único
// que usa handlers/eventos.ts para el despacho real — así el handler no
// necesita saber nada de Firebase/Twilio.

import type { App } from "firebase-admin/app";
import { enviarPush } from "./push.js";
import { enviarSms, type ClienteSms } from "./sms.js";
import { canalDePersona } from "../logic/eventos.js";
import type { Persona } from "../types.js";
import type { MensajeDespacho } from "../logic/despacho.js";

export class Despachador {
  constructor(
    private pushApp: App | null,
    private smsClient: ClienteSms | null
  ) {}

  async despacharAPersona(persona: Persona, mensaje: MensajeDespacho): Promise<void> {
    if (canalDePersona(persona) === "push") {
      if (!this.pushApp) {
        throw new Error("Firebase no configurado (ver .env.example, FIREBASE_*) — no se pudo enviar el push.");
      }
      // canalDePersona ya garantiza push_token no-null acá.
      await enviarPush(this.pushApp, persona.push_token as string, {
        titulo: mensaje.titulo,
        cuerpo: mensaje.cuerpo,
        data: mensaje.data,
      });
    } else {
      if (!this.smsClient) {
        throw new Error("Twilio no configurado (ver .env.example, TWILIO_*) — no se pudo enviar el SMS.");
      }
      await enviarSms(this.smsClient, persona.telefono, mensaje.textoSms);
    }
  }
}
