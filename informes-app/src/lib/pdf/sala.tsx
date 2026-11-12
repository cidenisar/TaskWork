import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { commonStyles, KeyValueRow, PdfHeader, PdfFooter, formatFechaArg } from "./common";
import { SALA_TIPO_CONSTRUCCION_LABEL } from "@/components/salas/types";
import type { SalaTipoConstruccion } from "@/lib/database.types";

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

        <PdfFooter realizo={realizoNombre.toUpperCase()} documentoLinea={documentoLinea} />
      </Page>
    </Document>
  );
}
