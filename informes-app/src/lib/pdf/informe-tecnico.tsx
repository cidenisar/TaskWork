import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

/**
 * Replica el layout de "Informe Tecnico - Diseño PDF.pdf" (ver spec sección 11):
 * cabecera de 3 columnas repetida, título con línea de acento naranja, tabla de
 * datos clave azul marino / blanco, fotos de a 2 por fila, tareas pendientes en
 * viñetas, y pie con firmas + línea de documento — repetidos en cada página.
 */

const NAVY = "#1F3864";
const ORANGE = "#C6551A";
const BORDER = "#9AA0A8";

const styles = StyleSheet.create({
  page: { padding: "28 32 70", fontSize: 9, fontFamily: "Helvetica", color: "#1a1a1a" },
  headerTable: {
    flexDirection: "row",
    border: `1pt solid ${BORDER}`,
    marginBottom: 14,
  },
  headerLogoCell: {
    width: 90,
    borderRight: `1pt solid ${BORDER}`,
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
  },
  headerLogoText: { fontSize: 7, color: "#888", textAlign: "center" },
  headerLogoImg: { maxWidth: 74, maxHeight: 44, objectFit: "contain" },
  headerMidCell: {
    flex: 1,
    borderRight: `1pt solid ${BORDER}`,
    padding: 6,
    justifyContent: "center",
  },
  headerMidTop: { fontSize: 8, color: "#555", textAlign: "center", marginBottom: 3 },
  headerMidTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "center" },
  headerRightCell: { width: 130, padding: 6, justifyContent: "center" },
  headerRightRow: { fontSize: 8, marginBottom: 4 },
  headerRightLabel: { fontFamily: "Helvetica-Bold" },

  mainTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    borderBottom: `2pt solid ${ORANGE}`,
    paddingBottom: 6,
    marginBottom: 12,
  },

  kvTable: { border: `1pt solid ${BORDER}`, marginBottom: 14 },
  kvRow: { flexDirection: "row", borderBottom: `1pt solid ${BORDER}` },
  kvRowLast: { flexDirection: "row" },
  kvKey: { width: "30%", backgroundColor: NAVY, color: "#fff", fontFamily: "Helvetica-Bold", fontSize: 8.5, padding: 5 },
  kvVal: { flex: 1, fontSize: 8.5, padding: 5, color: "#1a1a1a" },

  sectionTitle: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: ORANGE,
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 6,
  },
  paragraph: { fontSize: 9, lineHeight: 1.5, marginBottom: 6 },

  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4, marginBottom: 6 },
  photoCell: { width: "47%" },
  photo: { width: "100%", height: 150, objectFit: "cover", border: `1pt solid ${BORDER}` },
  photoCaption: { fontSize: 7.5, color: "#666", marginTop: 2 },

  bulletRow: { flexDirection: "row", marginBottom: 3 },
  bulletDot: { width: 10, fontSize: 9 },
  bulletText: { flex: 1, fontSize: 9, lineHeight: 1.4 },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 32,
    right: 32,
  },
  footerTable: { flexDirection: "row", border: `1pt solid ${BORDER}`, marginBottom: 5 },
  footerCell: { flex: 1, padding: 5, borderRight: `1pt solid ${BORDER}` },
  footerCellLast: { flex: 1, padding: 5 },
  footerLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold", marginBottom: 10 },
  footerLine: { fontSize: 7, color: "#666", textAlign: "right" },
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
}

function KeyValueRow({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <View style={last ? styles.kvRowLast : styles.kvRow}>
      <Text style={styles.kvKey}>{k}</Text>
      <Text style={styles.kvVal}>{v}</Text>
    </View>
  );
}

function Footer({ realizo, documentoLinea }: { realizo: string; documentoLinea: string }) {
  return (
    <View style={styles.footer} fixed>
      <View style={styles.footerTable}>
        <View style={styles.footerCell}>
          <Text style={styles.footerLabel}>Realizó: {realizo}</Text>
        </View>
        <View style={styles.footerCell}>
          <Text style={styles.footerLabel}>Revisó:</Text>
        </View>
        <View style={styles.footerCellLast}>
          <Text style={styles.footerLabel}>Aprobó:</Text>
        </View>
      </View>
      <Text style={styles.footerLine}>{documentoLinea}</Text>
    </View>
  );
}

function Header({
  titulo,
  fechaLabel,
  numeroGeneracion,
  logoBuffer,
}: {
  titulo: string;
  fechaLabel: string;
  numeroGeneracion: string;
  logoBuffer: Buffer | null;
}) {
  return (
    <View style={styles.headerTable} fixed>
      <View style={styles.headerLogoCell}>
        {logoBuffer ? (
          <Image src={logoBuffer} style={styles.headerLogoImg} />
        ) : (
          <Text style={styles.headerLogoText}>LOGO{"\n"}EMPRESA</Text>
        )}
      </View>
      <View style={styles.headerMidCell}>
        <Text style={styles.headerMidTop}>INFORME TÉCNICO</Text>
        <Text style={styles.headerMidTitle}>{titulo.toUpperCase()}</Text>
      </View>
      <View style={styles.headerRightCell}>
        <Text style={styles.headerRightRow}>
          <Text style={styles.headerRightLabel}>Fecha: </Text>
          {fechaLabel}
        </Text>
        <Text style={styles.headerRightRow}>
          <Text style={styles.headerRightLabel}>N° Gen.: </Text>
          {numeroGeneracion}
        </Text>
      </View>
    </View>
  );
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
  } = props;

  const realizo = tecnicos.length
    ? tecnicos.map((t) => (t.nombre.split(" ")[0] || t.nombre).toUpperCase()).join(", ")
    : "—";
  const documentoLinea = `Documento: ${cliente || "—"}-Público · Generado por ${appName}`;
  const vehText = vehiculos.length
    ? vehiculos.map((v) => (v.marcaModelo ? `${v.patente} (${v.marcaModelo})` : v.patente)).join(", ")
    : "—";
  const seguridad = tecnicos.filter((t) => t.esSeguridad);

  return (
    <Document title={`${numeroGeneracion} — ${titulo}`}>
      <Page size="A4" style={styles.page} wrap>
        <Header titulo={titulo} fechaLabel={fechaLabel} numeroGeneracion={numeroGeneracion} logoBuffer={logoBuffer} />

        <Text style={styles.mainTitle}>
          {titulo} — {proyecto}
        </Text>

        <View style={styles.kvTable}>
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

        {descripcionTrabajo ? <Text style={styles.paragraph}>{descripcionTrabajo}</Text> : null}

        {imagenes.length > 0 && (
          <View style={styles.photoGrid}>
            {imagenes.map((img, i) => (
              <View style={styles.photoCell} key={i} wrap={false}>
                <Image src={img.buffer} style={styles.photo} />
                <Text style={styles.photoCaption}>
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
            <Text style={styles.sectionTitle}>Tareas Pendientes</Text>
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
            <Text style={styles.sectionTitle}>Documentación de la Tarea</Text>
            <Text style={styles.paragraph}>Permiso de Trabajo: {permisoTrabajo}</Text>
          </>
        )}

        <Footer realizo={realizo} documentoLinea={documentoLinea} />
      </Page>
    </Document>
  );
}
