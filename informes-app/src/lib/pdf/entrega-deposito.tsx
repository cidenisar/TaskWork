import { Document, Page, Text, View } from "@react-pdf/renderer";
import { commonStyles, KeyValueRow, PdfHeader, PdfFooter, formatFechaArg } from "./common";

/**
 * Constancia de entrega a depósito — equipo/material que vuelve al
 * depósito (nuevo sin usar, o usado pero funcional), distinto de una Baja
 * (que es roto/obsoleto/retirado para siempre). Un documento por entrega,
 * igual criterio que Bajas. Cubre los dos orígenes posibles: un equipo que
 * ya estaba cargado en un sitio, o material nunca registrado como
 * equipamiento (cables, repuestos, equipo nuevo sin instalar).
 */

const MOTIVO_LABEL: Record<string, string> = {
  sobrante_obra: "Sobrante de obra (nunca se usó)",
  reemplazo_funcional: "Reemplazo funcional (funciona, ya no se usa ahí)",
  retorno_mantenimiento: "Retorno post-mantenimiento/reparación",
  otro: "Otro",
};

const CONDICION_LABEL: Record<string, string> = {
  nuevo: "Nuevo (sin usar)",
  usado_funcional: "Usado — funciona",
};

export interface EntregaDepositoPdfProps {
  numeroGeneracion: string;
  region: string;
  provincia: string;
  localidad: string | null;
  sitio: string;
  planta: string | null;
  oficina: string | null;
  fecha: string;
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
  logoBuffer: Buffer | null;
  appName: string;
  realizoNombre: string;
}

export function EntregaDepositoPdf(props: EntregaDepositoPdfProps) {
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
    descripcion,
    categoria,
    marcaModelo,
    numeroSerie,
    etiquetaYpf,
    cantidad,
    condicion,
    motivo,
    comentario,
    logoBuffer,
    appName,
    realizoNombre,
  } = props;
  const fechaLabel = formatFechaArg(fecha);
  const documentoLabel = "CONSTANCIA DE ENTREGA A DEPÓSITO";
  const documentoLinea = `Documento: ${sitio || "—"}-Público · Generado por ${appName}`;

  return (
    <Document title={`${numeroGeneracion} — Entrega a depósito ${descripcion}`}>
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

        <Text style={commonStyles.sectionTitle}>Material / equipo entregado</Text>
        <View style={commonStyles.kvTable}>
          {tipoEquipoLabel && <KeyValueRow k="Tipo:" v={tipoEquipoLabel} />}
          <KeyValueRow k="Descripción:" v={descripcion} />
          <KeyValueRow k="Categoría:" v={categoria || "—"} />
          <KeyValueRow k="Marca/Modelo:" v={marcaModelo || "—"} />
          <KeyValueRow k="N° de Serie:" v={numeroSerie || "—"} />
          <KeyValueRow k="Etiqueta YPF:" v={etiquetaYpf || "—"} />
          <KeyValueRow k="Cantidad:" v={String(cantidad)} />
          <KeyValueRow k="Condición:" v={CONDICION_LABEL[condicion] ?? condicion} last />
        </View>

        <Text style={commonStyles.sectionTitle}>Motivo de la entrega</Text>
        <View style={commonStyles.kvTable}>
          <KeyValueRow k="Motivo:" v={MOTIVO_LABEL[motivo] ?? motivo} />
          <KeyValueRow k="Comentario:" v={comentario || "—"} last />
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
