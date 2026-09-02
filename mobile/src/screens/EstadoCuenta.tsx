// Estados donde la cuenta existe pero no recibe alertas todavía/ya no
// (ver backend-server/README.md, "Aprobar/rechazar un autoregistro" —
// mismos 3 estados que administra Frontend Web, más de_baja/vencido).
// Sin navegación propia: no hay nada que hacer acá salvo esperar o
// refrescar; RootNavigator cambia de pantalla solo apenas el estado
// cambie (ej. un admin aprueba el autoregistro).
import { useState } from "react";
import type { EstadoPersona } from "../lib/auth";
import { useAuth } from "../lib/auth";
import { Pantalla, Titulo, Parrafo, BotonSecundario } from "../components/ui";

const COPY: Record<Exclude<EstadoPersona, "activo">, { titulo: string; texto: string }> = {
  pendiente_aprobacion: {
    titulo: "Esperando aprobación",
    texto: "Tu alta todavía no fue aprobada por un administrador. Te vamos a avisar en cuanto puedas usar la app — no hace falta que hagas nada más.",
  },
  rechazado: {
    titulo: "Alta rechazada",
    texto: "Un administrador rechazó tu alta. Si te parece un error, comunicate directamente con tu supervisor.",
  },
  de_baja: {
    titulo: "Cuenta dada de baja",
    texto: "Tu registro fue dado de baja del padrón. Si seguís trabajando en el sitio, comunicate con tu supervisor para que lo revise.",
  },
  vencido: {
    titulo: "Acceso vencido",
    texto: "Tu acceso venció. Si tu contrato sigue vigente, pedile a tu supervisor un código de acceso nuevo o que actualice tu vencimiento.",
  },
};

export function EstadoCuenta({ estado }: { estado: Exclude<EstadoPersona, "activo"> }) {
  const { refrescarPersona } = useAuth();
  const [refrescando, setRefrescando] = useState(false);
  const copy = COPY[estado];

  async function refrescar() {
    setRefrescando(true);
    try {
      await refrescarPersona();
    } finally {
      setRefrescando(false);
    }
  }

  return (
    <Pantalla>
      <Titulo>{copy.titulo}</Titulo>
      <Parrafo>{copy.texto}</Parrafo>
      <BotonSecundario onPress={() => void refrescar()} disabled={refrescando}>
        {refrescando ? "Revisando…" : "Revisar de nuevo"}
      </BotonSecundario>
    </Pantalla>
  );
}
