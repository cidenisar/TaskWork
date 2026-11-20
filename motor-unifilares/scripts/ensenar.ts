/**
 * Herramienta de desarrollo para "enseñarle" un caso puntual al motor
 * desde la terminal — la misma lógica que expone la interfaz web
 * (POST /api/ejemplos/previsualizar + POST /api/ejemplos, ver
 * public/index.html), pero disparada a mano, sin pasar por el navegador.
 * Útil para probar rápido o para automatizar en lote.
 *
 * Uso:
 *   ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm run ensenar -- foto.jpg "cómo se conecta esto..." [tag-opcional]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { generarEjemploDesdeImagen, type MediaTypeImagen } from "../src/ensenar.js";
import { guardarEjemplo } from "../src/ejemplos-store.js";
import { drawCommandsToPdfFragment } from "../src/pdf-renderer.js";
import { calcularDimensiones } from "../src/geometria.js";

const MEDIA_TYPE_POR_EXTENSION: Record<string, MediaTypeImagen> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

async function main(): Promise<void> {
  const [imagenPath, explicacionArg, tagForzado] = process.argv.slice(2);
  if (!imagenPath || !explicacionArg) {
    console.error("Uso: npm run ensenar -- <imagen> <explicación-o-archivo.txt> [tag]");
    process.exit(1);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Falta ANTHROPIC_API_KEY en el entorno.");
    process.exit(1);
  }

  const extension = extname(imagenPath).toLowerCase();
  const mediaType = MEDIA_TYPE_POR_EXTENSION[extension];
  if (!mediaType) {
    console.error(`Extensión de imagen no soportada: "${extension}" (usar .jpg/.jpeg/.png/.webp).`);
    process.exit(1);
  }
  const imagenBase64 = readFileSync(imagenPath).toString("base64");
  const explicacion = existsSync(explicacionArg) ? readFileSync(explicacionArg, "utf-8") : explicacionArg;

  console.log("Consultando a Claude...");
  const ejemplo = await generarEjemploDesdeImagen(apiKey, imagenBase64, mediaType, explicacion, tagForzado);

  console.log(`Tag: ${ejemplo.tag}`);
  console.log(`Cuándo aplica: ${ejemplo.cuandoAplica}`);

  const { width, height } = calcularDimensiones(ejemplo.commands);
  const pdfPath = join("/tmp", `ejemplo-${ejemplo.tag}.pdf`);
  writeFileSync(pdfPath, await drawCommandsToPdfFragment(ejemplo.commands, width, height));
  console.log(`Previsualización: ${pdfPath} — abrila y revisala antes de confirmar.`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question("¿Guardar este ejemplo en la base? (s/N) ");
  rl.close();
  if (respuesta.trim().toLowerCase() !== "s") {
    console.log("Descartado, no se guardó nada.");
    return;
  }

  await guardarEjemplo(ejemplo);
  console.log("Guardado en la base (motor_unifilares_ejemplos). Listo para el próximo tablero.");
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
