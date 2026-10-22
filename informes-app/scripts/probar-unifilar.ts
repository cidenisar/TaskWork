/**
 * Harness de desarrollo (Fase 0 del plan de reescritura del unifilar,
 * ver docs/referencias-unifilar/) — genera un PDF y un DXF reales del
 * motor de unifilares SIN pasar por Next.js, para poder iterar rápido y
 * comparar contra docs/referencias-unifilar/ sin depender del navegador
 * (bloqueado por política de red en este entorno de desarrollo).
 *
 * Requiere el parche temporal documentado en CRITERIOS_Y_IDEAS.md §14
 * antes de correr: agregar "require" igual a "import" en los `exports`
 * de node_modules/@react-pdf/hyphenate/package.json. Restaurarlo después
 * — NUNCA commitear ese parche.
 *
 * Uso: npx tsx scripts/probar-unifilar.ts [directorio-salida]
 * (correr desde informes-app/ para que resuelva node_modules)
 */
import React from "react";
import { Document, Page, Text, View, StyleSheet, Svg, Line, Rect, Circle, renderToFile } from "@react-pdf/renderer";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  agruparPorCuerpo,
  construirUnifilar,
  construirUnifilarPaginado,
  type CapaDxf,
  type RotuloUnifilar,
} from "../src/lib/tableros/unifilar";
import { drawCommandsToDxf } from "../src/lib/dxf/writer";
import { FIXTURE_UNIFILAR } from "./dev-unifilar-fixture";

const outDir = process.argv[2] ?? "/tmp/unifilar-harness";
mkdirSync(outDir, { recursive: true });

// Mismo mapa que lib/pdf/tablero.tsx — duplicado acá a propósito (el
// harness no debe depender de imports internos de un componente React de
// la app) para no crear un acoplamiento nuevo solo para probar.
const COLOR_POR_CAPA: Record<CapaDxf, string> = {
  MARCO: "#1a1a1a",
  BARRA: "#2a4d8f",
  SIMBOLOS: "#8a6d1a",
  ROTULO: "#1a7a3c",
  TEXTO: "#1a1a1a",
  BORNES: "#2a4d8f",
  CABLES: "#8a2be2",
  SELLO: "#c0392b",
  TIERRA: "#1a7a3c",
};

const rotulo: RotuloUnifilar = {
  sitio: "REFINERIA LUJAN DE CUYO",
  tablero: "Tablero de Prueba 11 (harness)",
  cliente: "YPF S.A.",
  contratista: "SONDA",
  fecha: "22/10/2026",
  realizo: "Administrador",
  numeroGeneracion: "HARNESS-0001",
};

const circuitosPorCuerpo = agruparPorCuerpo(FIXTURE_UNIFILAR);

// Para el DXF: dibujo único sin partir (mismo criterio que tableros/nuevo/actions.ts).
const unifilarCompleto = construirUnifilar(circuitosPorCuerpo, [], rotulo);
// Para el PDF: paginado para no colgar react-pdf (ver CRITERIOS_Y_IDEAS.md §10).
const unifilarBloques = construirUnifilarPaginado(circuitosPorCuerpo, [], rotulo);

const styles = StyleSheet.create({ page: { padding: 20 } });

const DocumentoPrueba = () =>
  React.createElement(
    Document,
    null,
    unifilarBloques.map((bloque, b) =>
      React.createElement(
        Page,
        { key: b, size: "A4", orientation: "landscape" as const, style: styles.page },
        React.createElement(
          View,
          { style: { position: "relative", width: bloque.width, height: bloque.height } },
          React.createElement(
            Svg,
            { width: bloque.width, height: bloque.height },
            bloque.commands.map((cmd, i) => {
              const color = COLOR_POR_CAPA[cmd.layer] ?? "#1a1a1a";
              if (cmd.type === "line") return React.createElement(Line, { key: i, x1: cmd.x1, y1: cmd.y1, x2: cmd.x2, y2: cmd.y2, stroke: color, strokeWidth: 0.75 });
              if (cmd.type === "rect") return React.createElement(Rect, { key: i, x: cmd.x, y: cmd.y, width: cmd.width, height: cmd.height, stroke: color, strokeWidth: 0.75, fill: "none" });
              if (cmd.type === "circle") return React.createElement(Circle, { key: i, cx: cmd.x, cy: cmd.y, r: cmd.r, stroke: color, strokeWidth: 0.75, fill: "none" });
              return null;
            }),
          ),
          bloque.commands.map((cmd, i) =>
            cmd.type === "text"
              ? React.createElement(
                  Text,
                  {
                    key: `t${i}`,
                    style: {
                      position: "absolute" as const,
                      left: cmd.x,
                      top: cmd.y - cmd.size,
                      fontSize: cmd.size,
                      fontFamily: cmd.bold ? "Helvetica-Bold" : "Helvetica",
                      color: COLOR_POR_CAPA[cmd.layer] ?? "#1a1a1a",
                    },
                  },
                  cmd.text,
                )
              : null,
          ),
        ),
      ),
    ),
  );

async function main() {
  console.log(`Fixture: ${FIXTURE_UNIFILAR.length} circuitos, ${unifilarBloques.length} bloque(s) de PDF.`);
  for (const [i, b] of unifilarBloques.entries()) {
    console.log(`  bloque ${i + 1}: ${b.width}x${b.height}pt, ${b.commands.length} comandos`);
  }

  const pdfPath = `${outDir}/unifilar-harness.pdf`;
  await renderToFile(React.createElement(DocumentoPrueba), pdfPath);
  console.log(`PDF escrito: ${pdfPath}`);

  const dxfBuffer = drawCommandsToDxf(unifilarCompleto.commands, unifilarCompleto.height);
  const dxfPath = `${outDir}/unifilar-harness.dxf`;
  writeFileSync(dxfPath, dxfBuffer);
  console.log(`DXF escrito: ${dxfPath} (${dxfBuffer.length} bytes)`);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
