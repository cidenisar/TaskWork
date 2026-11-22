/**
 * Harness de desarrollo — renderiza el componente REAL `TableroPdf`
 * (src/lib/pdf/tablero.tsx), no una copia a mano del Svg/Text como hace
 * `probar-unifilar.ts` — necesario para validar el split de `<Page>` en 3
 * (A4 + A3 apaisado + A4) de la Fase 3, que vive en ese componente y no en
 * el motor de `lib/tableros/unifilar.ts`. Mismo parche temporal de
 * `@react-pdf/hyphenate` que `probar-unifilar.ts` (ver CRITERIOS_Y_IDEAS.md
 * §14) — restaurarlo después, nunca commitearlo.
 *
 * Uso: npx tsx scripts/probar-tablero-pdf.ts [directorio-salida]
 */
import React from "react";
import { renderToFile, type DocumentProps } from "@react-pdf/renderer";
import { mkdirSync } from "node:fs";
import { TableroPdf, type TableroPdfProps } from "../src/lib/pdf/tablero";
import { agruparPorCuerpo, construirUnifilarPaginado } from "../src/lib/tableros/unifilar";
import { calcularResumenEquipamiento } from "../src/components/tableros/types";
import { FIXTURE_UNIFILAR } from "./dev-unifilar-fixture";

const outDir = process.argv[2] ?? "/tmp/unifilar-harness";
mkdirSync(outDir, { recursive: true });

const rotulo = {
  sitio: "REFINERIA LUJAN DE CUYO",
  tablero: "Tablero de Prueba 11 (harness)",
  cliente: "YPF S.A.",
  contratista: "SONDA",
  fecha: "22/10/2026",
  realizo: "Administrador",
  numeroGeneracion: "HARNESS-0001",
};

const unifilarBloques = construirUnifilarPaginado(agruparPorCuerpo(FIXTURE_UNIFILAR), [], rotulo);

const resumen = calcularResumenEquipamiento(FIXTURE_UNIFILAR.map((c) => ({ categoriaEquipo: c.categoriaEquipo, tipoCircuito: c.tipoCircuito })));

const lecturas = FIXTURE_UNIFILAR.map((c) => ({
  numero: c.numero,
  texto: c.texto,
  categoriaEquipo: c.categoriaEquipo,
  tipoCircuito: c.tipoCircuito,
  ampNominal: c.ampNominal,
  estado: "Cerrado",
  corrienteF: null,
  corrienteR: null,
  corrienteS: null,
  corrienteT: null,
  comentario: null,
}));

const props: TableroPdfProps = {
  numeroGeneracion: rotulo.numeroGeneracion,
  subsistemas: ["energia"],
  tipoEvento: "medicion",
  denominacion: rotulo.tablero,
  region: "NOA",
  provincia: "Mendoza",
  localidad: "Luján de Cuyo",
  sitio: rotulo.sitio,
  planta: "EDIF. COMUNICACIONES",
  oficina: "Sala de Radio Lujan 1",
  fecha: "2026-10-22",
  lecturas,
  resumen,
  fotosGeneralesBuffers: null,
  unifilarBloques,
  hallazgos: [],
  logoBuffer: null,
  appName: "TaskWork",
  realizoNombre: rotulo.realizo,
};

async function main() {
  const path = `${outDir}/tablero-pdf-harness.pdf`;
  // `TableroPdf` devuelve un <Document> en runtime, pero su tipo declarado
  // es el de sus propias props (TableroPdfProps), no DocumentProps — es
  // una limitación de los tipos de react-pdf (renderToFile exige
  // literalmente ReactElement<DocumentProps>), no un error real; cast
  // acotado a esta sola llamada del harness.
  await renderToFile(React.createElement(TableroPdf, props) as unknown as React.ReactElement<DocumentProps>, path);
  console.log(`PDF (TableroPdf real) escrito: ${path}`);
  console.log(`unifilarBloques: ${unifilarBloques.length}`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
