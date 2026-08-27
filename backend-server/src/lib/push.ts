// Cliente de Firebase Cloud Messaging para el despacho de push — ver
// README, "Despacho real de push/SMS". Un wrapper fino sobre firebase-admin,
// mismo criterio que lib/db.ts sobre @supabase/supabase-js.

import { initializeApp, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

/**
 * null si faltan las credenciales — a propósito no tira: el resto del
 * backend (eventos, confirmaciones, simulacro...) no depende de Firebase
 * y tiene que poder arrancar igual (ver README, "Despacho real de
 * push/SMS"). Despachador reporta el fallo por persona cuando de verdad
 * intenta despachar sin cliente configurado, en vez de tumbar todo al boot.
 */
export function crearClientePush(): App | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // El private_key del JSON de Firebase trae saltos de línea reales; al
  // pasar por una variable de entorno (.env) llegan como "\n" literales —
  // hay que des-escaparlos antes de pasárselo a cert().
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    console.warn(
      "[push] FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY no configurados — el despacho por push va a fallar hasta que se completen en .env."
    );
    return null;
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export async function enviarPush(
  app: App,
  pushToken: string,
  mensaje: { titulo: string; cuerpo: string; data: Record<string, string> }
): Promise<void> {
  await getMessaging(app).send({
    token: pushToken,
    notification: { title: mensaje.titulo, body: mensaje.cuerpo },
    data: mensaje.data,
  });
}
