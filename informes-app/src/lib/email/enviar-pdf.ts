import nodemailer from "nodemailer";

/**
 * Envío por Gmail SMTP (cuenta `GMAIL_USER`, autenticada con una
 * "contraseña de aplicación" en `GMAIL_APP_PASSWORD` — nunca la contraseña
 * real de la cuenta). Helper compartido por todos los módulos que generan
 * un PDF al crear/cerrar un registro — antes esto vivía duplicado solo en
 * Informe Técnico. Nunca tira: un fallo de envío no debe cortar la
 * creación del registro que ya se guardó bien.
 */
export async function enviarPdfPorEmail(opts: {
  to: string[];
  asunto: string;
  texto: string;
  pdfBuffer: Buffer;
  filename: string;
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
  } catch {
    return false;
  }
}
