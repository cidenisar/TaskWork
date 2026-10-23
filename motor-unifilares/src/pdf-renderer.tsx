/**
 * Renderer de PDF — mismo DrawCommand[] que ya consume dxf-writer.ts,
 * portado tal cual del mapeo a Svg de react-pdf que ya usa informes-app
 * (lib/pdf/tablero.tsx): líneas/rects/círculos/elipses van en un <Svg>,
 * el texto aparte en <Text> posicionado absoluto (react-pdf no soporta
 * texto dentro de <Svg> con el control de fuente que necesitamos).
 */
import { Document, Page, View, Svg, Line, Rect, Circle, Ellipse, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { COLOR_POR_CAPA } from "./colores-capa.js";
import type { DrawCommand } from "./types.js";

const styles = StyleSheet.create({
  page: { padding: "20 20 20", fontFamily: "Helvetica", color: "#1a1a1a" },
  pageSinMargen: { padding: 0, fontFamily: "Helvetica", color: "#1a1a1a" },
});

function DibujoSvgTexto({ commands, width, height }: { commands: DrawCommand[]; width: number; height: number }) {
  return (
    <View style={{ position: "relative", width, height }}>
      <Svg width={width} height={height}>
        {commands.map((cmd, i) => {
          const color = COLOR_POR_CAPA[cmd.layer] ?? "#1a1a1a";
          if (cmd.type === "line") {
            return <Line key={i} x1={cmd.x1} y1={cmd.y1} x2={cmd.x2} y2={cmd.y2} stroke={color} strokeWidth={0.75} />;
          }
          if (cmd.type === "rect") {
            return (
              <Rect key={i} x={cmd.x} y={cmd.y} width={cmd.width} height={cmd.height} stroke={color} strokeWidth={0.75} fill={cmd.fill ? color : "none"} />
            );
          }
          if (cmd.type === "circle") {
            return <Circle key={i} cx={cmd.x} cy={cmd.y} r={cmd.r} stroke={color} strokeWidth={0.75} fill="none" />;
          }
          if (cmd.type === "ellipse") {
            return <Ellipse key={i} cx={cmd.x} cy={cmd.y} rx={cmd.rx} ry={cmd.ry} stroke={color} strokeWidth={0.6} fill="none" />;
          }
          return null;
        })}
      </Svg>
      {commands.map((cmd, i) =>
        cmd.type === "text" ? (
          <Text
            key={`t${i}`}
            style={{
              position: "absolute",
              left: cmd.x,
              top: cmd.y - cmd.size,
              fontSize: cmd.size,
              fontFamily: cmd.bold ? "Helvetica-Bold" : "Helvetica",
              color: COLOR_POR_CAPA[cmd.layer] ?? "#1a1a1a",
            }}
          >
            {cmd.text}
          </Text>
        ) : null,
      )}
    </View>
  );
}

/** Hoja completa A3 apaisada — lo que devuelve POST /api/unifilar. */
export function drawCommandsToPdf(commands: DrawCommand[], width: number, height: number): Promise<Buffer> {
  return renderToBuffer(
    <Document>
      <Page size="A3" orientation="landscape" style={styles.page}>
        <DibujoSvgTexto commands={commands} width={width} height={height} />
      </Page>
    </Document>,
  );
}

/** Previsualización de un fragmento puntual (un ejemplo "enseñado", ver ensenar.ts) — página recortada al tamaño real del dibujo, no una A3 con espacio de más alrededor. */
export function drawCommandsToPdfFragment(commands: DrawCommand[], width: number, height: number): Promise<Buffer> {
  return renderToBuffer(
    <Document>
      <Page size={[width, height]} style={styles.pageSinMargen}>
        <DibujoSvgTexto commands={commands} width={width} height={height} />
      </Page>
    </Document>,
  );
}
