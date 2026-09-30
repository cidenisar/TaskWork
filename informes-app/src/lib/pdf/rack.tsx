import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { BORDER, commonStyles, KeyValueRow, PdfHeader, PdfFooter, formatFechaArg } from "./common";
import { CATEGORIA_EQUIPO_LABEL, type ResumenEquipamiento } from "@/components/racks/types";
import type { RackCategoriaEquipo } from "@/lib/database.types";

/**
 * Relevamiento de Equipamiento — inventario de un rack en un sitio/sala/
 * shelter. Mismo estilo de cabecera/pie que el resto de los PDF, con un
 * resumen de equipamiento (total + por categoría) y el detalle fila por
 * fila: categoría, equipo/etiqueta, marca/modelo, posición en el rack (U),
 * cantidad, estado y comentario.
 */

const styles = StyleSheet.create({
  table: { border: `1pt solid ${BORDER}`, marginBottom: 4 },
  headRow: { flexDirection: "row", backgroundColor: "#EDEFF2", borderBottom: `1pt solid ${BORDER}` },
  row: { flexDirection: "row", borderBottom: `1pt solid ${BORDER}` },
  rowLast: { flexDirection: "row" },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", padding: 3.5 },
  td: { fontSize: 7, padding: 3.5 },
});

export interface RackPdfLectura {
  numero: number;
  categoriaEquipo: RackCategoriaEquipo;
  texto: string;
  marcaModelo: string | null;
  posicionU: string | null;
  cantidad: number;
  estado: string | null;
  comentario: string | null;
}

export interface RackPdfProps {
  numeroGeneracion: string;
  denominacion: string;
  provincia: string;
  sectorOficina: string | null;
  sala: string;
  fecha: string;
  lecturas: RackPdfLectura[];
  resumen: ResumenEquipamiento;
  fotoGeneralBuffer: Buffer | null;
  logoBuffer: Buffer | null;
  appName: string;
  realizoNombre: string;
}

const W = { n: "5%", categoria: "14%", equipo: "22%", marca: "16%", posicion: "9%", cantidad: "7%", estado: "10%", comentario: "17%" };

export function RackPdf(props: RackPdfProps) {
  const {
    numeroGeneracion,
    denominacion,
    provincia,
    sectorOficina,
    sala,
    fecha,
    lecturas,
    resumen,
    fotoGeneralBuffer,
    logoBuffer,
    appName,
    realizoNombre,
  } = props;
  const fechaLabel = formatFechaArg(fecha);
  const documentoLabel = "RELEVAMIENTO DE EQUIPAMIENTO";
  const documentoLinea = `Documento: ${sala || "—"}-Público · Generado por ${appName}`;

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
          {denominacion} — {sala}
        </Text>

        <View style={commonStyles.kvTable}>
          <KeyValueRow k="N° de Generación:" v={numeroGeneracion} />
          <KeyValueRow k="Rack:" v={denominacion} />
          <KeyValueRow k="Sala:" v={sala} />
          {sectorOficina && <KeyValueRow k="Sector/Oficina:" v={sectorOficina} />}
          <KeyValueRow k="Provincia:" v={provincia} />
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

        {fotoGeneralBuffer && (
          <>
            <Text style={commonStyles.sectionTitle}>Foto General del Rack</Text>
            <View style={{ marginBottom: 6 }}>
              <Image src={fotoGeneralBuffer} style={commonStyles.photo} />
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
            <Text style={[styles.th, { width: W.posicion }]}>Posición</Text>
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
              <Text style={[styles.td, { width: W.posicion }]}>{l.posicionU || "—"}</Text>
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
