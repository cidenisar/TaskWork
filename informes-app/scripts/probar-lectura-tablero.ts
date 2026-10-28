/**
 * Harness de la Fase 1 (ENCARGO.md, repo cidenisar/motor-unifilar rama
 * lectura-fotos): corre `leerTablero()` contra las 4 fotos reales de
 * `fotos_prueba/` y compara, campo por campo, contra DOS referencias:
 *
 * 1. tablero_referencia.json — lectura hecha a mano con zoom (el propio
 *    archivo admite que puede tener errores).
 * 2. FIXTURE_UNIFILAR (scripts/dev-unifilar-fixture.ts) — los circuitos
 *    REALES de este mismo tablero ("Tablero de Prueba 11"), ya cargados en
 *    producción (Supabase) y usados hoy por el harness del motor de
 *    unifilares — más confiable que #1 porque viene de datos reales ya
 *    verificados en la app, no de una transcripción nueva.
 *
 * Uso:
 *   ANTHROPIC_API_KEY=... npx tsx scripts/probar-lectura-tablero.ts \
 *     [--fotos /home/user/motor-unifilar/docs/lectura-fotos/fotos_prueba] \
 *     [--referencia /home/user/motor-unifilar/docs/lectura-fotos/tablero_referencia.json] \
 *     [--modelo claude-opus-5-5] [--salida /tmp/lectura-tablero]
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { leerTablero, limpiarLecturaTablero, controlarLecturaTablero, adaptarACircuitosDelMotor } from "../src/lib/tableros/leer-tablero";
import { FIXTURE_UNIFILAR } from "./dev-unifilar-fixture";

function arg(nombre: string, porDefecto: string): string {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}

const dirFotos = arg("fotos", "/home/user/motor-unifilar/docs/lectura-fotos/fotos_prueba");
const pathReferencia = arg("referencia", "/home/user/motor-unifilar/docs/lectura-fotos/tablero_referencia.json");
const modelo = arg("modelo", "claude-opus-5-5");
const dirSalida = arg("salida", "/tmp/lectura-tablero");
mkdirSync(dirSalida, { recursive: true });

interface CircuitoReferencia {
  destino: string | null;
  etiqueta_extra: string | null;
  etiqueta_conflicto?: boolean;
  dif_in: string | null;
  term_in: string | null;
  estado: "ON" | "OFF";
}
interface TableroReferencia {
  circuitos: CircuitoReferencia[];
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Falta ANTHROPIC_API_KEY en el entorno.");
    process.exit(1);
  }

  const nombresFotos = readdirSync(dirFotos).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
  if (nombresFotos.length === 0) {
    console.error(`No se encontraron fotos en ${dirFotos}`);
    process.exit(1);
  }
  console.log(`Leyendo ${nombresFotos.length} foto(s): ${nombresFotos.join(", ")}`);
  const fotos = nombresFotos.map((nombre) => ({ buffer: readFileSync(join(dirFotos, nombre)), nombre }));

  const inicio = Date.now();
  const { json: crudo, uso } = await leerTablero(fotos, modelo);
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  const json = limpiarLecturaTablero(crudo);

  writeFileSync(join(dirSalida, "lectura.json"), JSON.stringify(json, null, 2), "utf-8");
  console.log(`\nTokens: ${uso.inputTokens} entrada, ${uso.outputTokens} salida -> USD ${uso.costoUsd.toFixed(3)} (${segundos}s, modelo ${uso.modelo})`);
  console.log(`\n${json.circuitos.length} circuitos leídos.\n`);

  const { aConfirmar, avisos } = controlarLecturaTablero(json);
  console.log(`A confirmar (${aConfirmar.length}):`);
  for (const c of aConfirmar) console.log(`  [${c.donde}] ${c.que}`);
  if (avisos.length) {
    console.log(`\nAvisos (${avisos.length}):`);
    for (const a of avisos) console.log(`  ⚠ ${a}`);
  }

  // ---- Comparación campo por campo contra tablero_referencia.json ----
  const referencia: TableroReferencia = JSON.parse(readFileSync(pathReferencia, "utf-8"));
  console.log(`\n=== Comparación vs. tablero_referencia.json (${referencia.circuitos.length} circuitos) ===`);
  const maxLen = Math.max(json.circuitos.length, referencia.circuitos.length);
  let coincidenDifTerm = 0;
  for (let i = 0; i < maxLen; i++) {
    const leido = json.circuitos[i];
    const ref = referencia.circuitos[i];
    const cod = `C${String(i + 1).padStart(2, "0")}`;
    if (!leido || !ref) {
      console.log(`${cod}: FALTA de un lado (leído=${!!leido}, referencia=${!!ref})`);
      continue;
    }
    const difOk = leido.difIn === ref.dif_in;
    const termOk = leido.termIn === ref.term_in;
    const estadoOk = leido.estado === ref.estado;
    if (difOk && termOk) coincidenDifTerm++;
    if (!difOk || !termOk || !estadoOk) {
      console.log(
        `${cod} "${leido.destino ?? leido.etiquetaExtra}": ` +
          `dif_in leído=${leido.difIn ?? "null"} ref=${ref.dif_in ?? "null"} ${difOk ? "OK" : "✗"} | ` +
          `term_in leído=${leido.termIn ?? "null"} ref=${ref.term_in ?? "null"} ${termOk ? "OK" : "✗"} | ` +
          `estado leído=${leido.estado} ref=${ref.estado} ${estadoOk ? "OK" : "✗"}`,
      );
    }
  }
  console.log(`\nCalibres (dif_in + term_in) que coinciden con la referencia: ${coincidenDifTerm}/${maxLen}`);

  // ---- Controles puntuales que pide la Fase 1 del ENCARGO ----
  console.log("\n=== Controles de aceptación (ENCARGO.md Fase 1) ===");
  console.log(`25 circuitos: ${json.circuitos.length === 25 ? "OK" : `✗ (salieron ${json.circuitos.length})`}`);
  const offEsperado = [9, 10, 11, 15, 19, 20, 21, 22]; // C09, C10, C11, C15, C19, C20, C21, C22
  const offLeido = json.circuitos.map((c, i) => (c.estado === "OFF" ? i + 1 : null)).filter((n): n is number => n != null);
  console.log(`OFF esperado ${offEsperado.join(",")} / leído ${offLeido.join(",")}: ${JSON.stringify(offEsperado) === JSON.stringify(offLeido) ? "OK" : "✗ revisar"}`);
  console.log(`Conflicto de etiqueta en C03: ${json.circuitos[2]?.etiquetaConflicto ? "OK" : "✗ no detectado"}`);
  const c17 = json.circuitos[16];
  const c17Ok = c17 && (c17.difIn === "32A" || c17.difIn === null);
  console.log(`C17 dif_in (no puede ser 16A, debe ser 32A o null): leído=${c17?.difIn ?? "null"} ${c17Ok ? "OK" : "✗"}`);

  // Ningún calibre null en la referencia puede venir con valor sin marca de sospecha.
  let sinMarcaDeSospecha = 0;
  referencia.circuitos.forEach((ref, i) => {
    const leido = json.circuitos[i];
    if (!leido) return;
    if (ref.dif_in === null && leido.difIn !== null) sinMarcaDeSospecha++;
    if (ref.term_in === null && leido.termIn !== null) sinMarcaDeSospecha++;
  });
  console.log(`Calibres null-en-referencia que vinieron con valor: ${sinMarcaDeSospecha} ${sinMarcaDeSospecha === 0 ? "OK" : "✗ revisar (ver si al menos están marcados de sospecha arriba)"}`);

  // ---- Adaptador al formato del motor, cross-check contra FIXTURE_UNIFILAR real ----
  const adaptado = adaptarACircuitosDelMotor(json);
  writeFileSync(join(dirSalida, "adaptado.json"), JSON.stringify(adaptado, null, 2), "utf-8");
  console.log(`\n=== Adaptador al formato del motor: ${adaptado.length} filas (tablero_circuitos) ===`);
  console.log(`Guardado en ${dirSalida}/adaptado.json`);

  const realCirc = FIXTURE_UNIFILAR.filter((c) => c.numero <= 53); // 1-53 = circuitos reales de este tablero; 54+ es síntesis agregada para otro propósito
  console.log(`\n=== Cross-check vs. FIXTURE_UNIFILAR (${realCirc.length} filas reales ya en producción) ===`);
  let coincidenAdaptado = 0;
  for (let i = 0; i < Math.min(adaptado.length, realCirc.length); i++) {
    const a = adaptado[i];
    const r = realCirc[i];
    const ok = a.categoriaEquipo === r.categoriaEquipo && a.ampNominal === r.ampNominal && a.padreNumero === r.padreNumero;
    if (ok) coincidenAdaptado++;
    else console.log(`numero ${a.numero}: adaptado={cat:${a.categoriaEquipo},amp:${a.ampNominal},padre:${a.padreNumero}} vs fixture={cat:${r.categoriaEquipo},amp:${r.ampNominal},padre:${r.padreNumero}}`);
  }
  console.log(`Filas que coinciden (categoría+amperaje+padre) con el fixture real: ${coincidenAdaptado}/${Math.min(adaptado.length, realCirc.length)}`);

  console.log(`\nListo. JSON completo: ${dirSalida}/lectura.json | adaptado: ${dirSalida}/adaptado.json`);
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
