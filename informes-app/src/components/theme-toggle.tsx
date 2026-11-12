"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";

const CLAVE = "tema";

/**
 * Interruptor propio de tema claro/oscuro — decisión de Ivan (9/11): se
 * construye para TODA la app, no depende del sistema operativo (HANDOFF
 * §12.9).
 *
 * Desde la imagen "Mezcla" (10/11) CLARO es el default (sin atributo) y
 * OSCURO la excepción explícita (`data-theme='dark'`), al revés de como
 * estaba: Ivan trabaja con la máquina en claro. Quien ya había elegido claro
 * no nota nada; quien había elegido oscuro lo conserva (se lee la misma
 * clave `tema`).
 */
function aplicar(tema: "light" | "dark") {
  if (tema === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
}

export function ThemeToggle({ className = "signout", soloIcono = false }: { className?: string; soloIcono?: boolean }) {
  // Inicializador perezoso, no un efecto: en el servidor no hay `localStorage`
  // (devuelve "light", el default) y en el cliente lee el valor real en la
  // misma pasada de hidratación — React puede marcar esto con un aviso de
  // "hydration mismatch" si el usuario eligió oscuro, por eso el
  // `suppressHydrationWarning` del botón; el <head> script ya puso el tema
  // correcto en el documento antes de este primer render, así que no hay
  // parpadeo visual, solo el aviso en consola que ese atributo existe para evitar.
  const [tema, setTema] = useState<"light" | "dark">(() => {
    if (typeof localStorage === "undefined") return "light";
    return localStorage.getItem(CLAVE) === "dark" ? "dark" : "light";
  });

  function alternar() {
    const siguiente = tema === "light" ? "dark" : "light";
    aplicar(siguiente);
    try {
      localStorage.setItem(CLAVE, siguiente);
    } catch {
      // localStorage puede fallar (modo privado) — el tema igual cambia para esta sesión.
    }
    setTema(siguiente);
  }

  return (
    <button
      type="button"
      onClick={alternar}
      className={className}
      title={tema === "light" ? "Usar tema oscuro" : "Usar tema claro"}
      aria-label={tema === "light" ? "Usar tema oscuro" : "Usar tema claro"}
      suppressHydrationWarning
    >
      {soloIcono ? (
        // `key` para que React monte un ícono nuevo al cambiar y se repita la animación de giro.
        // La palabra solo se ve en el celular (criterio de la app: en móvil, ícono con palabra).
        <>
          <Icon key={tema} name={tema === "light" ? "moon" : "sun"} size={19} className="mz-gira" />
          <span className="mz-lbl">{tema === "light" ? "Oscuro" : "Claro"}</span>
        </>
      ) : (
        <>
          <Icon name={tema === "light" ? "moon" : "sun"} size={13} /> {tema === "light" ? "Oscuro" : "Claro"}
        </>
      )}
    </button>
  );
}

/** Script inline para el <head> — aplica el tema guardado ANTES del primer render, sin esto se ve un parpadeo del tema por defecto al cargar. */
export const SCRIPT_TEMA_INICIAL = `(function(){try{var t=localStorage.getItem('${CLAVE}');if(t==='dark')document.documentElement.dataset.theme='dark';}catch(e){}})();`;
