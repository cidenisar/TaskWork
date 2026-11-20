/**
 * Worker de la cola de generación (ver README.md "Generación asincrónica"):
 * toma los pedidos "pendiente" de motor_unifilares_jobs (encolados por
 * POST /api/unifilar, botón "Generar unifilar" de informes-app), corre
 * generarUnifilar() + el render de PDF/DXF, sube los archivos al mismo
 * bucket que usaba antes informes-app, y escribe el resultado directo en
 * tablero_mediciones (service role) — sin pasar por HTTP de vuelta a
 * informes-app.
 *
 * Corre como script de Node, NUNCA como función serverless de Vercel — por
 * eso no tiene el límite de 60s que originalmente forzó el esquema de
 * lotes en paralelo de anthropic-client.ts (ver el comentario de
 * `generarUnifilar` ahí: ahora corren en serie, más barato por el cache
 * del prompt de reglas). Mientras se valida/mejora la calidad del
 * generador, este script se corre A MANO (no hay cron todavía) — procesa
 * lo que esté pendiente y termina.
 *
 * Uso:
 *   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm run procesar-cola
 */
import { generarUnifilar, estimarCostoUsd, RespuestaIaInvalida } from "../src/anthropic-client.js";
import { drawCommandsToDxf } from "../src/dxf-writer.js";
import { drawCommandsToPdf } from "../src/pdf-renderer.js";
import { listarJobsPendientes, marcarGenerando, marcarListo, marcarError } from "../src/jobs-store.js";
import { obtenerCreatedBy, marcarUnifilarGenerando, marcarUnifilarError, guardarUnifilarListo } from "../src/medicion-store.js";
import { subirArchivo } from "../src/storage.js";
import type { JobUnifilar } from "../src/types.js";

async function procesarJob(job: JobUnifilar, apiKey: string): Promise<void> {
  console.log(`[${job.id}] generando (medición ${job.medicionId}, ${job.circuitos.length} circuitos)...`);
  await Promise.all([marcarGenerando(job.id), marcarUnifilarGenerando(job.medicionId)]);

  try {
    const { drawing, uso } = await generarUnifilar(apiKey, job.circuitos, job.rotulo);
    console.log(
      `[${job.id}] uso real: ${uso.inputTokens} input + ${uso.cacheCreationInputTokens} cache-write + ` +
        `${uso.cacheReadInputTokens} cache-read + ${uso.outputTokens} output (incluye "thinking") ≈ ` +
        `$${estimarCostoUsd(uso).toFixed(3)} USD (estimado, ver PRECIO_POR_MTOK en anthropic-client.ts).`,
    );
    const dxfBuffer = drawCommandsToDxf(drawing.commands, drawing.height);
    const pdfBuffer = await drawCommandsToPdf(drawing.commands, drawing.width, drawing.height);

    const createdBy = await obtenerCreatedBy(job.medicionId);
    const dxfPath = `${createdBy}/tableros/${job.medicionId}/unifilar.dxf`;
    const pdfPath = `${createdBy}/tableros/${job.medicionId}/unifilar.pdf`;
    await Promise.all([subirArchivo(dxfPath, dxfBuffer, "application/dxf"), subirArchivo(pdfPath, pdfBuffer, "application/pdf")]);

    await guardarUnifilarListo(job.medicionId, dxfPath, pdfPath);
    await marcarListo(job.id);
    console.log(`[${job.id}] listo.`);
  } catch (err) {
    const mensaje =
      err instanceof RespuestaIaInvalida
        ? `La IA no devolvió un plano utilizable: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error(`[${job.id}] error: ${mensaje}`);
    await Promise.all([marcarError(job.id, mensaje), marcarUnifilarError(job.medicionId, mensaje)]);
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Falta ANTHROPIC_API_KEY en el entorno.");
    process.exit(1);
  }

  const pendientes = await listarJobsPendientes();
  if (pendientes.length === 0) {
    console.log("No hay pedidos pendientes.");
    return;
  }
  console.log(`${pendientes.length} pedido(s) pendiente(s).`);

  // Uno por vez, a propósito — acá no hay límite de tiempo que justifique
  // correrlos en paralelo (eso era solo para entrar en los 60s de Vercel,
  // ver generarUnifilar), y en serie no arriesga el rate limit de Anthropic
  // con N pedidos completos (cada uno ya dispara varios lotes en paralelo
  // puertas adentro) a la vez.
  for (const job of pendientes) {
    await procesarJob(job, apiKey);
  }
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
