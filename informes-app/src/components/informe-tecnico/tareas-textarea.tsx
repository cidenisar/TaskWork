"use client";

import { useLayoutEffect, useRef } from "react";
import { aplicarVinetas } from "@/lib/tareas/puro";

/**
 * Campo de "Tareas pendientes" con comportamiento de lista: al tocarlo vacío arranca con una
 * viñeta, cada Enter abre otra, y Enter sobre una viñeta vacía sale de la lista. Pensado para
 * el celular, donde escribir una tarea por línea sin ver dónde empieza cada una es confuso.
 */
export function TareasTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const cursorPendiente = useRef<number | null>(null);

  // React reemplaza el texto y el cursor salta al final: se devuelve donde corresponde.
  useLayoutEffect(() => {
    if (cursorPendiente.current !== null && ref.current) {
      ref.current.setSelectionRange(cursorPendiente.current, cursorPendiente.current);
      cursorPendiente.current = null;
    }
  });

  return (
    <textarea
      ref={ref}
      placeholder={placeholder}
      value={value}
      onFocus={() => {
        if (!value.trim()) {
          onChange("• ");
          cursorPendiente.current = 2;
        }
      }}
      onChange={(e) => {
        const { texto, cursor } = aplicarVinetas(value, e.target.value, e.target.selectionStart ?? e.target.value.length);
        if (texto !== e.target.value) cursorPendiente.current = cursor;
        onChange(texto);
      }}
      onBlur={() => {
        // Una viñeta sola no es una tarea: se deja el campo vacío.
        if (/^[\s•]*$/.test(value) && value !== "") onChange("");
      }}
    />
  );
}
