import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Ejemplo } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const EJEMPLOS_DIR = join(__dirname, "..", "reglas", "ejemplos");

/** Lee todos los ejemplos enseñados (reglas/ejemplos/*.json). Vacío si todavía no se enseñó ninguno. */
export function cargarEjemplos(): Ejemplo[] {
  const archivos = readdirSync(EJEMPLOS_DIR).filter((archivo) => archivo.endsWith(".json"));
  return archivos.map((archivo) => JSON.parse(readFileSync(join(EJEMPLOS_DIR, archivo), "utf-8")) as Ejemplo);
}
