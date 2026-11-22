import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { obtenerDestinatariosAutoEnvio } from "@/lib/email/destinatarios-auto-envio";
import { enviarPdfPorEmail } from "@/lib/email/enviar-pdf";
import { cargarTareasPanel } from "@/lib/tareas/cargar";
import { construirWorkbookPlanDeVisita } from "@/lib/tareas/excel";
import { armarResumenSemanal } from "@/lib/tareas/resumen-semanal";

/**
 * Resumen semanal de tareas pendientes (lunes 11:00 UTC = 08:00 en Argentina).
 * Va a los mismos destinatarios que los PDF automáticos (Configuración → Emails
 * de envío, y respeta el interruptor general de envío automático): el resumen
 * en el cuerpo del mail y el plan de visita en Excel adjunto. Si no hay ninguna
 * tarea abierta, ese lunes no se manda nada.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Falta CRON_SECRET en las variables de entorno." }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const service = createServiceRoleClient();
  const destinatarios = await obtenerDestinatariosAutoEnvio(service);
  if (destinatarios.length === 0) return NextResponse.json({ enviado: false, motivo: "sin destinatarios (envío automático apagado, lista vacía o falta GMAIL_*)" });

  const ahora = new Date();
  const tareas = await cargarTareasPanel(service);
  const resumen = armarResumenSemanal(tareas, ahora);
  if (!resumen) return NextResponse.json({ enviado: false, motivo: "no hay tareas abiertas" });

  const workbook = await construirWorkbookPlanDeVisita("Plan de visita — tareas pendientes", tareas, ahora);
  const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());
  const enviado = await enviarPdfPorEmail({
    to: destinatarios,
    asunto: resumen.asunto,
    texto: resumen.texto,
    pdfBuffer: xlsx, // el helper adjunta cualquier archivo; el tipo lo toma de la extensión
    filename: `plan_de_visita_${ahora.toISOString().slice(0, 10)}.xlsx`,
  });
  return NextResponse.json({ enviado, destinatarios: destinatarios.length });
}
