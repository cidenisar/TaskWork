// Hook mínimo para el toast transitorio que usan las pantallas de
// administración (ver Cowork "Administración de Operadores" — mismo
// patrón: aparece, se lee, desaparece solo a los ~2.6s).

import { useCallback, useRef, useState } from "react";

export function useToast() {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const mostrar = useCallback((msg: string) => {
    setMensaje(msg);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setMensaje(null), 2600);
  }, []);

  return { mensaje, mostrar };
}
