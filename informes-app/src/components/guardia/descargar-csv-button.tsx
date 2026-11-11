"use client";

import { Icon } from "@/components/icon";

/** "Bajar a CSV" (HANDOFF §12.11) — se abre en Excel, separado por punto y coma. Todo pasa por acá para no repetir el armado del Blob en cada pantalla. */
export function DescargarCsvButton({ nombreArchivo, contenido }: { nombreArchivo: string; contenido: string }) {
  function descargar() {
    const blob = new Blob([`﻿${contenido}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={descargar}>
      <Icon name="download" size={13} /> Bajar CSV
    </button>
  );
}
