import nodemailer from "nodemailer";
import type { createClient } from "@/lib/supabase/server";

/**
 * Envío por Gmail SMTP (cuenta `GMAIL_USER`, autenticada con una
 * "contraseña de aplicación" en `GMAIL_APP_PASSWORD` — nunca la contraseña
 * real de la cuenta). Helper compartido por todos los módulos que generan
 * un PDF al crear/cerrar un registro — antes esto vivía duplicado solo en
 * Informe Técnico. Nunca tira: un fallo de envío no debe cortar la
 * creación del registro que ya se guardó bien.
 *
 * `diagnostico` es opcional (no rompe a quien ya lo llama sin esto) — sin
 * él, un fallo de envío queda invisible (ver CRITERIOS_Y_IDEAS.md): con
 * él, el motivo real queda en Configuración → Errores del dispositivo en
 * vez de perderse, que es la única forma de saber por qué un mail "nunca
 * llegó" sin acceso a los logs del server.
 */
export async function enviarPdfPorEmail(opts: {
  to: string[];
  asunto: string;
  texto: string;
  pdfBuffer: Buffer;
  filename: string;
  diagnostico?: { supabase: Awaited<ReturnType<typeof createClient>>; userId: string; contexto: string };
}): Promise<boolean> {
  if (opts.to.length === 0) return false;
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: opts.to,
      subject: opts.asunto,
      text: opts.texto,
      attachments: [{ filename: opts.filename, content: opts.pdfBuffer }],
    });
    return true;
  } catch (err) {
    if (opts.diagnostico) {
      try {
        const detalle = err instanceof Error ? err.message : String(err);
        await opts.diagnostico.supabase.from("client_errores").insert({
          user_id: opts.diagnostico.userId,
          contexto: opts.diagnostico.contexto,
          mensaje: `No se pudo enviar el PDF por mail a ${opts.to.join(", ")}: ${detalle}`,
          stack: err instanceof Error ? (err.stack ?? null) : null,
        });
      } catch {
        // el diagnóstico es best-effort, nunca debe romper nada más
      }
    }
    return false;
  }
}
