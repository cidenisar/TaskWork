import { Document, Page, Text, View, Image, StyleSheet, Svg, Line, Rect } from "@react-pdf/renderer";
import { BORDER, commonStyles, KeyValueRow, PdfHeader, PdfFooter, formatFechaArg } from "./common";
import {
  CATEGORIA_EQUIPO_LABEL,
  TABLERO_EVENTO_LABEL,
  itemMideCorriente,
  labelSubsistemas,
  type ResumenEquipamiento,
} from "@/components/tableros/types";
import { HALLAZGO_ESTADO_LABEL } from "@/lib/inspeccion-ia/types";
import type { UnifilarDrawing } from "@/lib/tableros/unifilar";
import type { EstadoChecklist, TableroCategoriaEquipo, TableroEventoTipo, TableroTipo, TableroTipoCircuito } from "@/lib/database.types";

/**
 * Reemplaza la planilla Excel manual de medición de consumo — misma cabecera
 * y pie que el resto de los PDF (spec sección 11), con un resumen de
 * equipamiento relevado y una tabla de circuitos/elementos. Un tablero puede
 * ser mixto (energía + CCTV + control de acceso conviviendo en el mismo
 * gabinete): la columna de corriente por fase F/R/S/T se muestra por fila
 * (solo térmicas/disyuntores en un circuito AC la tienen), no por tablero.
 */

/**
 * Por encima de esta altura (en puntos), @react-pdf/renderer queda colgado
 * procesando el bloque del esquema unifilar (Svg + muchos <Text> absolutos
 * apilados) en vez de tirar un error — confirmado reproduciendo el cuelgue
 * localmente con un tablero real de 42 circuitos en un solo cuerpo: con
 * 39 ítems (altura ~662pt) renderiza bien, con 40 (~678pt) el proceso queda
 * en un loop sin fin, sin excepción que capturar. No depende del largo del
 * texto ni de wrap/break — es la altura total del bloque. 500pt deja margen
 * contra el contenido variable que va antes (cabecera, resumen, fotos) y
 * sigue entrando cómodo en una sola página A4.
 */
const UNIFILAR_ALTO_MAX_PDF = 500;

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

export interface TableroPdfHallazgo {
  texto: string;
  estado: EstadoChecklist;
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
  fotosGeneralesBuffers: Buffer[] | null;
  unifilar: UnifilarDrawing | null;
  hallazgos: TableroPdfHallazgo[];
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
    fotosGeneralesBuffers,
    unifilar,
    hallazgos,
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

        {fotosGeneralesBuffers && fotosGeneralesBuffers.length > 0 && (
          <>
            <Text style={commonStyles.sectionTitle}>
              Foto{fotosGeneralesBuffers.length === 1 ? "" : "s"} General{fotosGeneralesBuffers.length === 1 ? "" : "es"} del Tablero
            </Text>
            <View style={commonStyles.photoGrid}>
              {fotosGeneralesBuffers.map((buf, i) => (
                <View style={commonStyles.photoCell} key={i} wrap={false}>
                  <Image src={buf} style={commonStyles.photo} />
                </View>
              ))}
            </View>
          </>
        )}

        {unifilar && unifilar.commands.length > 0 && (
          <>
            <Text style={commonStyles.sectionTitle}>Esquema Unifilar</Text>
            {unifilar.height > UNIFILAR_ALTO_MAX_PDF ? (
              <Text style={{ fontSize: 7, color: "#555", marginBottom: 4 }}>
                El tablero tiene demasiados circuitos/elementos para graficar el esquema automático en esta página — el dibujo completo
                queda disponible en el archivo DXF (botón &quot;Descargar DXF&quot; en el Historial). Ver el detalle completo en la tabla de
                circuitos más abajo.
              </Text>
            ) : (
              <>
                <Text style={{ fontSize: 7, color: "#555", marginBottom: 4 }}>
                  Esquema simplificado a partir de los circuitos relevados — no es un plano a escala. Calibre de cable según catálogo
                  configurado (verificar contra la norma vigente).
                </Text>
                <View style={{ position: "relative", width: unifilar.width, height: unifilar.height, marginBottom: 8 }} wrap={false}>
                  <Svg width={unifilar.width} height={unifilar.height}>
                    {unifilar.commands.map((cmd, i) => {
                      if (cmd.type === "line") {
                        return <Line key={i} x1={cmd.x1} y1={cmd.y1} x2={cmd.x2} y2={cmd.y2} stroke="#1a1a1a" strokeWidth={0.75} />;
                      }
                      if (cmd.type === "rect") {
                        return (
                          <Rect
                            key={i}
                            x={cmd.x}
                            y={cmd.y}
                            width={cmd.width}
                            height={cmd.height}
                            stroke="#1a1a1a"
                            strokeWidth={0.75}
                            fill="none"
                          />
                        );
                      }
                      return null;
                    })}
                  </Svg>
                  {unifilar.commands.map((cmd, i) =>
                    cmd.type === "text" ? (
                      <Text
                        key={`t${i}`}
                        style={{
                          position: "absolute",
                          left: cmd.x,
                          top: cmd.y - cmd.size,
                          fontSize: cmd.size,
                          fontFamily: cmd.bold ? "Helvetica-Bold" : "Helvetica",
                        }}
                      >
                        {cmd.text}
                      </Text>
                    ) : null,
                  )}
                </View>
              </>
            )}
          </>
        )}

        {hallazgos.length > 0 && (
          <>
            <Text style={commonStyles.sectionTitle}>Inspección IA</Text>
            <View style={styles.table}>
              <View style={styles.headRow} fixed>
                <Text style={[styles.th, { width: "40%" }]}>Ítem</Text>
                <Text style={[styles.th, { width: "15%" }]}>Estado</Text>
                <Text style={[styles.th, { width: "45%" }]}>Comentario</Text>
              </View>
              {hallazgos.map((h, i) => (
                <View style={i === hallazgos.length - 1 ? styles.rowLast : styles.row} key={i}>
                  <Text style={[styles.td, { width: "40%" }]}>{h.texto}</Text>
                  <Text
                    style={[
                      styles.td,
                      { width: "15%" },
                      h.estado === "no_ok" ? { fontFamily: "Helvetica-Bold" } : {},
                    ]}
                  >
                    {HALLAZGO_ESTADO_LABEL[h.estado]}
                  </Text>
                  <Text style={[styles.td, { width: "45%" }]}>{h.comentario || "—"}</Text>
                </View>
              ))}
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
              <View style={i === lecturas.length - 1 ? styles.rowLast : styles.row} key={i}>
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
