import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { PrincipalStackParamList } from "../navigation/RootNavigator";
import { listarPuntosHabilitadosDeEvento, confirmar, type PuntoHabilitado } from "../lib/alertas";
import { Pantalla, Titulo, Parrafo, Campo, BotonPrimario, BotonSecundario, TextoError } from "../components/ui";
import { colors, radius } from "../theme";

type Props = NativeStackScreenProps<PrincipalStackParamList, "ConfirmarAlerta">;

export function ConfirmarAlerta({ route, navigation }: Props) {
  const { alerta } = route.params;
  const [puntos, setPuntos] = useState<PuntoHabilitado[] | null>(null);
  const [puntoId, setPuntoId] = useState<string | null>(null);
  const [pidiendoAyuda, setPidiendoAyuda] = useState(false);
  const [notaAyuda, setNotaAyuda] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listarPuntosHabilitadosDeEvento(alerta.eventoId)
      .then(setPuntos)
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar los puntos de encuentro."));
  }, [alerta.eventoId]);

  async function enviar(estado: "ok" | "ayuda") {
    setError(null);
    setEnviando(true);
    try {
      const res = await confirmar(alerta.eventoId, estado, estado === "ok" ? puntoId : null, estado === "ayuda" ? notaAyuda.trim() || null : null);
      if (!res.ok) {
        setError(res.error ?? "Error inesperado.");
        return;
      }
      navigation.goBack();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Pantalla>
      <Titulo>{alerta.tipoNombre}</Titulo>
      <Parrafo>¿Cómo estás? Elegí una opción — si estás bien, decinos a qué punto de encuentro vas.</Parrafo>

      {!pidiendoAyuda && (
        <>
          {puntos === null ? (
            <ActivityIndicator color={colors.accent} />
          ) : puntos.length === 0 ? (
            <Parrafo>No hay puntos de encuentro habilitados para este evento — confirmá igual, sin elegir uno.</Parrafo>
          ) : (
            <View style={s.puntos}>
              {puntos.map((p) => (
                <Pressable key={p.id} style={[s.punto, puntoId === p.id && s.puntoElegido]} onPress={() => setPuntoId(p.id)}>
                  <Text style={[s.puntoNombre, puntoId === p.id && s.puntoNombreElegido]}>{p.nombre}</Text>
                  {p.descripcion && <Text style={s.puntoDesc}>{p.descripcion}</Text>}
                </Pressable>
              ))}
            </View>
          )}
          <TextoError>{error}</TextoError>
          <BotonPrimario onPress={() => void enviar("ok")} cargando={enviando}>
            Estoy bien
          </BotonPrimario>
          <BotonSecundario onPress={() => setPidiendoAyuda(true)} disabled={enviando}>
            Necesito ayuda
          </BotonSecundario>
        </>
      )}

      {pidiendoAyuda && (
        <>
          <Campo
            label="Contanos qué pasa (opcional)"
            value={notaAyuda}
            onChangeText={setNotaAyuda}
            placeholder="ej. Estoy atrapado en el sector norte"
            multiline
          />
          <TextoError>{error}</TextoError>
          <BotonPrimario onPress={() => void enviar("ayuda")} cargando={enviando}>
            Pedir ayuda
          </BotonPrimario>
          <BotonSecundario onPress={() => setPidiendoAyuda(false)} disabled={enviando}>
            Volver
          </BotonSecundario>
        </>
      )}
    </Pantalla>
  );
}

const s = StyleSheet.create({
  puntos: { gap: 8 },
  punto: { backgroundColor: colors.surface2, borderColor: colors.borderStrong, borderWidth: 1, borderRadius: radius, padding: 12 },
  puntoElegido: { borderColor: colors.accent, backgroundColor: colors.surface },
  puntoNombre: { color: colors.text, fontWeight: "600", fontSize: 14 },
  puntoNombreElegido: { color: colors.accent },
  puntoDesc: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
});
