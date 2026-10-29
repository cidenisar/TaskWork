import { Document, Page, Text, View } from "@react-pdf/renderer";
import { commonStyles, KeyValueRow, PdfHeader, PdfFooter, formatFechaArg } from "./common";

/**
 * Comprobante de baja de un equipo — tablero (circuito/elemento), rack
 * (equipamiento) o equipo individual. Un documento por baja (no un remito
 * que junte varias), para entregar junto con el equipo físico a depósito.
 * Mismo estilo de cabecera/pie que el resto de los PDF de la app.
 */

const MOTIVO_LABEL: Record<string, string> = {
  rotura: "Rotura",
  ampliacion: "Ampliación / reemplazo",
  obsolescencia: "Obsolescencia",
  otro: "Otro",
};

export interface BajaPdfProps {
  numeroGeneracion: string;
  region: string;
  provincia: string;
  localidad: string | null;
  sitio: string;
  planta: string | null;
  oficina: string | null;
  fecha: string;
  tipoEquipoLabel: string;
  categoriaLabel: string;
  equipoTexto: string;
  marcaModelo: string | null;
  numeroSerie: string | null;
  etiquetaYpf: string | null;
  motivo: string;
  comentario: string | null;
  logoBuffer: Buffer | null;
  appName: string;
  realizoNombre: string;
}

export function BajaPdf(props: BajaPdfProps) {
  const {
    numeroGeneracion,
    region,
    provincia,
    localidad,
    sitio,
    planta,
    oficina,
    fecha,
    tipoEquipoLabel,
    categoriaLabel,
    equipoTexto,
    marcaModelo,
    numeroSerie,
    etiquetaYpf,
    motivo,
    comentario,
    logoBuffer,
    appName,
    realizoNombre,
  } = props;
  const fechaLabel = formatFechaArg(fecha);
  const documentoLabel = "COMPROBANTE DE BAJA DE EQUIPAMIENTO";
  const documentoLinea = `Documento: ${sitio || "—"}-Público · Generado por ${appName}`;

  return (
    <Document title={`${numeroGeneracion} — Baja ${equipoTexto}`}>
      <Page size="A4" style={commonStyles.page} wrap>
        <PdfHeader
          documentoLabel={documentoLabel}
          titulo={sitio}
          fechaLabel={fechaLabel}
          numeroGeneracion={numeroGeneracion}
          logoBuffer={logoBuffer}
        />

        <Text style={commonStyles.mainTitle}>Baja de equipamiento — {sitio}</Text>

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

        <Text style={commonStyles.sectionTitle}>Equipo dado de baja</Text>
        <View style={commonStyles.kvTable}>
          <KeyValueRow k="Tipo:" v={tipoEquipoLabel} />
          <KeyValueRow k="Categoría:" v={categoriaLabel} />
          <KeyValueRow k="Equipo/Etiqueta:" v={equipoTexto} />
          <KeyValueRow k="Marca/Modelo:" v={marcaModelo || "—"} />
          <KeyValueRow k="N° de Serie:" v={numeroSerie || "—"} />
          <KeyValueRow k="Etiqueta YPF:" v={etiquetaYpf || "—"} last />
        </View>

        <Text style={commonStyles.sectionTitle}>Motivo de la baja</Text>
        <View style={commonStyles.kvTable}>
          <KeyValueRow k="Motivo:" v={MOTIVO_LABEL[motivo] ?? motivo} />
          <KeyValueRow k="Comentario:" v={comentario || "—"} last />
        </View>

        <Text style={commonStyles.paragraph}>
          Este equipo queda retirado del equipamiento activo del sitio y pasa a disposición final en depósito —
          este comprobante se entrega junto con el equipo físico.
        </Text>

        <PdfFooter realizo={realizoNombre.toUpperCase()} documentoLinea={documentoLinea} />
      </Page>
    </Document>
  );
}
