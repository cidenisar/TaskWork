import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { BORDER, commonStyles, KeyValueRow, PdfHeader, PdfFooter, formatFechaArg } from "./common";

/**
 * Informe de Instalación — materiales instalados en un sitio a partir de un
 * remito de depósito en papel. Un documento por carga: tabla de lo
 * instalado, la foto del remito, la lista de lo que el remito decía que
 * traía (con lo que sobró de cada línea), y si hubo sobrantes, el N° de la
 * devolución a depósito generada automáticamente al guardar.
 */

const styles = StyleSheet.create({
  table: { border: `1pt solid ${BORDER}`, marginBottom: 4 },
  headRow: { flexDirection: "row", backgroundColor: "#EDEFF2", borderBottom: `1pt solid ${BORDER}` },
  row: { flexDirection: "row", borderBottom: `1pt solid ${BORDER}` },
  rowLast: { flexDirection: "row" },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", padding: 3.5 },
  td: { fontSize: 7, padding: 3.5 },
});

export interface InstalacionPdfItem {
  descripcion: string;
  categoria: string | null;
  marcaModelo: string | null;
  numeroSerie: string | null;
  etiquetaYpf: string | null;
  cantidad: number;
  comentario: string | null;
}

export interface InstalacionPdfRemitoItem {
  descripcion: string;
  cantidadEsperada: number;
  cantidadSobrante: number;
}

export interface InstalacionPdfProps {
  numeroGeneracion: string;
  region: string;
  provincia: string;
  localidad: string | null;
  sitio: string;
  planta: string | null;
  oficina: string | null;
  fecha: string;
  items: InstalacionPdfItem[];
  remitoNumero: string | null;
  remitoItems: InstalacionPdfRemitoItem[];
  remitoFotoBuffer: Buffer | null;
  entregaDepositoNumeroGeneracion: string | null;
  logoBuffer: Buffer | null;
  appName: string;
  realizoNombre: string;
}

const W_INST = { n: "5%", categoria: "16%", descripcion: "27%", marca: "16%", serie: "16%", cantidad: "6%", comentario: "14%" };
const W_REM = { descripcion: "60%", esperada: "20%", sobrante: "20%" };

export function InstalacionPdf(props: InstalacionPdfProps) {
  const {
    numeroGeneracion,
    region,
    provincia,
    localidad,
    sitio,
    planta,
    oficina,
    fecha,
    items,
    remitoNumero,
    remitoItems,
    remitoFotoBuffer,
    entregaDepositoNumeroGeneracion,
    logoBuffer,
    appName,
    realizoNombre,
  } = props;
  const fechaLabel = formatFechaArg(fecha);
  const documentoLabel = "INFORME DE INSTALACIÓN";
  const documentoLinea = `Documento: ${sitio || "—"}-Público · Generado por ${appName}`;
  const tituloMaterial = items.length === 1 ? items[0].descripcion : `${items.length} materiales/equipos`;

  return (
    <Document title={`${numeroGeneracion} — Instalación ${tituloMaterial}`}>
      <Page size="A4" style={commonStyles.page} wrap>
        <PdfHeader
          documentoLabel={documentoLabel}
          titulo={sitio}
          fechaLabel={fechaLabel}
          numeroGeneracion={numeroGeneracion}
          logoBuffer={logoBuffer}
        />

        <Text style={commonStyles.mainTitle}>Instalación — {sitio}</Text>

        <View style={commonStyles.kvTable}>
          <KeyValueRow k="N° de Generación:" v={numeroGeneracion} />
          <KeyValueRow k="Sitio:" v={sitio} />
          {planta && <KeyValueRow k="Planta:" v={planta} />}
          {oficina && <KeyValueRow k="Oficina:" v={oficina} />}
          {localidad && <KeyValueRow k="Localidad:" v={localidad} />}
          <KeyValueRow k="Provincia:" v={provincia} />
          <KeyValueRow k="Región:" v={region} />
          {remitoNumero && <KeyValueRow k="N° de Remito:" v={remitoNumero} />}
          <KeyValueRow k="Fecha:" v={fechaLabel} last />
        </View>

        <Text style={commonStyles.sectionTitle}>Material / equipo instalado ({items.length})</Text>
        <View style={styles.table}>
          <View style={styles.headRow} fixed>
            <Text style={[styles.th, { width: W_INST.n }]}>N°</Text>
            <Text style={[styles.th, { width: W_INST.categoria }]}>Categoría</Text>
            <Text style={[styles.th, { width: W_INST.descripcion }]}>Descripción</Text>
            <Text style={[styles.th, { width: W_INST.marca }]}>Marca/Modelo</Text>
            <Text style={[styles.th, { width: W_INST.serie }]}>Serie / Etiq. YPF</Text>
            <Text style={[styles.th, { width: W_INST.cantidad, textAlign: "right" }]}>Cant.</Text>
            <Text style={[styles.th, { width: W_INST.comentario }]}>Comentario</Text>
          </View>
          {items.map((it, i) => {
            const serieYpf = [it.numeroSerie ? `S/N ${it.numeroSerie}` : null, it.etiquetaYpf ? `YPF ${it.etiquetaYpf}` : null]
              .filter(Boolean)
              .join(" · ");
            return (
              <View style={i === items.length - 1 ? styles.rowLast : styles.row} key={i} wrap={false}>
                <Text style={[styles.td, { width: W_INST.n }]}>{i + 1}</Text>
                <Text style={[styles.td, { width: W_INST.categoria }]}>{it.categoria || "—"}</Text>
                <Text style={[styles.td, { width: W_INST.descripcion }]}>{it.descripcion}</Text>
                <Text style={[styles.td, { width: W_INST.marca }]}>{it.marcaModelo || "—"}</Text>
                <Text style={[styles.td, { width: W_INST.serie }]}>{serieYpf || "—"}</Text>
                <Text style={[styles.td, { width: W_INST.cantidad, textAlign: "right" }]}>{it.cantidad}</Text>
                <Text style={[styles.td, { width: W_INST.comentario }]}>{it.comentario || "—"}</Text>
              </View>
            );
          })}
        </View>

        {remitoFotoBuffer && (
          <>
            <Text style={commonStyles.sectionTitle}>Remito</Text>
            <View style={{ marginBottom: 6 }}>
              <Image src={remitoFotoBuffer} style={commonStyles.photo} />
            </View>
          </>
        )}

        {remitoItems.length > 0 && (
          <>
            <Text style={commonStyles.sectionTitle}>Lista del remito</Text>
            <View style={styles.table}>
              <View style={styles.headRow} fixed>
                <Text style={[styles.th, { width: W_REM.descripcion }]}>Descripción</Text>
                <Text style={[styles.th, { width: W_REM.esperada, textAlign: "right" }]}>Cant. remito</Text>
                <Text style={[styles.th, { width: W_REM.sobrante, textAlign: "right" }]}>Cant. sobrante</Text>
              </View>
              {remitoItems.map((it, i) => (
                <View style={i === remitoItems.length - 1 ? styles.rowLast : styles.row} key={i} wrap={false}>
                  <Text style={[styles.td, { width: W_REM.descripcion }]}>{it.descripcion}</Text>
                  <Text style={[styles.td, { width: W_REM.esperada, textAlign: "right" }]}>{it.cantidadEsperada}</Text>
                  <Text style={[styles.td, { width: W_REM.sobrante, textAlign: "right" }]}>{it.cantidadSobrante || "—"}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {entregaDepositoNumeroGeneracion && (
          <Text style={commonStyles.paragraph}>
            El material sobrante del remito se devolvió automáticamente a depósito — comprobante{" "}
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{entregaDepositoNumeroGeneracion}</Text>.
          </Text>
        )}

        <PdfFooter realizo={realizoNombre.toUpperCase()} documentoLinea={documentoLinea} />
      </Page>
    </Document>
  );
}
