import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { BORDER, commonStyles, KeyValueRow, PdfHeader, PdfFooter, formatFechaArg } from "./common";
import { CATEGORIA_EQUIPO_LABEL, type ResumenEquipamientoTorre } from "@/components/torres-comunicacion/types";
import type { TorreComunicacionCategoriaEquipo } from "@/lib/database.types";

/**
 * Relevamiento de Torres de Comunicaciones — inventario de lo montado en
 * una torre (antenas, radioenlaces, baliza, etc.) en un sitio. Mismo estilo
 * que el PDF de Racks, con altura en vez de posición U.
 */

const styles = StyleSheet.create({
  table: { border: `1pt solid ${BORDER}`, marginBottom: 4 },
  headRow: { flexDirection: "row", backgroundColor: "#EDEFF2", borderBottom: `1pt solid ${BORDER}` },
  row: { flexDirection: "row", borderBottom: `1pt solid ${BORDER}` },
  rowLast: { flexDirection: "row" },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", padding: 3.5 },
  td: { fontSize: 7, padding: 3.5 },
});

export interface TorreComunicacionPdfLectura {
  numero: number;
  categoriaEquipo: TorreComunicacionCategoriaEquipo;
  texto: string;
  marcaModelo: string | null;
  alturaM: string | null;
  cantidad: number;
  estado: string | null;
  comentario: string | null;
}

export interface TorreComunicacionPdfProps {
  numeroGeneracion: string;
  denominacion: string;
  region: string;
  provincia: string;
  localidad: string | null;
  sitio: string;
  planta: string | null;
  oficina: string | null;
  fecha: string;
  lecturas: TorreComunicacionPdfLectura[];
  resumen: ResumenEquipamientoTorre;
  fotosGeneralesBuffers: Buffer[] | null;
  logoBuffer: Buffer | null;
  appName: string;
  realizoNombre: string;
}

const W = { n: "5%", categoria: "16%", equipo: "24%", marca: "17%", altura: "9%", cantidad: "7%", estado: "10%", comentario: "12%" };

export function TorreComunicacionPdf(props: TorreComunicacionPdfProps) {
  const {
    numeroGeneracion,
    denominacion,
    region,
    provincia,
    localidad,
    sitio,
    planta,
    oficina,
    fecha,
    lecturas,
    resumen,
    fotosGeneralesBuffers,
    logoBuffer,
    appName,
    realizoNombre,
  } = props;
  const fechaLabel = formatFechaArg(fecha);
  const documentoLabel = "RELEVAMIENTO DE TORRE DE COMUNICACIONES";
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
          <KeyValueRow k="Torre:" v={denominacion} />
          <KeyValueRow k="Sitio:" v={sitio} />
          {planta && <KeyValueRow k="Planta:" v={planta} />}
          {oficina && <KeyValueRow k="Oficina:" v={oficina} />}
          {localidad && <KeyValueRow k="Localidad:" v={localidad} />}
          <KeyValueRow k="Provincia:" v={provincia} />
          <KeyValueRow k="Región:" v={region} />
          <KeyValueRow k="Fecha:" v={fechaLabel} last />
        </View>

        <Text style={commonStyles.sectionTitle}>Resumen del Relevamiento</Text>
        <View style={commonStyles.kvTable}>
          <KeyValueRow k="Total de equipamientos:" v={String(resumen.total)} last={resumen.porCategoria.length === 0} />
          {resumen.porCategoria.length > 0 && (
            <KeyValueRow
              k="Por categoría:"
              v={resumen.porCategoria.map((c) => `${c.cantidad} ${CATEGORIA_EQUIPO_LABEL[c.categoria]}`).join(" · ")}
              last
            />
          )}
        </View>

        {fotosGeneralesBuffers && fotosGeneralesBuffers.length > 0 && (
          <>
            <Text style={commonStyles.sectionTitle}>
              Foto{fotosGeneralesBuffers.length === 1 ? "" : "s"} General{fotosGeneralesBuffers.length === 1 ? "" : "es"} de la Torre
            </Text>
            <View style={commonStyles.photoGrid}>
              {fotosGeneralesBuffers.map((buf, i) => (
                <View style={commonStyles.photoCell} key={i} wrap={false}>
                  <Image src={buf} style={commonStyles.photo} />
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={commonStyles.sectionTitle}>Equipamiento</Text>
        <View style={styles.table}>
          <View style={styles.headRow} fixed>
            <Text style={[styles.th, { width: W.n }]}>N°</Text>
            <Text style={[styles.th, { width: W.categoria }]}>Categoría</Text>
            <Text style={[styles.th, { width: W.equipo }]}>Equipo/Etiqueta</Text>
            <Text style={[styles.th, { width: W.marca }]}>Marca/Modelo</Text>
            <Text style={[styles.th, { width: W.altura, textAlign: "right" }]}>Altura</Text>
            <Text style={[styles.th, { width: W.cantidad, textAlign: "right" }]}>Cant.</Text>
            <Text style={[styles.th, { width: W.estado }]}>Estado</Text>
            <Text style={[styles.th, { width: W.comentario }]}>Comentario</Text>
          </View>
          {lecturas.map((l, i) => (
            <View style={i === lecturas.length - 1 ? styles.rowLast : styles.row} key={i} wrap={false}>
              <Text style={[styles.td, { width: W.n }]}>{l.numero}</Text>
              <Text style={[styles.td, { width: W.categoria }]}>{CATEGORIA_EQUIPO_LABEL[l.categoriaEquipo]}</Text>
              <Text style={[styles.td, { width: W.equipo }]}>{l.texto}</Text>
              <Text style={[styles.td, { width: W.marca }]}>{l.marcaModelo || "—"}</Text>
              <Text style={[styles.td, { width: W.altura, textAlign: "right" }]}>{l.alturaM || "—"}</Text>
              <Text style={[styles.td, { width: W.cantidad, textAlign: "right" }]}>{l.cantidad}</Text>
              <Text style={[styles.td, { width: W.estado }]}>{l.estado || "—"}</Text>
              <Text style={[styles.td, { width: W.comentario }]}>{l.comentario || "—"}</Text>
            </View>
          ))}
        </View>

        <PdfFooter realizo={realizoNombre.toUpperCase()} documentoLinea={documentoLinea} />
      </Page>
    </Document>
  );
}
