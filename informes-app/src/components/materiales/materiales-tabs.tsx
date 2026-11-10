"use client";

import { useState } from "react";
import { BuscarMateriales } from "./buscar-materiales";
import { AltaMaterialForm } from "./alta-material-form";
import { MaterialesPendientes } from "./materiales-pendientes";
import type { Ubicacion } from "@/components/ubicaciones/types";
import type { ConfigRecursoAltura } from "@/lib/equipos/recurso-altura";

type Tab = "buscar" | "alta" | "devolver";

/**
 * Pestañas del módulo Materiales (ver dilema de materiales, CRITERIOS_Y_IDEAS.md
 * §29): "Buscar" rastrea dónde quedó algo; "Alta" es el trámite de un minuto
 * para registrar lo que se saca de depósito ANTES de instalarlo, no después.
 */
export function MaterialesTabs({
  ubicaciones,
  provincias,
  recursoAlturaConfig,
}: {
  ubicaciones: Ubicacion[];
  provincias: string[];
  recursoAlturaConfig: ConfigRecursoAltura[];
}) {
  const [tab, setTab] = useState<Tab>("buscar");

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" className={`btn btn-sm ${tab === "buscar" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("buscar")}>
          Buscar
        </button>
        <button type="button" className={`btn btn-sm ${tab === "alta" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("alta")}>
          Alta
        </button>
        <button type="button" className={`btn btn-sm ${tab === "devolver" ? "btn-primary" : "btn-secondary"}`} onClick={() => setTab("devolver")}>
          Devolver
        </button>
      </div>
      {tab === "buscar" && <BuscarMateriales />}
      {tab === "alta" && <AltaMaterialForm ubicaciones={ubicaciones} provincias={provincias} recursoAlturaConfig={recursoAlturaConfig} />}
      {tab === "devolver" && <MaterialesPendientes />}
    </div>
  );
}
