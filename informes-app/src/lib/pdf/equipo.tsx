import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { BORDER, commonStyles, KeyValueRow, PdfHeader, PdfFooter, formatFechaArg } from "./common";
import { CATEGORIA_EQUIPO_LABEL, type ResumenEquipos } from "@/components/equipos/types";
import type { EquipoCategoria } from "@/lib/database.types";

/**
 * Relevamiento de Equipos Individuales — equipamiento suelto de un sitio que
 * no vive dentro de un rack ni de un tablero (UPS, cámaras, control de
 * acceso, etc.). Mismo estilo de cabecera/pie/resumen que el PDF de Racks,
 * con N° de Serie en vez de Posición (no hay noción de "unidad de rack"
 * acá) y sin denominación de contenedor — el título es directamente la
 * Ubicación.
 */

const styles = StyleSheet.create({
  table: { border: `1pt solid ${BORDER}`, marginBottom: 4 },
  headRow: { flexDirection: "row", backgroundColor: "#EDEFF2", borderBottom: `1pt solid ${BORDER}` },
  row: { flexDirection: "row", borderBottom: `1pt solid ${BORDER}` },
  rowLast: { flexDirection: "row" },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", padding: 3.5 },
  td: { fontSize: 7, padding: 3.5 },
});

export interface EquipoPdfLectura {
  categoriaEquipo: EquipoCategoria;
  texto: string;
  marcaModelo: string | null;
  numeroSerie: string | null;
  cantidad: number;
  estado: string | null;
  comentario: string | null;
}

export interface EquipoPdfProps {
  numeroGeneracion: string;
  region: string;
  provincia: string;
  localidad: string | null;
  sitio: string;
  planta: string | null;
  oficina: string | null;
  fecha: string;
  lecturas: EquipoPdfLectura[];
  resumen: ResumenEquipos;
  fotoGeneralBuffer: Buffer | null;
  logoBuffer: Buffer | null;
  appName: string;
  realizoNombre: string;
}

const W = { n: "5%", categoria: "16%", equipo: "25%", marca: "17%", serie: "15%", cantidad: "6%", estado: "8%", comentario: "8%" };

export function EquipoPdf(props: EquipoPdfProps) {
  const {
    numeroGeneracion,
    region,
    provincia,
    localidad,
    sitio,
    planta,
    oficina,
    fecha,
    lecturas,
    resumen,
    fotoGeneralBuffer,
    logoBuffer,
    appName,
    realizoNombre,
  } = props;
  const fechaLabel = formatFechaArg(fecha);
  const documentoLabel = "RELEVAMIENTO DE EQUIPOS INDIVIDUALES";
  const documentoLinea = `Documento: ${sitio || "—"}-Público · Generado por ${appName}`;

  return (
    <Document title={`${numeroGeneracion} — ${sitio}`}>
      <Page size="A4" style={commonStyles.page} wrap>
        <PdfHeader
          documentoLabel={documentoLabel}
          titulo={sitio}
          fechaLabel={fechaLabel}
          numeroGeneracion={numeroGeneracion}
          logoBuffer={logoBuffer}
        />

        <Text style={commonStyles.mainTitle}>{sitio} — Equipos Individuales</Text>

        <View style={commonStyles.kvTable}>
          <KeyValueRow k="N° de Generación:" v={numeroGeneracion} />
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
          <KeyValueRow k="Total de equipos:" v={String(resumen.total)} last={resumen.porCategoria.length === 0} />
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
            <Text style={commonStyles.sectionTitle}>Foto General</Text>
            <View style={{ marginBottom: 6 }}>
              <Image src={fotoGeneralBuffer} style={commonStyles.photo} />
            </View>
          </>
        )}

        <Text style={commonStyles.sectionTitle}>Equipos</Text>
        <View style={styles.table}>
          <View style={styles.headRow} fixed>
            <Text style={[styles.th, { width: W.n }]}>N°</Text>
            <Text style={[styles.th, { width: W.categoria }]}>Categoría</Text>
            <Text style={[styles.th, { width: W.equipo }]}>Equipo/Etiqueta</Text>
            <Text style={[styles.th, { width: W.marca }]}>Marca/Modelo</Text>
            <Text style={[styles.th, { width: W.serie }]}>N° de Serie</Text>
            <Text style={[styles.th, { width: W.cantidad, textAlign: "right" }]}>Cant.</Text>
            <Text style={[styles.th, { width: W.estado }]}>Estado</Text>
            <Text style={[styles.th, { width: W.comentario }]}>Comentario</Text>
          </View>
          {lecturas.map((l, i) => (
            <View style={i === lecturas.length - 1 ? styles.rowLast : styles.row} key={i} wrap={false}>
              <Text style={[styles.td, { width: W.n }]}>{i + 1}</Text>
              <Text style={[styles.td, { width: W.categoria }]}>{CATEGORIA_EQUIPO_LABEL[l.categoriaEquipo]}</Text>
              <Text style={[styles.td, { width: W.equipo }]}>{l.texto}</Text>
              <Text style={[styles.td, { width: W.marca }]}>{l.marcaModelo || "—"}</Text>
              <Text style={[styles.td, { width: W.serie }]}>{l.numeroSerie || "—"}</Text>
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
