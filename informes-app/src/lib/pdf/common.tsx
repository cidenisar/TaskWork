import { Text, View, Image, StyleSheet } from "@react-pdf/renderer";

/**
 * Estilos y componentes compartidos por ambos PDFs (spec sección 11:
 * "Especificaciones visuales comunes a ambos documentos").
 */

export const NAVY = "#1F3864";
export const ORANGE = "#C6551A";
export const BORDER = "#9AA0A8";
export const GREEN = "#1E7A4A";
export const RED = "#B33A3A";

export const commonStyles = StyleSheet.create({
  page: { padding: "28 32 70", fontSize: 9, fontFamily: "Helvetica", color: "#1a1a1a" },

  headerTable: { flexDirection: "row", border: `1pt solid ${BORDER}`, marginBottom: 14 },
  headerLogoCell: { width: 90, borderRight: `1pt solid ${BORDER}`, alignItems: "center", justifyContent: "center", padding: 6 },
  headerLogoText: { fontSize: 7, color: "#888", textAlign: "center" },
  headerLogoImg: { maxWidth: 74, maxHeight: 44, objectFit: "contain" },
  headerMidCell: { flex: 1, borderRight: `1pt solid ${BORDER}`, padding: 6, justifyContent: "center" },
  headerMidTop: { fontSize: 8, color: "#555", textAlign: "center", marginBottom: 3 },
  headerMidTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "center" },
  headerRightCell: { width: 130, padding: 6, justifyContent: "center" },
  headerRightRow: { fontSize: 8, marginBottom: 4 },
  headerRightLabel: { fontFamily: "Helvetica-Bold" },

  mainTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", borderBottom: `2pt solid ${ORANGE}`, paddingBottom: 6, marginBottom: 12 },

  kvTable: { border: `1pt solid ${BORDER}`, marginBottom: 14 },
  kvRow: { flexDirection: "row", borderBottom: `1pt solid ${BORDER}` },
  kvRowLast: { flexDirection: "row" },
  kvKey: { width: "30%", backgroundColor: NAVY, color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 8.5, padding: 5 },
  kvVal: { flex: 1, fontSize: 8.5, padding: 5, color: "#1a1a1a" },

  sectionTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: ORANGE, textTransform: "uppercase", marginTop: 10, marginBottom: 6 },
  paragraph: { fontSize: 9, lineHeight: 1.5, marginBottom: 6 },

  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4, marginBottom: 6 },
  photoCell: { width: "47%" },
  photo: { width: "100%", height: 150, objectFit: "cover", border: `1pt solid ${BORDER}` },
  photoCaption: { fontSize: 7.5, color: "#666", marginTop: 2 },

  footer: { position: "absolute", bottom: 24, left: 32, right: 32 },
  footerTable: { flexDirection: "row", border: `1pt solid ${BORDER}`, marginBottom: 5 },
  footerCell: { flex: 1, padding: 5, borderRight: `1pt solid ${BORDER}` },
  footerCellLast: { flex: 1, padding: 5 },
  footerLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", marginBottom: 10 },
  footerLine: { fontSize: 7, color: "#666", textAlign: "right" },
});

export function KeyValueRow({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <View style={last ? commonStyles.kvRowLast : commonStyles.kvRow}>
      <Text style={commonStyles.kvKey}>{k}</Text>
      <Text style={commonStyles.kvVal}>{v}</Text>
    </View>
  );
}

export function PdfHeader({
  documentoLabel,
  titulo,
  fechaLabel,
  numeroGeneracion,
  logoBuffer,
}: {
  documentoLabel: string;
  titulo: string;
  fechaLabel: string;
  numeroGeneracion: string;
  logoBuffer: Buffer | null;
}) {
  return (
    <View style={commonStyles.headerTable} fixed>
      <View style={commonStyles.headerLogoCell}>
        {logoBuffer ? (
          <Image src={logoBuffer} style={commonStyles.headerLogoImg} />
        ) : (
          <Text style={commonStyles.headerLogoText}>LOGO{"\n"}EMPRESA</Text>
        )}
      </View>
      <View style={commonStyles.headerMidCell}>
        <Text style={commonStyles.headerMidTop}>{documentoLabel}</Text>
        <Text style={commonStyles.headerMidTitle}>{titulo.toUpperCase()}</Text>
      </View>
      <View style={commonStyles.headerRightCell}>
        <Text style={commonStyles.headerRightRow}>
          <Text style={commonStyles.headerRightLabel}>Fecha: </Text>
          {fechaLabel}
        </Text>
        <Text style={commonStyles.headerRightRow}>
          <Text style={commonStyles.headerRightLabel}>N° Gen.: </Text>
          {numeroGeneracion}
        </Text>
      </View>
    </View>
  );
}

export function PdfFooter({ realizo, documentoLinea }: { realizo: string; documentoLinea: string }) {
  return (
    <View style={commonStyles.footer} fixed>
      <View style={commonStyles.footerTable}>
        <View style={commonStyles.footerCell}>
          <Text style={commonStyles.footerLabel}>Realizó: {realizo}</Text>
        </View>
        <View style={commonStyles.footerCell}>
          <Text style={commonStyles.footerLabel}>Revisó:</Text>
        </View>
        <View style={commonStyles.footerCellLast}>
          <Text style={commonStyles.footerLabel}>Aprobó:</Text>
        </View>
      </View>
      <Text style={commonStyles.footerLine}>{documentoLinea}</Text>
    </View>
  );
}

export function formatFechaArg(fecha: string): string {
  const [y, m, d] = fecha.split("-");
  return d && m && y ? `${d}/${m}/${y}` : fecha;
}
