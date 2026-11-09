"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";

const CLAVE = "tema";

/**
 * Interruptor propio de tema claro/oscuro — decisión de Ivan (9/11): se
 * construye para TODA la app, no depende del sistema operativo (HANDOFF
 * §12.9). El sistema de diseño ya tenía los tokens de `[data-theme='light']`
 * en `wireframe-ui.css` desde antes, pero nada los activaba — esto es lo
 * que faltaba. Oscuro es el default (sin atributo); claro es la excepción
 * explícita, igual que ya estaba armada la hoja de estilos.
 */
function aplicar(tema: "light" | "dark") {
  if (tema === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
}

export function ThemeToggle({ className = "signout" }: { className?: string }) {
  // Inicializador perezoso, no un efecto: en el servidor no hay `localStorage`
  // (devuelve "dark", el default) y en el cliente lee el valor real en la
  // misma pasada de hidratación — React puede marcar esto con un aviso de
  // "hydration mismatch" si el usuario eligió claro, por eso el
  // `suppressHydrationWarning` del botón; el <head> script ya puso el tema
  // correcto en el documento antes de este primer render, así que no hay
  // parpadeo visual, solo el aviso en consola que ese atributo existe para evitar.
  const [tema, setTema] = useState<"light" | "dark">(() => {
    if (typeof localStorage === "undefined") return "dark";
    return localStorage.getItem(CLAVE) === "light" ? "light" : "dark";
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
      suppressHydrationWarning
    >
      <Icon name={tema === "light" ? "moon" : "sun"} size={13} /> {tema === "light" ? "Oscuro" : "Claro"}
    </button>
  );
}

/** Script inline para el <head> — aplica el tema guardado ANTES del primer render, sin esto se ve un parpadeo del tema por defecto al cargar. */
export const SCRIPT_TEMA_INICIAL = `(function(){try{var t=localStorage.getItem('${CLAVE}');if(t==='light')document.documentElement.dataset.theme='light';}catch(e){}})();`;
