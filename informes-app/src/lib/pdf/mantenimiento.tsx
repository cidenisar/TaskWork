import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { commonStyles, KeyValueRow, PdfHeader, PdfFooter, formatFechaArg } from "./common";

/**
 * Comprobante genérico de "trabajo realizado" — mantenimiento de Tablero,
 * Service de Vehículos, y Plan de Mantenimiento de Racks/Equipos/Salas
 * comparten esta misma plantilla simple (un log, no una grilla de
 * relevamiento): contexto del equipo/vehículo + ubicación (cuando aplica,
 * un vehículo no tiene una) + fecha/descripción/foto del trabajo.
 */

const ESTADO_CHECKLIST_LABEL: Record<string, string> = { ok: "OK", no_ok: "No OK", no_aplica: "N/A" };

export interface MantenimientoPdfProps {
  numeroGeneracion: string;
  documentoLabel: string;
  contextoLabel: string;
  region: string | null;
  provincia: string | null;
  localidad: string | null;
  sitio: string | null;
  planta: string | null;
  oficina: string | null;
  fecha: string;
  descripcion: string | null;
  kilometraje: number | null;
  proximoMantenimiento: string | null;
  checklist: { texto: string; estado: string; observacion: string | null }[] | null;
  fotoBuffer: Buffer | null;
  logoBuffer: Buffer | null;
  appName: string;
  realizoNombre: string;
}

export function MantenimientoPdf(props: MantenimientoPdfProps) {
  const {
    numeroGeneracion,
    documentoLabel,
    contextoLabel,
    region,
    provincia,
    localidad,
    sitio,
    planta,
    oficina,
    fecha,
    descripcion,
    kilometraje,
    proximoMantenimiento,
    checklist,
    fotoBuffer,
    logoBuffer,
    appName,
    realizoNombre,
  } = props;
  const fechaLabel = formatFechaArg(fecha);
  const documentoLinea = `Documento: ${(sitio || contextoLabel) ?? "—"}-Público · Generado por ${appName}`;

  return (
    <Document title={`${numeroGeneracion} — ${contextoLabel}`}>
      <Page size="A4" style={commonStyles.page} wrap>
        <PdfHeader
          documentoLabel={documentoLabel}
          titulo={contextoLabel}
          fechaLabel={fechaLabel}
          numeroGeneracion={numeroGeneracion}
          logoBuffer={logoBuffer}
        />

        <Text style={commonStyles.mainTitle}>{documentoLabel} — {contextoLabel}</Text>

        <View style={commonStyles.kvTable}>
          <KeyValueRow k="N° de Generación:" v={numeroGeneracion} />
          {sitio && <KeyValueRow k="Sitio:" v={sitio} />}
          {planta && <KeyValueRow k="Planta:" v={planta} />}
          {oficina && <KeyValueRow k="Oficina:" v={oficina} />}
          {localidad && <KeyValueRow k="Localidad:" v={localidad} />}
          {provincia && <KeyValueRow k="Provincia:" v={provincia} />}
          {region && <KeyValueRow k="Región:" v={region} />}
          {kilometraje != null && <KeyValueRow k="Kilometraje:" v={`${kilometraje.toLocaleString("es-AR")} km`} />}
          <KeyValueRow k="Fecha:" v={fechaLabel} last />
        </View>

        <Text style={commonStyles.sectionTitle}>Trabajo realizado</Text>
        <View style={commonStyles.kvTable}>
          <KeyValueRow k="Descripción:" v={descripcion || "—"} />
          <KeyValueRow k="Próximo mantenimiento:" v={proximoMantenimiento ? formatFechaArg(proximoMantenimiento) : "—"} last />
        </View>

        {checklist && checklist.length > 0 && (
          <>
            <Text style={commonStyles.sectionTitle}>Checklist</Text>
            <View style={commonStyles.kvTable}>
              {checklist.map((c, i) => (
                <KeyValueRow
                  key={i}
                  k={`${c.texto}:`}
                  v={c.observacion ? `${ESTADO_CHECKLIST_LABEL[c.estado] ?? c.estado} — ${c.observacion}` : ESTADO_CHECKLIST_LABEL[c.estado] ?? c.estado}
                  last={i === checklist.length - 1}
                />
              ))}
            </View>
          </>
        )}

        {fotoBuffer && (
          <>
            <Text style={commonStyles.sectionTitle}>Foto</Text>
            <Image src={fotoBuffer} style={{ width: 240, marginTop: 4 }} />
          </>
        )}

        <PdfFooter realizo={realizoNombre.toUpperCase()} documentoLinea={documentoLinea} />
      </Page>
    </Document>
  );
}
