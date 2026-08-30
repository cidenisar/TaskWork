// "Ya estoy en el padrón" — POST /personas/reclamar (ver
// backend-server/README.md). 404 = no lo encontramos: como todavía no
// existe la pantalla de autoregistro (ver lib/registro.ts), se lo
// deriva al flujo de código en vez de dejarlo sin salida.
import { useState } from "react";
import { useAuth } from "../lib/auth";
import { reclamarPersona } from "../lib/registro";
import { Pantalla, Titulo, Parrafo, Campo, BotonPrimario, TextoError } from "../components/ui";

// Sin props de navegación: al vincularse, refrescarPersona() hace que
// RootNavigator cambie de stack solo (ver el switch por estado ahí) —
// no hace falta navigation.navigate a ningún lado.
export function Reclamar() {
  const { refrescarPersona } = useAuth();
  const [legajo, setLegajo] = useState("");
  const [dni, setDni] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    if (!legajo.trim() || !dni.trim()) {
      setError("Completá legajo y DNI.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const res = await reclamarPersona(legajo.trim(), dni.trim());
      if (res.ok) {
        await refrescarPersona();
        return;
      }
      if (res.status === 404) {
        setError("No te encontramos en el padrón con ese legajo y DNI. Si sos personal eventual o contratista, pedile un código de acceso a tu supervisor.");
      } else if (res.status === 409) {
        setError("Ese registro ya fue vinculado desde otro dispositivo. Si te parece un error, avisale a un administrador.");
      } else {
        setError(res.error ?? "Error inesperado.");
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Pantalla>
      <Titulo>Ya estoy en el padrón</Titulo>
      <Parrafo>Ingresá tu legajo y DNI tal como están cargados en el sistema.</Parrafo>
      <Campo label="Legajo" value={legajo} onChangeText={setLegajo} autoCapitalize="characters" placeholder="ej. 4521" />
      <Campo label="DNI" value={dni} onChangeText={setDni} keyboardType="number-pad" placeholder="ej. 30123456" />
      <TextoError>{error}</TextoError>
      <BotonPrimario onPress={() => void enviar()} cargando={enviando}>
        Continuar
      </BotonPrimario>
    </Pantalla>
  );
}
