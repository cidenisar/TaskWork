import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { BORDER, commonStyles, KeyValueRow, PdfHeader, PdfFooter, formatFechaArg } from "./common";
import { HALLAZGO_ESTADO_LABEL } from "@/lib/inspeccion-ia/types";
import { SALA_TIPO_CONSTRUCCION_LABEL } from "@/components/salas/types";
import type { EstadoChecklist, SalaTipoConstruccion } from "@/lib/database.types";

const styles = StyleSheet.create({
  table: { border: `1pt solid ${BORDER}`, marginBottom: 4 },
  headRow: { flexDirection: "row", backgroundColor: "#EDEFF2", borderBottom: `1pt solid ${BORDER}` },
  row: { flexDirection: "row", borderBottom: `1pt solid ${BORDER}` },
  rowLast: { flexDirection: "row" },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", padding: 3.5 },
  td: { fontSize: 7, padding: 3.5 },
  bulletRow: { flexDirection: "row", marginBottom: 3 },
  bulletDot: { width: 10, fontSize: 9 },
  bulletText: { flex: 1, fontSize: 9 },
});

export interface SalaPdfHallazgo {
  texto: string;
  estado: EstadoChecklist;
  comentario: string | null;
}

/**
 * Relevamiento de una Sala/Shelter/Container — el ambiente físico en sí,
 * no el equipamiento que alberga (eso ya se releva aparte, por Tableros/
 * Racks/Equipos). Alta única: denominación, tipo de construcción y fotos
 * generales — sin tabla de ítems, a diferencia de Racks/Torres/Equipos.
 */

export interface SalaPdfProps {
  numeroGeneracion: string;
  region: string;
  provincia: string;
  localidad: string | null;
  sitio: string;
  planta: string | null;
  oficina: string | null;
  denominacion: string;
  tipoConstruccion: SalaTipoConstruccion;
  fecha: string;
  fotosGeneralesBuffers: Buffer[] | null;
  /** Puntos de inspección confirmados (Inspección IA). */
  hallazgos?: SalaPdfHallazgo[];
  /** Otras cosas para reparar o mejorar, una por línea. */
  observaciones?: string[];
  logoBuffer: Buffer | null;
  appName: string;
  realizoNombre: string;
}

export function SalaPdf(props: SalaPdfProps) {
  const {
    numeroGeneracion,
    region,
    provincia,
    localidad,
    sitio,
    planta,
    oficina,
    denominacion,
    tipoConstruccion,
    fecha,
    fotosGeneralesBuffers,
    hallazgos = [],
    observaciones = [],
    logoBuffer,
    appName,
    realizoNombre,
  } = props;
  const fechaLabel = formatFechaArg(fecha);
  const documentoLabel = "RELEVAMIENTO DE SALA / SHELTER";
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

        <Text style={commonStyles.mainTitle}>{denominacion}</Text>

        <View style={commonStyles.kvTable}>
          <KeyValueRow k="N° de Generación:" v={numeroGeneracion} />
          <KeyValueRow k="Tipo de construcción:" v={SALA_TIPO_CONSTRUCCION_LABEL[tipoConstruccion]} />
          <KeyValueRow k="Sitio:" v={sitio} />
          {planta && <KeyValueRow k="Planta:" v={planta} />}
          {oficina && <KeyValueRow k="Oficina:" v={oficina} />}
          {localidad && <KeyValueRow k="Localidad:" v={localidad} />}
          <KeyValueRow k="Provincia:" v={provincia} />
          <KeyValueRow k="Región:" v={region} />
          <KeyValueRow k="Fecha:" v={fechaLabel} last />
        </View>

        {fotosGeneralesBuffers && fotosGeneralesBuffers.length > 0 && (
          <>
            <Text style={commonStyles.sectionTitle}>Fotos</Text>
            <View style={commonStyles.photoGrid}>
              {fotosGeneralesBuffers.map((buf, i) => (
                <View key={i} style={commonStyles.photoCell}>
                  <Image src={buf} style={commonStyles.photo} />
                </View>
              ))}
            </View>
          </>
        )}

        {hallazgos.length > 0 && (
          <>
            <Text style={commonStyles.sectionTitle}>Inspección IA</Text>
            <View style={styles.table}>
              <View style={styles.headRow} fixed>
                <Text style={[styles.th, { width: "40%" }]}>Ítem</Text>
                <Text style={[styles.th, { width: "15%" }]}>Estado</Text>
                <Text style={[styles.th, { width: "45%" }]}>Comentario</Text>
              </View>
              {hallazgos.map((h, i) => (
                <View style={i === hallazgos.length - 1 ? styles.rowLast : styles.row} key={i} wrap={false}>
                  <Text style={[styles.td, { width: "40%" }]}>{h.texto}</Text>
                  <Text style={[styles.td, { width: "15%" }, h.estado === "no_ok" ? { fontFamily: "Helvetica-Bold" } : {}]}>
                    {HALLAZGO_ESTADO_LABEL[h.estado]}
                  </Text>
                  <Text style={[styles.td, { width: "45%" }]}>{h.comentario || "—"}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {observaciones.length > 0 && (
          <>
            <Text style={commonStyles.sectionTitle}>Para reparar o mejorar</Text>
            {observaciones.map((o, i) => (
              <View style={styles.bulletRow} key={i} wrap={false}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{o}</Text>
              </View>
            ))}
          </>
        )}

        <PdfFooter realizo={realizoNombre.toUpperCase()} documentoLinea={documentoLinea} />
      </Page>
    </Document>
  );
}
