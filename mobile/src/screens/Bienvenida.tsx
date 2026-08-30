// Pantalla de entrada del registro (ver backend-server/README.md,
// "Autoregistro de personas (Mobile)") — elegir entre los flujos
// disponibles. "Soy nuevo/no estoy en el padrón" (autoregistro) queda
// deliberadamente afuera todavía, ver lib/registro.ts para el porqué.
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RegistroStackParamList } from "../navigation/RootNavigator";
import { Pantalla, Titulo, Parrafo, BotonPrimario, BotonSecundario } from "../components/ui";

type Props = NativeStackScreenProps<RegistroStackParamList, "Bienvenida">;

export function Bienvenida({ navigation }: Props) {
  return (
    <Pantalla>
      <Titulo>Bienvenido/a</Titulo>
      <Parrafo>
        Esta app te avisa si hay una emergencia en tu sitio de trabajo y te deja confirmar que estás bien. Para empezar, decinos quién sos.
      </Parrafo>
      <BotonPrimario onPress={() => navigation.navigate("Reclamar")}>Ya estoy en el padrón (personal fijo)</BotonPrimario>
      <BotonSecundario onPress={() => navigation.navigate("Codigo")}>Tengo un código de acceso (eventual/contratista)</BotonSecundario>
    </Pantalla>
  );
}
