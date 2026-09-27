import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { BORDER, commonStyles, KeyValueRow, PdfHeader, PdfFooter, formatFechaArg } from "./common";
import { TABLERO_TIPO_LABEL, TABLERO_EVENTO_LABEL, esTipoEnergia, pideCorrientePorFase } from "@/components/tableros/types";
import type { TableroEventoTipo, TableroTipo } from "@/lib/database.types";

/**
 * Reemplaza la planilla Excel manual de medición de consumo — misma cabecera
 * y pie que el resto de los PDF (spec sección 11), con una tabla de
 * circuitos/elementos. Para energía incluye las columnas de corriente por
 * fase F/R/S/T; para CCTV/Control de Acceso es solo estado + comentario
 * (no aplica la medición de corriente).
 */

const styles = StyleSheet.create({
  table: { border: `1pt solid ${BORDER}`, marginBottom: 4 },
  headRow: { flexDirection: "row", backgroundColor: "#EDEFF2", borderBottom: `1pt solid ${BORDER}` },
  row: { flexDirection: "row", borderBottom: `1pt solid ${BORDER}` },
  rowLast: { flexDirection: "row" },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", padding: 3.5 },
  td: { fontSize: 7, padding: 3.5 },
});

export interface TableroPdfLectura {
  numero: number;
  texto: string;
  ampNominal: string | null;
  estado: string | null;
  corrienteF: number | null;
  corrienteR: number | null;
  corrienteS: number | null;
  corrienteT: number | null;
  comentario: string | null;
}

export interface TableroPdfProps {
  numeroGeneracion: string;
  tipo: TableroTipo;
  tipoEvento: TableroEventoTipo;
  denominacion: string;
  sitio: string;
  fecha: string;
  lecturas: TableroPdfLectura[];
  logoBuffer: Buffer | null;
  appName: string;
  realizoNombre: string;
}

// Anchos por columna — más angostos para energía (9 columnas) que para
// CCTV/Control de Acceso (4 columnas), para que entren en el ancho de A4.
interface ColWidths {
  n: string;
  circuito: string;
  estado: string;
  amp: string;
  fase: string;
  comentario: string;
}
const WIDTHS_ENERGIA: ColWidths = { n: "5%", circuito: "19%", estado: "12%", amp: "8%", fase: "7%", comentario: "23%" };
const WIDTHS_SIMPLE: ColWidths = { n: "7%", circuito: "27%", estado: "16%", amp: "0%", fase: "0%", comentario: "50%" };

export function TableroPdf(props: TableroPdfProps) {
  const { numeroGeneracion, tipo, tipoEvento, denominacion, sitio, fecha, lecturas, logoBuffer, appName, realizoNombre } = props;
  const energia = esTipoEnergia(tipo);
  const mideCorriente = pideCorrientePorFase(tipo, tipoEvento);
  const w = mideCorriente ? WIDTHS_ENERGIA : WIDTHS_SIMPLE;
  const fechaLabel = formatFechaArg(fecha);
  const documentoLabel = mideCorriente
    ? "MEDICIÓN DE CONSUMO — TABLERO DE ENERGÍA"
    : `${TABLERO_EVENTO_LABEL[tipoEvento].toUpperCase()} — TABLERO DE ${TABLERO_TIPO_LABEL[tipo].toUpperCase()}`;
  const documentoLinea = `Documento: ${sitio || "—"}-Público · Generado por ${appName}`;

  return (
    <Document title={`${numeroGeneracion} — ${denominacion}`}>
      <Page size="A4" style={commonStyles.page} wrap>
        <PdfHeader
          documentoLabel={documentoLabel}
          titulo={denominacion}
          fechaLabel={fechaLabel}
          numeroGeneracion={numeroGeneracion}
          logoBuffer={logoBuffer}
        />

        <Text style={commonStyles.mainTitle}>
          {denominacion} — {sitio}
        </Text>

        <View style={commonStyles.kvTable}>
          <KeyValueRow k="N° de Generación:" v={numeroGeneracion} />
          <KeyValueRow k="Tipo de Visita:" v={TABLERO_EVENTO_LABEL[tipoEvento]} />
          <KeyValueRow k="Tipo de Tablero:" v={TABLERO_TIPO_LABEL[tipo]} />
          <KeyValueRow k="Denominación:" v={denominacion} />
          <KeyValueRow k="Sitio:" v={sitio} />
          <KeyValueRow k="Fecha:" v={fechaLabel} last />
        </View>

        <Text style={commonStyles.sectionTitle}>{energia ? "Circuitos" : "Elementos"}</Text>
        <View style={styles.table}>
          <View style={styles.headRow} fixed>
            <Text style={[styles.th, { width: w.n }]}>N°</Text>
            <Text style={[styles.th, { width: w.circuito }]}>{energia ? "Circuito" : "Elemento"}</Text>
            <Text style={[styles.th, { width: w.estado }]}>Estado</Text>
            {mideCorriente && (
              <>
                <Text style={[styles.th, { width: w.amp, textAlign: "right" }]}>Amp</Text>
                <Text style={[styles.th, { width: w.fase, textAlign: "right" }]}>F</Text>
                <Text style={[styles.th, { width: w.fase, textAlign: "right" }]}>R</Text>
                <Text style={[styles.th, { width: w.fase, textAlign: "right" }]}>S</Text>
                <Text style={[styles.th, { width: w.fase, textAlign: "right" }]}>T</Text>
              </>
            )}
            <Text style={[styles.th, { width: w.comentario }]}>Comentario</Text>
          </View>
          {lecturas.map((l, i) => (
            <View style={i === lecturas.length - 1 ? styles.rowLast : styles.row} key={i} wrap={false}>
              <Text style={[styles.td, { width: w.n }]}>{l.numero}</Text>
              <Text style={[styles.td, { width: w.circuito }]}>{l.texto}</Text>
              <Text style={[styles.td, { width: w.estado }]}>{l.estado || "—"}</Text>
              {mideCorriente && (
                <>
                  <Text style={[styles.td, { width: w.amp, textAlign: "right" }]}>{l.ampNominal || "—"}</Text>
                  <Text style={[styles.td, { width: w.fase, textAlign: "right" }]}>{l.corrienteF ?? "—"}</Text>
                  <Text style={[styles.td, { width: w.fase, textAlign: "right" }]}>{l.corrienteR ?? "—"}</Text>
                  <Text style={[styles.td, { width: w.fase, textAlign: "right" }]}>{l.corrienteS ?? "—"}</Text>
                  <Text style={[styles.td, { width: w.fase, textAlign: "right" }]}>{l.corrienteT ?? "—"}</Text>
                </>
              )}
              <Text style={[styles.td, { width: w.comentario }]}>{l.comentario || "—"}</Text>
            </View>
          ))}
        </View>

        <PdfFooter realizo={realizoNombre.toUpperCase()} documentoLinea={documentoLinea} />
      </Page>
    </Document>
  );
}
