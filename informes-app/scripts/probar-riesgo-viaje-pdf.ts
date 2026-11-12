/**
 * Harness de desarrollo — renderiza el componente REAL `RiesgoViajePdf`
 * (src/lib/pdf/riesgo-viaje.tsx) con datos de prueba, para validar el
 * layout sin tener que pasar por la app completa.
 *
 * Uso: npx tsx scripts/probar-riesgo-viaje-pdf.ts [directorio-salida]
 */
import React from "react";
import { renderToFile, type DocumentProps } from "@react-pdf/renderer";
import { mkdirSync } from "node:fs";
import { RiesgoViajePdf, type RiesgoViajePdfProps } from "../src/lib/pdf/riesgo-viaje";

const outDir = process.argv[2] ?? "/tmp/riesgo-viaje-harness";
mkdirSync(outDir, { recursive: true });

const props: RiesgoViajePdfProps = {
  numeroGeneracion: "RIESGO-2026-4821",
  conductorNombre: "Enzo Bonnardel",
  acompanantes: ["Gabriel Bonnardel", "Alexis Rubia"],
  vehiculoPatente: "AH 723 QY",
  vehiculoMarcaModelo: "Toyota Hilux",
  empresa: "SONDA ARGENTINA SA.",
  fechaHora: new Date("2026-10-13T10:30:00").toISOString(),
  origen: "Mendoza",
  destino: "Malargüe",
  puntoMedio: "San Rafael",
  criterios: {
    distancia: 8,
    tiempoViaje: 0,
    clima: 1,
    tipoRuta: 1,
    conocimiento: 1,
    comunicacion: 1,
    personasPorVehiculo: 4,
    horasTrabajadas: 2,
  },
  total: 18,
  nivel: "bajo",
  mensaje: "Puede realizar el viaje",
  distanciaKm: 345,
  mapaBuffer: null,
  climaDescripcion: "Despejado · 8°C a 22°C · viento hasta 18 km/h",
  logoBuffer: null,
  appName: "TaskWork",
  realizoNombre: "Enzo Bonnardel",
};

async function main() {
  const path = `${outDir}/riesgo-viaje-pdf-harness.pdf`;
  // Mismo cast acotado que el resto de los harnesses de PDF (ver
  // probar-tablero-pdf.ts) — limitación de tipos de react-pdf, no un error real.
  await renderToFile(React.createElement(RiesgoViajePdf, props) as unknown as React.ReactElement<DocumentProps>, path);
  console.log(`PDF (RiesgoViajePdf real) escrito: ${path}`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
