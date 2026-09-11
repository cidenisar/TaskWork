"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reemplaza <input list="..."> + <datalist> en toda la app — el datalist
 * nativo es inconsistente entre navegadores/celulares (en iOS Safari no
 * anda directamente; en Android varía según el navegador y a veces
 * renderiza mal, mostrando las opciones sin texto). Este componente arma
 * la lista de sugerencias nosotros mismos, así se ve y funciona igual en
 * cualquier equipo.
 */
export function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  disabled,
  style,
  onCommit,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  /** Valor "definitivo" — al elegir una sugerencia, o al salir del campo escribiendo libre. Para casos como guardar recién ahí en vez de en cada tecla. */
  onCommit?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const q = value.trim().toLowerCase();
  const filtered = (q ? suggestions.filter((s) => s.toLowerCase().includes(q)) : suggestions).slice(0, 8);

  useEffect(() => {
    function onOutside(e: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, []);

  return (
    <div ref={wrapRef} className="autocomplete-wrap" style={style}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => onCommit?.(value)}
      />
      {open && filtered.length > 0 && (
        <div className="autocomplete-panel">
          {filtered.map((s) => (
            <button
              type="button"
              key={s}
              className="autocomplete-item"
              // onMouseDown (no onClick) para que dispare antes del blur del input y no se cierre el panel primero.
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s);
                setOpen(false);
                onCommit?.(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
