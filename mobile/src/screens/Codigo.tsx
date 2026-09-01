// "Tengo un código de acceso" — POST /personas/canjear-codigo (ver
// backend-server/README.md). Activa al instante, sin aprobación — el
// código pre-generado por un admin YA es la autorización.
import { useState } from "react";
import { useAuth } from "../lib/auth";
import { canjearCodigo } from "../lib/registro";
import { Pantalla, Titulo, Parrafo, Campo, BotonPrimario, TextoError } from "../components/ui";

export function Codigo() {
  const { refrescarPersona } = useAuth();
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [dni, setDni] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    if (!codigo.trim() || !nombre.trim() || !telefono.trim()) {
      setError("Completá código, nombre y teléfono.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const res = await canjearCodigo(codigo.trim(), nombre.trim(), telefono.trim(), dni.trim() || null);
      if (res.ok) {
        await refrescarPersona();
        return;
      }
      setError(res.error ?? "Error inesperado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo conectar con el servidor. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Pantalla>
      <Titulo>Tengo un código de acceso</Titulo>
      <Parrafo>Ingresá el código que te dio tu supervisor o el administrador del sitio.</Parrafo>
      <Campo label="Código" value={codigo} onChangeText={setCodigo} autoCapitalize="characters" placeholder="ej. AB12CD" />
      <Campo label="Nombre y apellido" value={nombre} onChangeText={setNombre} placeholder="ej. Juan Pérez" />
      <Campo label="Teléfono" value={telefono} onChangeText={setTelefono} keyboardType="phone-pad" placeholder="ej. +54 9 291 400-0000" />
      <Campo label="DNI (opcional)" value={dni} onChangeText={setDni} keyboardType="number-pad" placeholder="ej. 30123456" />
      <TextoError>{error}</TextoError>
      <BotonPrimario onPress={() => void enviar()} cargando={enviando}>
        Continuar
      </BotonPrimario>
    </Pantalla>
  );
}
