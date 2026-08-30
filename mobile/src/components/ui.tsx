// Primitivas compartidas — mismo espíritu que las clases reusables de
// frontend-web/src/styles/tokens.css (.btn-primary, .dfield, etc.),
// portadas a componentes de React Native ya que acá no hay CSS.
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import type { ReactNode } from "react";
import { colors, radius } from "../theme";

export function Pantalla({ children }: { children: ReactNode }) {
  return <View style={s.pantalla}>{children}</View>;
}

export function Titulo({ children }: { children: ReactNode }) {
  return <Text style={s.titulo}>{children}</Text>;
}

export function Parrafo({ children }: { children: ReactNode }) {
  return <Text style={s.parrafo}>{children}</Text>;
}

export function BotonPrimario({
  children,
  onPress,
  disabled,
  cargando,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  cargando?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || cargando}
      style={({ pressed }) => [s.btnPrimario, (disabled || cargando) && s.btnDisabled, pressed && !disabled && !cargando && s.btnPressed]}
    >
      {cargando ? <ActivityIndicator color={colors.accentInk} /> : <Text style={s.btnPrimarioTexto}>{children}</Text>}
    </Pressable>
  );
}

export function BotonSecundario({ children, onPress, disabled }: { children: ReactNode; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.btnSecundario, pressed && s.btnPressed]}>
      <Text style={s.btnSecundarioTexto}>{children}</Text>
    </Pressable>
  );
}

export function Campo({ label, hint, ...props }: { label: string; hint?: string } & TextInputProps) {
  return (
    <View style={s.campo}>
      <Text style={s.campoLabel}>{label}</Text>
      <TextInput placeholderTextColor={colors.textFaint} style={s.campoInput} {...props} />
      {hint && <Text style={s.campoHint}>{hint}</Text>}
    </View>
  );
}

export function Tarjeta({ children }: { children: ReactNode }) {
  return <View style={s.tarjeta}>{children}</View>;
}

export function TextoError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Text style={s.error}>{children}</Text>;
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.bg, padding: 20, gap: 16 },
  titulo: { color: colors.text, fontSize: 22, fontWeight: "700" },
  parrafo: { color: colors.textDim, fontSize: 14, lineHeight: 21 },
  btnPrimario: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimarioTexto: { color: colors.accentInk, fontWeight: "700", fontSize: 15 },
  btnSecundario: {
    backgroundColor: colors.surface2,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  btnSecundarioTexto: { color: colors.text, fontWeight: "600", fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
  btnPressed: { opacity: 0.85 },
  campo: { gap: 6 },
  campoLabel: { color: colors.textDim, fontSize: 13, fontWeight: "600" },
  campoInput: {
    backgroundColor: colors.surface2,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  campoHint: { color: colors.textFaint, fontSize: 12 },
  tarjeta: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius, padding: 16, gap: 10 },
  error: { color: colors.help, fontSize: 13 },
});
