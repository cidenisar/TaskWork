import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { BORDER, commonStyles, KeyValueRow, PdfHeader, PdfFooter, formatFechaArg } from "./common";

/**
 * Constancia de entrega a depósito — uno o varios materiales/equipos que
 * vuelven al depósito (nuevo sin usar, o usado pero funcional), distinto
 * de una Baja (que es roto/obsoleto/retirado para siempre). Un documento
 * por entrega — si son varios materiales de la misma visita, van todos en
 * la misma tabla con un solo N° de generación, igual criterio que el PDF
 * de Equipos Individuales (una fila por ítem).
 */

const styles = StyleSheet.create({
  table: { border: `1pt solid ${BORDER}`, marginBottom: 4 },
  headRow: { flexDirection: "row", backgroundColor: "#EDEFF2", borderBottom: `1pt solid ${BORDER}` },
  row: { flexDirection: "row", borderBottom: `1pt solid ${BORDER}` },
  rowLast: { flexDirection: "row" },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", padding: 3.5 },
  td: { fontSize: 7, padding: 3.5 },
});

const MOTIVO_LABEL: Record<string, string> = {
  sobrante_obra: "Sobrante de obra",
  reemplazo_funcional: "Reemplazo funcional",
  retorno_mantenimiento: "Retorno post-mantenimiento",
  otro: "Otro",
};

const CONDICION_LABEL: Record<string, string> = {
  nuevo: "Nuevo",
  usado_funcional: "Usado — funciona",
};

export interface EntregaDepositoPdfItem {
  tipoEquipoLabel: string | null;
  descripcion: string;
  categoria: string | null;
  marcaModelo: string | null;
  numeroSerie: string | null;
  etiquetaYpf: string | null;
  cantidad: number;
  condicion: string;
  motivo: string;
  comentario: string | null;
}

export interface EntregaDepositoPdfProps {
  numeroGeneracion: string;
  region: string;
  provincia: string;
  localidad: string | null;
  sitio: string;
  planta: string | null;
  oficina: string | null;
  fecha: string;
  items: EntregaDepositoPdfItem[];
  logoBuffer: Buffer | null;
  appName: string;
  realizoNombre: string;
}

const W = { n: "5%", categoria: "14%", descripcion: "23%", marca: "15%", serie: "15%", cantidad: "6%", condicion: "11%", comentario: "11%" };

export function EntregaDepositoPdf(props: EntregaDepositoPdfProps) {
  const { numeroGeneracion, region, provincia, localidad, sitio, planta, oficina, fecha, items, logoBuffer, appName, realizoNombre } = props;
  const fechaLabel = formatFechaArg(fecha);
  const documentoLabel = "CONSTANCIA DE ENTREGA A DEPÓSITO";
  const documentoLinea = `Documento: ${sitio || "—"}-Público · Generado por ${appName}`;
  const tituloMaterial = items.length === 1 ? items[0].descripcion : `${items.length} materiales/equipos`;

  return (
    <Document title={`${numeroGeneracion} — Entrega a depósito ${tituloMaterial}`}>
      <Page size="A4" style={commonStyles.page} wrap>
        <PdfHeader
          documentoLabel={documentoLabel}
          titulo={sitio}
          fechaLabel={fechaLabel}
          numeroGeneracion={numeroGeneracion}
          logoBuffer={logoBuffer}
        />

        <Text style={commonStyles.mainTitle}>Entrega a depósito — {sitio}</Text>

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

        <Text style={commonStyles.sectionTitle}>Material / equipo entregado ({items.length})</Text>
        <View style={styles.table}>
          <View style={styles.headRow} fixed>
            <Text style={[styles.th, { width: W.n }]}>N°</Text>
            <Text style={[styles.th, { width: W.categoria }]}>Categoría</Text>
            <Text style={[styles.th, { width: W.descripcion }]}>Descripción</Text>
            <Text style={[styles.th, { width: W.marca }]}>Marca/Modelo</Text>
            <Text style={[styles.th, { width: W.serie }]}>Serie / Etiq. YPF</Text>
            <Text style={[styles.th, { width: W.cantidad, textAlign: "right" }]}>Cant.</Text>
            <Text style={[styles.th, { width: W.condicion }]}>Condición</Text>
            <Text style={[styles.th, { width: W.comentario }]}>Comentario</Text>
          </View>
          {items.map((it, i) => {
            const serieYpf = [it.numeroSerie ? `S/N ${it.numeroSerie}` : null, it.etiquetaYpf ? `YPF ${it.etiquetaYpf}` : null]
              .filter(Boolean)
              .join(" · ");
            const comentarioConMotivo = [MOTIVO_LABEL[it.motivo] ?? it.motivo, it.comentario].filter(Boolean).join(" — ");
            return (
              <View style={i === items.length - 1 ? styles.rowLast : styles.row} key={i} wrap={false}>
                <Text style={[styles.td, { width: W.n }]}>{i + 1}</Text>
                <Text style={[styles.td, { width: W.categoria }]}>{it.categoria || it.tipoEquipoLabel || "—"}</Text>
                <Text style={[styles.td, { width: W.descripcion }]}>{it.descripcion}</Text>
                <Text style={[styles.td, { width: W.marca }]}>{it.marcaModelo || "—"}</Text>
                <Text style={[styles.td, { width: W.serie }]}>{serieYpf || "—"}</Text>
                <Text style={[styles.td, { width: W.cantidad, textAlign: "right" }]}>{it.cantidad}</Text>
                <Text style={[styles.td, { width: W.condicion }]}>{CONDICION_LABEL[it.condicion] ?? it.condicion}</Text>
                <Text style={[styles.td, { width: W.comentario }]}>{comentarioConMotivo || "—"}</Text>
              </View>
            );
          })}
        </View>

        <Text style={commonStyles.paragraph}>
          Este material/equipo vuelve al depósito — este comprobante se entrega junto con el material físico como
          constancia del ingreso.
        </Text>

        <PdfFooter realizo={realizoNombre.toUpperCase()} documentoLinea={documentoLinea} />
      </Page>
    </Document>
  );
}
