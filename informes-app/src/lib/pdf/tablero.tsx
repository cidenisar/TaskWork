import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { BORDER, commonStyles, KeyValueRow, PdfHeader, PdfFooter, formatFechaArg } from "./common";
import {
  CATEGORIA_EQUIPO_LABEL,
  TABLERO_EVENTO_LABEL,
  itemMideCorriente,
  labelSubsistemas,
  type ResumenEquipamiento,
} from "@/components/tableros/types";
import type { TableroCategoriaEquipo, TableroEventoTipo, TableroTipo, TableroTipoCircuito } from "@/lib/database.types";

/**
 * Reemplaza la planilla Excel manual de medición de consumo — misma cabecera
 * y pie que el resto de los PDF (spec sección 11), con un resumen de
 * equipamiento relevado y una tabla de circuitos/elementos. Un tablero puede
 * ser mixto (energía + CCTV + control de acceso conviviendo en el mismo
 * gabinete): la columna de corriente por fase F/R/S/T se muestra por fila
 * (solo térmicas/disyuntores en un circuito AC la tienen), no por tablero.
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
  categoriaEquipo: TableroCategoriaEquipo;
  tipoCircuito: TableroTipoCircuito;
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
  subsistemas: TableroTipo[];
  tipoEvento: TableroEventoTipo;
  denominacion: string;
  region: string;
  provincia: string;
  localidad: string | null;
  sitio: string;
  planta: string | null;
  oficina: string | null;
  fecha: string;
  lecturas: TableroPdfLectura[];
  resumen: ResumenEquipamiento;
  fotoGeneralBuffer: Buffer | null;
  logoBuffer: Buffer | null;
  appName: string;
  realizoNombre: string;
}

interface ColWidths {
  n: string;
  circuito: string;
  categoria: string;
  estado: string;
  amp: string;
  fase: string;
  comentario: string;
}
const WIDTHS_CON_CORRIENTE: ColWidths = { n: "4%", circuito: "16%", categoria: "13%", estado: "10%", amp: "7%", fase: "6%", comentario: "18%" };
const WIDTHS_SIN_CORRIENTE: ColWidths = { n: "5%", circuito: "22%", categoria: "16%", estado: "13%", amp: "0%", fase: "0%", comentario: "44%" };

export function TableroPdf(props: TableroPdfProps) {
  const {
    numeroGeneracion,
    subsistemas,
    tipoEvento,
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
    fotoGeneralBuffer,
    logoBuffer,
    appName,
    realizoNombre,
  } = props;
  const algunaFilaMideCorriente = lecturas.some((l) => itemMideCorriente(l.categoriaEquipo, l.tipoCircuito, tipoEvento));
  const w = algunaFilaMideCorriente ? WIDTHS_CON_CORRIENTE : WIDTHS_SIN_CORRIENTE;
  const fechaLabel = formatFechaArg(fecha);
  const documentoLabel = `${TABLERO_EVENTO_LABEL[tipoEvento].toUpperCase()} — TABLERO ${labelSubsistemas(subsistemas).toUpperCase()}`;
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
          <KeyValueRow k="Subsistemas del Tablero:" v={labelSubsistemas(subsistemas)} />
          <KeyValueRow k="Denominación:" v={denominacion} />
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
          <KeyValueRow k="Total de equipamientos:" v={String(resumen.total)} />
          <KeyValueRow k="Circuitos 220V monofásico:" v={String(resumen.circuitos220vMono)} />
          <KeyValueRow
            k="Circuitos 380V trifásico:"
            v={String(resumen.circuitos380vTri)}
            last={resumen.porCategoria.length === 0}
          />
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
            <Text style={commonStyles.sectionTitle}>Foto General del Tablero</Text>
            <View style={{ marginBottom: 6 }}>
              <Image src={fotoGeneralBuffer} style={commonStyles.photo} />
            </View>
          </>
        )}

        <Text style={commonStyles.sectionTitle}>Circuitos / Elementos</Text>
        <View style={styles.table}>
          <View style={styles.headRow} fixed>
            <Text style={[styles.th, { width: w.n }]}>N°</Text>
            <Text style={[styles.th, { width: w.circuito }]}>Circuito/Elemento</Text>
            <Text style={[styles.th, { width: w.categoria }]}>Categoría</Text>
            <Text style={[styles.th, { width: w.estado }]}>Estado</Text>
            {algunaFilaMideCorriente && (
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
          {lecturas.map((l, i) => {
            const mideCorriente = itemMideCorriente(l.categoriaEquipo, l.tipoCircuito, tipoEvento);
            return (
              <View style={i === lecturas.length - 1 ? styles.rowLast : styles.row} key={i} wrap={false}>
                <Text style={[styles.td, { width: w.n }]}>{l.numero}</Text>
                <Text style={[styles.td, { width: w.circuito }]}>{l.texto}</Text>
                <Text style={[styles.td, { width: w.categoria }]}>{CATEGORIA_EQUIPO_LABEL[l.categoriaEquipo]}</Text>
                <Text style={[styles.td, { width: w.estado }]}>{l.estado || "—"}</Text>
                {algunaFilaMideCorriente && (
                  <>
                    <Text style={[styles.td, { width: w.amp, textAlign: "right" }]}>{l.ampNominal || "—"}</Text>
                    <Text style={[styles.td, { width: w.fase, textAlign: "right" }]}>{mideCorriente ? (l.corrienteF ?? "—") : "—"}</Text>
                    <Text style={[styles.td, { width: w.fase, textAlign: "right" }]}>{mideCorriente ? (l.corrienteR ?? "—") : "—"}</Text>
                    <Text style={[styles.td, { width: w.fase, textAlign: "right" }]}>{mideCorriente ? (l.corrienteS ?? "—") : "—"}</Text>
                    <Text style={[styles.td, { width: w.fase, textAlign: "right" }]}>{mideCorriente ? (l.corrienteT ?? "—") : "—"}</Text>
                  </>
                )}
                <Text style={[styles.td, { width: w.comentario }]}>{l.comentario || "—"}</Text>
              </View>
            );
          })}
        </View>

        <PdfFooter realizo={realizoNombre.toUpperCase()} documentoLinea={documentoLinea} />
      </Page>
    </Document>
  );
}
