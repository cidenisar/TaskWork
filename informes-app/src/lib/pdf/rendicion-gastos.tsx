import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { BORDER, GREEN, RED, commonStyles, KeyValueRow, PdfHeader, PdfFooter } from "./common";

/**
 * Replica "Rendicion de Gastos - Diseño PDF.pdf" (spec sección 11): mismos
 * cabecera/pie que Informe Técnico, tabla "Detalle de Gastos" con TOTAL
 * GASTADO resaltado, caja de resultado verde/rojo según el signo del saldo,
 * y sección de comprobantes de a 2 por fila.
 */

const styles = StyleSheet.create({
  table: { border: `1pt solid ${BORDER}`, marginBottom: 4 },
  tableHeadRow: { flexDirection: "row", backgroundColor: "#EDEFF2", borderBottom: `1pt solid ${BORDER}` },
  tableRow: { flexDirection: "row", borderBottom: `1pt solid ${BORDER}` },
  tableRowLast: { flexDirection: "row" },
  tableTotalRow: { flexDirection: "row", backgroundColor: "#EDEFF2" },
  thFecha: { width: "12%", fontSize: 7.5, fontFamily: "Helvetica-Bold", padding: 4 },
  thCategoria: { width: "15%", fontSize: 7.5, fontFamily: "Helvetica-Bold", padding: 4 },
  thTecnicos: { width: "23%", fontSize: 7.5, fontFamily: "Helvetica-Bold", padding: 4 },
  thDescripcion: { width: "30%", fontSize: 7.5, fontFamily: "Helvetica-Bold", padding: 4 },
  thMonto: { width: "20%", fontSize: 7.5, fontFamily: "Helvetica-Bold", padding: 4, textAlign: "right" },
  tdFecha: { width: "12%", fontSize: 7.5, padding: 4 },
  tdCategoria: { width: "15%", fontSize: 7.5, padding: 4 },
  tdTecnicos: { width: "23%", fontSize: 7.5, padding: 4 },
  tdDescripcion: { width: "30%", fontSize: 7.5, padding: 4 },
  tdMonto: { width: "20%", fontSize: 7.5, padding: 4, textAlign: "right" },
  totalLabel: { width: "80%", fontSize: 8, fontFamily: "Helvetica-Bold", padding: 5, textAlign: "right" },
  totalMonto: { width: "20%", fontSize: 8, fontFamily: "Helvetica-Bold", padding: 5, textAlign: "right" },

  resultBox: { border: `1pt solid ${BORDER}`, padding: 16, alignItems: "center", marginTop: 4, marginBottom: 10 },
  resultLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 6, textTransform: "uppercase" },
  resultAmount: { fontSize: 18, fontFamily: "Helvetica-Bold" },

  comprobanteCaption: { fontSize: 7.5, color: "#666", marginTop: 2 },
});

function fmtMonto(monto: number, moneda: string): string {
  return `${moneda} ${monto.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface RendicionPdfGasto {
  fechaLabel: string;
  categoria: string;
  tecnicos: string;
  descripcion: string;
  monto: number;
  comprobanteBuffer: Buffer | null;
}

export interface RendicionPdfProps {
  numeroGeneracion: string;
  motivo: string;
  fechaLabel: string;
  proyectoCliente: string | null;
  provincia: string | null;
  tecnicosInvolucrados: { nombre: string; torre: string | null }[];
  viaticoRecibido: number;
  moneda: string;
  gastos: RendicionPdfGasto[];
  totalGastado: number;
  saldo: number;
  logoBuffer: Buffer | null;
  appName: string;
  realizoNombre: string;
}

export function RendicionGastosPdf(props: RendicionPdfProps) {
  const {
    numeroGeneracion,
    motivo,
    fechaLabel,
    proyectoCliente,
    provincia,
    tecnicosInvolucrados,
    viaticoRecibido,
    moneda,
    gastos,
    totalGastado,
    saldo,
    logoBuffer,
    appName,
    realizoNombre,
  } = props;

  const aFavorEmpresa = saldo >= 0;
  const documentoLinea = `Documento: ${proyectoCliente || motivo}-Público · Generado por ${appName}`;
  const comprobantes = gastos.filter((g) => g.comprobanteBuffer);

  return (
    <Document title={`${numeroGeneracion} — ${motivo}`}>
      <Page size="A4" style={commonStyles.page} wrap>
        <PdfHeader
          documentoLabel="RENDICIÓN DE GASTOS"
          titulo={motivo}
          fechaLabel={fechaLabel}
          numeroGeneracion={numeroGeneracion}
          logoBuffer={logoBuffer}
        />

        <Text style={commonStyles.mainTitle}>Rendición de Gastos — {motivo}</Text>

        <View style={commonStyles.kvTable}>
          <KeyValueRow k="N° de Rendición:" v={numeroGeneracion} />
          <KeyValueRow k="Motivo:" v={motivo} />
          <KeyValueRow k="Fecha:" v={fechaLabel} />
          <KeyValueRow k="Proyecto / Cliente:" v={proyectoCliente || "—"} />
          <KeyValueRow k="Provincia:" v={provincia || "—"} />
          <KeyValueRow
            k="Técnicos Involucrados:"
            v={
              tecnicosInvolucrados.length
                ? tecnicosInvolucrados.map((t) => `${t.nombre}${t.torre ? ` — ${t.torre}` : ""}`).join("\n")
                : "—"
            }
          />
          <KeyValueRow k="Viático Recibido:" v={fmtMonto(viaticoRecibido, moneda)} last />
        </View>

        <Text style={commonStyles.sectionTitle}>Detalle de Gastos</Text>
        <View style={styles.table}>
          <View style={styles.tableHeadRow}>
            <Text style={styles.thFecha}>Fecha</Text>
            <Text style={styles.thCategoria}>Categoría</Text>
            <Text style={styles.thTecnicos}>Técnico(s)</Text>
            <Text style={styles.thDescripcion}>Descripción</Text>
            <Text style={styles.thMonto}>Monto</Text>
          </View>
          {gastos.map((g, i) => (
            <View style={i === gastos.length - 1 ? styles.tableRowLast : styles.tableRow} key={i}>
              <Text style={styles.tdFecha}>{g.fechaLabel}</Text>
              <Text style={styles.tdCategoria}>{g.categoria}</Text>
              <Text style={styles.tdTecnicos}>{g.tecnicos || "—"}</Text>
              <Text style={styles.tdDescripcion}>{g.descripcion || "—"}</Text>
              <Text style={styles.tdMonto}>{fmtMonto(g.monto, moneda)}</Text>
            </View>
          ))}
          <View style={styles.tableTotalRow}>
            <Text style={styles.totalLabel}>TOTAL GASTADO</Text>
            <Text style={styles.totalMonto}>{fmtMonto(totalGastado, moneda)}</Text>
          </View>
        </View>

        <Text style={commonStyles.sectionTitle}>Resultado de la Rendición</Text>
        <View style={[styles.resultBox, { borderColor: aFavorEmpresa ? GREEN : RED }]}>
          <Text style={[styles.resultLabel, { color: aFavorEmpresa ? GREEN : RED }]}>
            {aFavorEmpresa ? "Saldo a favor de la empresa" : "Saldo a reintegrar al empleado"}
          </Text>
          <Text style={[styles.resultAmount, { color: aFavorEmpresa ? GREEN : RED }]}>
            {fmtMonto(Math.abs(saldo), moneda)}
          </Text>
        </View>

        {comprobantes.length > 0 && (
          <>
            <Text style={commonStyles.sectionTitle}>Comprobantes</Text>
            <View style={commonStyles.photoGrid}>
              {comprobantes.map((g, i) => (
                <View style={commonStyles.photoCell} key={i} wrap={false}>
                  <Image src={g.comprobanteBuffer as Buffer} style={commonStyles.photo} />
                  <Text style={styles.comprobanteCaption}>
                    {g.categoria} — {g.fechaLabel} — {fmtMonto(g.monto, moneda)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        <PdfFooter realizo={realizoNombre.toUpperCase()} documentoLinea={documentoLinea} />
      </Page>
    </Document>
  );
}
