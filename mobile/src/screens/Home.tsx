import { useEffect, useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { PrincipalStackParamList } from "../navigation/RootNavigator";
import { useAuth } from "../lib/auth";
import { pedirPermisoYObtenerToken } from "../lib/push";
import { actualizarPushToken } from "../lib/registro";
import { Pantalla, Titulo, Parrafo, Tarjeta, BotonPrimario, BotonSecundario, TextoError } from "../components/ui";
import { colors } from "../theme";
import { StyleSheet, Text, View } from "react-native";

type Props = NativeStackScreenProps<PrincipalStackParamList, "Home">;

type EstadoPush = "sin_pedir" | "pidiendo" | "ok" | "error";

export function Home({ navigation }: Props) {
  const { persona, refrescarPersona } = useAuth();
  const [estadoPush, setEstadoPush] = useState<EstadoPush>("sin_pedir");
  const [errorPush, setErrorPush] = useState<string | null>(null);

  // Ya tiene un push_token guardado (de una sesión anterior) → no hace
  // falta volver a pedir permiso cada vez que se abre la app.
  useEffect(() => {
    if (persona?.pushToken) setEstadoPush("ok");
  }, [persona?.pushToken]);

  async function habilitarPush() {
    setEstadoPush("pidiendo");
    setErrorPush(null);
    const permiso = await pedirPermisoYObtenerToken();
    if (!permiso.ok || !permiso.token) {
      setEstadoPush("error");
      setErrorPush(permiso.motivo ?? "No se pudo habilitar.");
      return;
    }
    const res = await actualizarPushToken(permiso.token);
    if (!res.ok) {
      setEstadoPush("error");
      setErrorPush(res.error ?? "No se pudo guardar el token.");
      return;
    }
    setEstadoPush("ok");
    await refrescarPersona();
  }

  if (!persona) return null;

  return (
    <Pantalla>
      <Titulo>Hola, {persona.nombre}</Titulo>
      <Parrafo>Tu cuenta está activa. Si hay una emergencia en tu sitio, te va a llegar una alerta acá.</Parrafo>

      <Tarjeta>
        <View style={s.fila}>
          <Text style={s.label}>Notificaciones push</Text>
          {estadoPush === "ok" ? <View style={[s.pill, s.pillOk]}><Text style={s.pillTextoOk}>Habilitadas</Text></View> : null}
        </View>
        {estadoPush !== "ok" && (
          <>
            <Parrafo>
              Sin esto habilitado, no vas a recibir la alerta si la app está cerrada — igual podés revisar "Mis alertas" manualmente.
            </Parrafo>
            <TextoError>{errorPush}</TextoError>
            <BotonSecundario onPress={() => void habilitarPush()} disabled={estadoPush === "pidiendo"}>
              {estadoPush === "pidiendo" ? "Pidiendo permiso…" : "Habilitar notificaciones"}
            </BotonSecundario>
          </>
        )}
      </Tarjeta>

      <BotonPrimario onPress={() => navigation.navigate("Alertas")}>Mis alertas</BotonPrimario>
    </Pantalla>
  );
}

const s = StyleSheet.create({
  fila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { color: colors.text, fontWeight: "700", fontSize: 15 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillOk: { backgroundColor: colors.okBg },
  pillTextoOk: { color: colors.ok, fontSize: 12, fontWeight: "700" },
});
