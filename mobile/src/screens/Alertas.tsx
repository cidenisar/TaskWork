import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { PrincipalStackParamList } from "../navigation/RootNavigator";
import { listarAlertasPropias, type AlertaPropia } from "../lib/alertas";
import { Pantalla, Parrafo, TextoError } from "../components/ui";
import { colors, radius } from "../theme";

type Props = NativeStackScreenProps<PrincipalStackParamList, "Alertas">;

const ESTADO_COPY: Record<AlertaPropia["estadoConfirmacion"], { texto: string; color: string; bg: string }> = {
  pendiente: { texto: "Pendiente de confirmar", color: colors.pending, bg: colors.pendingBg },
  ok: { texto: "Confirmaste: estoy bien", color: colors.ok, bg: colors.okBg },
  ayuda: { texto: "Pediste ayuda", color: colors.help, bg: colors.helpBg },
};

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function Alertas({ navigation }: Props) {
  const [alertas, setAlertas] = useState<AlertaPropia[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    setError(null);
    listarAlertasPropias()
      .then(setAlertas)
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar tus alertas."));
  }, []);

  // Recarga cada vez que se vuelve a esta pantalla (ej. después de
  // confirmar) — no solo al montar.
  useFocusEffect(cargar);

  if (error) {
    return (
      <Pantalla>
        <TextoError>{error}</TextoError>
      </Pantalla>
    );
  }

  if (alertas === null) {
    return (
      <Pantalla>
        <ActivityIndicator color={colors.accent} />
      </Pantalla>
    );
  }

  if (alertas.length === 0) {
    return (
      <Pantalla>
        <Parrafo>Todavía no recibiste ninguna alerta.</Parrafo>
      </Pantalla>
    );
  }

  return (
    <View style={s.wrap}>
      <FlatList
        data={alertas}
        keyExtractor={(a) => a.confirmacionId}
        contentContainerStyle={s.lista}
        renderItem={({ item }) => {
          const copy = ESTADO_COPY[item.estadoConfirmacion];
          const puedeConfirmar = item.estadoConfirmacion === "pendiente" && item.eventoEstado === "en_curso";
          return (
            <Pressable
              style={s.fila}
              disabled={!puedeConfirmar}
              onPress={() => navigation.navigate("ConfirmarAlerta", { alerta: item })}
            >
              <View style={s.filaTop}>
                <Text style={s.tipo}>
                  {item.tipoNombre}
                  {item.modo === "simulacro" ? " (simulacro)" : ""}
                </Text>
                <View style={[s.pill, { backgroundColor: copy.bg }]}>
                  <Text style={[s.pillTexto, { color: copy.color }]}>{copy.texto}</Text>
                </View>
              </View>
              <Text style={s.fecha}>{formatearFecha(item.iniciadoAt)}</Text>
              {puedeConfirmar && <Text style={s.cta}>Tocá para confirmar tu estado →</Text>}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  lista: { padding: 16, gap: 10 },
  fila: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius, padding: 14, gap: 6 },
  filaTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  tipo: { color: colors.text, fontWeight: "700", fontSize: 15, flexShrink: 1 },
  fecha: { color: colors.textFaint, fontSize: 12 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillTexto: { fontSize: 11, fontWeight: "700" },
  cta: { color: colors.accent, fontSize: 13, fontWeight: "600", marginTop: 2 },
});
