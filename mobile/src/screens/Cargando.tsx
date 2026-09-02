import { ActivityIndicator, View, StyleSheet } from "react-native";
import { colors } from "../theme";
import { Parrafo, TextoError } from "../components/ui";

export function Cargando({ error }: { error: string | null }) {
  return (
    <View style={s.wrap}>
      {error ? (
        <>
          <TextoError>{error}</TextoError>
          <Parrafo>Revisá tu conexión y volvé a abrir la app.</Parrafo>
        </>
      ) : (
        <ActivityIndicator color={colors.accent} size="large" />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
});
