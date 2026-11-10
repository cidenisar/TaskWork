"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";

export interface FilterableSelectOption {
  value: string;
  label: string;
}

/**
 * Como un <select>, pero con filtro por texto — para listas largas donde
 * desplazarse opción por opción es lento (ej. "Sitio" entre todos los de
 * una provincia). A diferencia de AutocompleteInput, el valor SIEMPRE es
 * uno de `options` (nunca texto libre): lo que se tipea solo filtra, nunca
 * se "commitea" tal cual.
 */
export function FilterableSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: FilterableSelectOption[];
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const etiquetaActual = options.find((o) => o.value === value)?.label ?? "";

  useEffect(() => {
    function onOutside(e: MouseEvent | TouchEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
    };
  }, []);

  const q = query.trim().toLowerCase();
  const filtradas = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  return (
    <div ref={wrapRef} className="autocomplete-wrap">
      <div className="filterable-select-input">
        <Icon name="search" size={13} />
        <input
          type="text"
          placeholder={placeholder}
          value={open ? query : etiquetaActual}
          disabled={disabled}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {open && (
        <div className="autocomplete-panel">
          {filtradas.length === 0 && (
            <div className="autocomplete-item" style={{ cursor: "default" }}>
              Sin resultados.
            </div>
          )}
          {filtradas.map((o) => (
            <button
              type="button"
              key={o.value}
              className="autocomplete-item"
              // onMouseDown (no onClick) para que dispare antes del blur del input y no se cierre el panel primero.
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o.value);
                setOpen(false);
                setQuery("");
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
