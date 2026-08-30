// Segundo paso de Autoregistro — POST /personas/autoregistro (ver
// backend-server/README.md, "Autoregistro de personas (Mobile)"). Sitio
// resuelto en el paso anterior (CodigoOrganizacion), no vuelve a leer
// nada contra Supabase acá. Queda `pendiente_aprobacion`: un admin la
// tiene que aprobar desde Frontend Web antes de que reciba alertas.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RegistroStackParamList } from "../navigation/RootNavigator";
import { useAuth } from "../lib/auth";
import { autoregistrar } from "../lib/registro";
import { Pantalla, Titulo, Parrafo, Campo, BotonPrimario, TextoError } from "../components/ui";
import { colors, radius } from "../theme";

type Props = NativeStackScreenProps<RegistroStackParamList, "Autoregistro">;

export function Autoregistro({ route }: Props) {
  const { organizacionNombre, sitios } = route.params;
  const { refrescarPersona } = useAuth();

  const [sitioId, setSitioId] = useState<string | null>(sitios.length === 1 ? sitios[0].id : null);
  const [nombre, setNombre] = useState("");
  const [dni, setDni] = useState("");
  const [legajo, setLegajo] = useState("");
  const [telefono, setTelefono] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    if (!sitioId) {
      setError("Elegí tu sitio de trabajo.");
      return;
    }
    if (!nombre.trim() || !dni.trim() || !telefono.trim()) {
      setError("Completá nombre, DNI y teléfono.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const res = await autoregistrar(nombre.trim(), dni.trim(), legajo.trim() || null, telefono.trim(), sitioId);
      if (!res.ok) {
        setError(res.error ?? "Error inesperado.");
        return;
      }
      await refrescarPersona(); // pasa a EstadoCuenta("pendiente_aprobacion") sola, ver RootNavigator
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Pantalla>
      <Titulo>Alta de personal nuevo</Titulo>
      <Parrafo>
        {organizacionNombre ? `${organizacionNombre} — ` : ""}
        un administrador va a revisar tu alta antes de que empieces a recibir alertas.
      </Parrafo>

      {sitios.length === 0 && <Parrafo>Esta organización todavía no tiene ningún sitio cargado — avisale a un administrador.</Parrafo>}

      {sitios.length > 1 && (
        <View style={s.sitios}>
          <Text style={s.label}>Tu sitio de trabajo</Text>
          {sitios.map((s2) => (
            <Pressable key={s2.id} style={[s.sitio, sitioId === s2.id && s.sitioElegido]} onPress={() => setSitioId(s2.id)}>
              <Text style={[s.sitioNombre, sitioId === s2.id && s.sitioNombreElegido]}>{s2.nombre}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Campo label="Nombre y apellido" value={nombre} onChangeText={setNombre} placeholder="ej. Juan Pérez" />
      <Campo label="DNI" value={dni} onChangeText={setDni} keyboardType="number-pad" placeholder="ej. 30123456" />
      <Campo label="Legajo (si ya lo tenés)" value={legajo} onChangeText={setLegajo} placeholder="ej. 4521" />
      <Campo label="Teléfono" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" placeholder="ej. +54 9 291 400-0000" />
      <TextoError>{error}</TextoError>
      <BotonPrimario onPress={() => void enviar()} cargando={enviando}>
        Pedir alta
      </BotonPrimario>
    </Pantalla>
  );
}

const s = StyleSheet.create({
  sitios: { gap: 8 },
  label: { color: colors.textDim, fontSize: 13, fontWeight: "600" },
  sitio: { backgroundColor: colors.surface2, borderColor: colors.borderStrong, borderWidth: 1, borderRadius: radius, padding: 12 },
  sitioElegido: { borderColor: colors.accent, backgroundColor: colors.surface },
  sitioNombre: { color: colors.text, fontWeight: "600", fontSize: 14 },
  sitioNombreElegido: { color: colors.accent },
});
