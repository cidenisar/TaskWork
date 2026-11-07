import { Document, Page, Text, View } from "@react-pdf/renderer";
import { commonStyles, KeyValueRow, PdfHeader, PdfFooter, formatFechaArg, GREEN, RED } from "./common";
import { CRITERIOS_RIESGO_VIAJE, type CriterioKey } from "@/lib/riesgo-viaje/criterios";
import type { NivelRiesgoViaje } from "@/lib/database.types";

/** Mismo documento que se completa antes de un viaje (Anexo IV) — misma estructura de 8 criterios + total + semáforo. */

const NIVEL_COLOR: Record<NivelRiesgoViaje, string> = { bajo: GREEN, medio: "#8A6D1A", alto: RED };

export interface RiesgoViajePdfProps {
  numeroGeneracion: string;
  conductorNombre: string;
  acompanantes: string[];
  vehiculoPatente: string;
  vehiculoMarcaModelo: string | null;
  empresa: string;
  fechaHora: string;
  origen: string;
  destino: string;
  puntoMedio: string | null;
  criterios: Record<CriterioKey, number>;
  total: number;
  nivel: NivelRiesgoViaje;
  mensaje: string;
  logoBuffer: Buffer | null;
  appName: string;
  realizoNombre: string;
}

function textoOpcionElegida(key: CriterioKey, valor: number): string {
  const opcion = CRITERIOS_RIESGO_VIAJE[key].opciones.find((o) => o.valor === valor);
  return opcion ? `${opcion.texto} (${opcion.valor})` : String(valor);
}

export function RiesgoViajePdf(props: RiesgoViajePdfProps) {
  const {
    numeroGeneracion,
    conductorNombre,
    acompanantes,
    vehiculoPatente,
    vehiculoMarcaModelo,
    empresa,
    fechaHora,
    origen,
    destino,
    puntoMedio,
    criterios,
    total,
    nivel,
    mensaje,
    logoBuffer,
    appName,
    realizoNombre,
  } = props;
  const fecha = new Date(fechaHora);
  const fechaLabel = `${formatFechaArg(fechaHora.slice(0, 10))} ${fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;
  const documentoLinea = `Documento: ${origen}-${destino}-Público · Generado por ${appName}`;

  return (
    <Document title={`${numeroGeneracion} — Evaluación de Riesgo del Viaje`}>
      <Page size="A4" style={commonStyles.page} wrap>
        <PdfHeader
          documentoLabel="EVALUACIÓN RIESGO DEL VIAJE"
          titulo={`${origen} → ${destino}`}
          fechaLabel={fechaLabel}
          numeroGeneracion={numeroGeneracion}
          logoBuffer={logoBuffer}
        />

        <Text style={commonStyles.mainTitle}>Evaluación Riesgo del Viaje</Text>

        <View style={commonStyles.kvTable}>
          <KeyValueRow k="Conductor:" v={conductorNombre} />
          {acompanantes.length > 0 && <KeyValueRow k="Acompañantes:" v={acompanantes.join(", ")} />}
          <KeyValueRow k="Vehículo:" v={vehiculoMarcaModelo ? `${vehiculoPatente} — ${vehiculoMarcaModelo}` : vehiculoPatente} />
          <KeyValueRow k="Empresa:" v={empresa} />
          <KeyValueRow k="Origen:" v={origen} />
          <KeyValueRow k="Destino:" v={destino} />
          {puntoMedio && <KeyValueRow k="Punto medio:" v={puntoMedio} />}
          <KeyValueRow k="Fecha y hora:" v={fechaLabel} last />
        </View>

        <Text style={commonStyles.sectionTitle}>Criterios de evaluación</Text>
        <View style={commonStyles.kvTable}>
          {(Object.keys(CRITERIOS_RIESGO_VIAJE) as CriterioKey[]).map((key, i, arr) => (
            <KeyValueRow
              key={key}
              k={`${CRITERIOS_RIESGO_VIAJE[key].label}:`}
              v={textoOpcionElegida(key, criterios[key])}
              last={i === arr.length - 1}
            />
          ))}
        </View>

        <View style={{ border: `1.5pt solid ${NIVEL_COLOR[nivel]}`, borderRadius: 3, padding: 10, marginBottom: 10 }}>
          <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: NIVEL_COLOR[nivel] }}>
            Total: {total} — {mensaje}
          </Text>
        </View>

        <PdfFooter realizo={realizoNombre.toUpperCase()} documentoLinea={documentoLinea} />
      </Page>
    </Document>
  );
}
