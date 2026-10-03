import type { Moneda } from "@/lib/database.types";
import type { GpsCapturado } from "@/components/ubicaciones/ubicacion-fields";
import type { Ubicacion } from "@/components/ubicaciones/types";

export interface RendicionFormState {
  motivo: string;
  fecha: string;
  proyectoCliente: string;
  provinciaFiltro: string;
  ubicacionId: string; // "" | "__new" | id
  localidadNueva: string;
  sitioNueva: string;
  plantaNueva: string;
  oficinaNueva: string;
  gps: GpsCapturado | null;
  viaticoRecibido: string;
  moneda: Moneda;
}

export const EMPTY_RENDICION_FORM: RendicionFormState = {
  motivo: "",
  fecha: new Date().toISOString().slice(0, 10),
  proyectoCliente: "",
  provinciaFiltro: "",
  ubicacionId: "",
  localidadNueva: "",
  sitioNueva: "",
  plantaNueva: "",
  oficinaNueva: "",
  gps: null,
  viaticoRecibido: "",
  moneda: "ARS",
};

export interface GastoTecnicoChip {
  nombre: string;
  torre: string;
}

export interface CatalogosRendicion {
  provincias: string[];
  ubicaciones: Ubicacion[];
  categoriasGasto: string[];
  tecnicos: { nombre: string; torre: string | null }[];
  torres: string[];
}
