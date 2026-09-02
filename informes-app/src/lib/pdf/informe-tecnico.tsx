import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { commonStyles, KeyValueRow, PdfHeader, PdfFooter } from "./common";

/**
 * Replica el layout de "Informe Tecnico - Diseño PDF.pdf" (ver spec sección 11):
 * cabecera de 3 columnas repetida, título con línea de acento naranja, tabla de
 * datos clave azul marino / blanco, fotos de a 2 por fila, tareas pendientes en
 * viñetas, y pie con firmas + línea de documento — repetidos en cada página.
 */

const styles = StyleSheet.create({
  bulletRow: { flexDirection: "row", marginBottom: 3 },
  bulletDot: { width: 10, fontSize: 9 },
  bulletText: { flex: 1, fontSize: 9, lineHeight: 1.4 },
});

export interface InformePdfTecnico {
  nombre: string;
  torre: string | null;
  esSeguridad: boolean;
}

export interface InformePdfVehiculo {
  patente: string;
  marcaModelo: string | null;
}

export interface InformePdfImagen {
  buffer: Buffer;
  lat: number | null;
  lon: number | null;
  accuracyM: number | null;
}

export interface InformePdfProps {
  numeroGeneracion: string;
  titulo: string;
  fechaLabel: string;
  cliente: string;
  proyecto: string;
  ticketNumero: string | null;
  tipoInforme: string | null;
  permisoTrabajo: string | null;
  provincia: string | null;
  ubicacion: string | null;
  descripcionTrabajo: string | null;
  tareasPendientes: string[];
  tecnicos: InformePdfTecnico[];
  vehiculos: InformePdfVehiculo[];
  imagenes: InformePdfImagen[];
  logoBuffer: Buffer | null;
  appName: string;
  realizoNombre: string;
}

export function InformeTecnicoPdf(props: InformePdfProps) {
  const {
    numeroGeneracion,
    titulo,
    fechaLabel,
    cliente,
    proyecto,
    ticketNumero,
    tipoInforme,
    permisoTrabajo,
    provincia,
    ubicacion,
    descripcionTrabajo,
    tareasPendientes,
    tecnicos,
    vehiculos,
    imagenes,
    logoBuffer,
    appName,
    realizoNombre,
  } = props;

  // "Realizó" identifica a quien está logueado generando el informe (spec
  // sección 11), no a la lista de técnicos asignados en el Paso 2 — esa ya
  // figura completa en la tabla de datos clave de arriba.
  const realizo = realizoNombre.toUpperCase();
  const documentoLinea = `Documento: ${cliente || "—"}-Público · Generado por ${appName}`;
  const vehText = vehiculos.length
    ? vehiculos.map((v) => (v.marcaModelo ? `${v.patente} (${v.marcaModelo})` : v.patente)).join(", ")
    : "—";
  const seguridad = tecnicos.filter((t) => t.esSeguridad);

  return (
    <Document title={`${numeroGeneracion} — ${titulo}`}>
      <Page size="A4" style={commonStyles.page} wrap>
        <PdfHeader documentoLabel="INFORME TÉCNICO" titulo={titulo} fechaLabel={fechaLabel} numeroGeneracion={numeroGeneracion} logoBuffer={logoBuffer} />

        <Text style={commonStyles.mainTitle}>
          {titulo} — {proyecto}
        </Text>

        <View style={commonStyles.kvTable}>
          <KeyValueRow k="N° de Generación:" v={numeroGeneracion} />
          <KeyValueRow k="Cliente:" v={cliente} />
          <KeyValueRow k="Proyecto:" v={proyecto} />
          <KeyValueRow k="Fecha de Ejecución:" v={fechaLabel} />
          <KeyValueRow k="Ticket / N° Incidente:" v={ticketNumero || "—"} />
          <KeyValueRow k="Tipo de Informe:" v={tipoInforme || "—"} />
          {permisoTrabajo ? <KeyValueRow k="Permiso de Trabajo:" v={permisoTrabajo} /> : null}
          <KeyValueRow k="Provincia:" v={provincia || "—"} />
          <KeyValueRow k="Ubicación:" v={ubicacion || "—"} />
          <KeyValueRow
            k="Personal Afectado (Técnico — Torre):"
            v={tecnicos.length ? tecnicos.map((t) => `${t.nombre} — ${t.torre || "sin torre"}`).join("\n") : "—"}
          />
          <KeyValueRow
            k="Técnico Higiene y Seguridad:"
            v={seguridad.length ? `Sí — ${seguridad.map((t) => t.nombre).join(", ")}` : "No"}
          />
          <KeyValueRow k="Vehículo(s) Utilizado(s):" v={vehText} />
          <KeyValueRow k="Cantidad de Técnicos:" v={String(tecnicos.length)} last />
        </View>

        {descripcionTrabajo ? <Text style={commonStyles.paragraph}>{descripcionTrabajo}</Text> : null}

        {imagenes.length > 0 && (
          <View style={commonStyles.photoGrid}>
            {imagenes.map((img, i) => (
              <View style={commonStyles.photoCell} key={i} wrap={false}>
                <Image src={img.buffer} style={commonStyles.photo} />
                <Text style={commonStyles.photoCaption}>
                  Foto {i + 1}
                  {img.lat != null && img.lon != null
                    ? ` · ${img.lat.toFixed(5)}, ${img.lon.toFixed(5)}${img.accuracyM != null ? ` (±${Math.round(img.accuracyM)}m)` : ""}`
                    : " · Ubicación no disponible"}
                </Text>
              </View>
            ))}
          </View>
        )}

        {tareasPendientes.length > 0 && (
          <>
            <Text style={commonStyles.sectionTitle}>Tareas Pendientes</Text>
            {tareasPendientes.map((t, i) => (
              <View style={styles.bulletRow} key={i}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{t}</Text>
              </View>
            ))}
          </>
        )}

        {permisoTrabajo && (
          <>
            <Text style={commonStyles.sectionTitle}>Documentación de la Tarea</Text>
            <Text style={commonStyles.paragraph}>Permiso de Trabajo: {permisoTrabajo}</Text>
          </>
        )}

        <PdfFooter realizo={realizo} documentoLinea={documentoLinea} />
      </Page>
    </Document>
  );
}
