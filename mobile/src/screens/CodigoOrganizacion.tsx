// Primer paso de Autoregistro — ver backend-server/README.md,
// "Autoregistro: código de organización". El código lo comparte un
// admin de la organización (cartelera, onboarding); resolverlo acá es
// lo que le permite a esta sesión (todavía sin ninguna persona
// vinculada) saber qué organización/sitios ofrecer en el paso
// siguiente.
import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RegistroStackParamList } from "../navigation/RootNavigator";
import { resolverCodigoOrganizacion } from "../lib/registro";
import { Pantalla, Titulo, Parrafo, Campo, BotonPrimario, TextoError } from "../components/ui";

type Props = NativeStackScreenProps<RegistroStackParamList, "CodigoOrganizacion">;

export function CodigoOrganizacion({ navigation }: Props) {
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continuar() {
    if (!codigo.trim()) {
      setError("Ingresá el código de tu empresa.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const res = await resolverCodigoOrganizacion(codigo.trim());
      if (!res.ok || !res.sitios) {
        setError(res.error ?? "Error inesperado.");
        return;
      }
      navigation.navigate("Autoregistro", { organizacionNombre: res.organizacionNombre ?? "", sitios: res.sitios });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Pantalla>
      <Titulo>Código de tu empresa</Titulo>
      <Parrafo>
        Pedile a tu supervisor o al administrador del sitio el código de registro de tu empresa — suele estar en la cartelera o en el
        onboarding.
      </Parrafo>
      <Campo label="Código de empresa" value={codigo} onChangeText={setCodigo} autoCapitalize="characters" placeholder="ej. REFIMODELO" />
      <TextoError>{error}</TextoError>
      <BotonPrimario onPress={() => void continuar()} cargando={enviando}>
        Continuar
      </BotonPrimario>
    </Pantalla>
  );
}
