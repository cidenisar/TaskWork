import type { ImagenInforme, Tecnico, Vehiculo } from "@/lib/types";
import type { GpsCapturado } from "@/components/ubicaciones/ubicacion-fields";
import { labelUbicacion, type Ubicacion } from "@/components/ubicaciones/types";

export interface InformeFormState {
  titulo: string;
  fecha: string;
  cliente: string;
  proyecto: string;
  ticketNumero: string;
  tipoInforme: string;
  tipoInformeNuevo: string;
  permisoTrabajo: string;
  provinciaFiltro: string;
  ubicacionId: string; // "" | "__new" | id
  localidadNueva: string;
  sitioNueva: string;
  plantaNueva: string;
  oficinaNueva: string;
  gps: GpsCapturado | null;
  descripcionTrabajo: string;
  tareasPendientes: string;
}

export const EMPTY_FORM: InformeFormState = {
  titulo: "",
  fecha: new Date().toISOString().slice(0, 10),
  cliente: "",
  proyecto: "",
  ticketNumero: "",
  tipoInforme: "",
  tipoInformeNuevo: "",
  permisoTrabajo: "",
  provinciaFiltro: "",
  ubicacionId: "",
  localidadNueva: "",
  sitioNueva: "",
  plantaNueva: "",
  oficinaNueva: "",
  gps: null,
  descripcionTrabajo: "",
  tareasPendientes: "",
};

export interface CatalogosInforme {
  tiposInforme: string[];
  clientes: string[];
  provincias: string[];
  ubicaciones: Ubicacion[];
  tecnicos: { nombre: string; torre: string | null }[];
  torres: string[];
  vehiculos: { patente: string; marcaModelo: string | null }[];
}

/** Etiqueta de la Ubicación elegida/creada en el form, para mostrar en las pantallas de revisión. */
export function labelUbicacionDesdeForm(
  form: Pick<InformeFormState, "ubicacionId" | "provinciaFiltro" | "localidadNueva" | "sitioNueva" | "plantaNueva" | "oficinaNueva">,
  ubicaciones: Ubicacion[],
): string {
  if (form.ubicacionId && form.ubicacionId !== "__new") {
    const u = ubicaciones.find((x) => x.id === form.ubicacionId);
    return u ? labelUbicacion(u) : "—";
  }
  if (form.ubicacionId === "__new") {
    const partes = [form.oficinaNueva, form.plantaNueva, form.sitioNueva, form.localidadNueva, form.provinciaFiltro].filter((p) =>
      p.trim(),
    );
    return partes.length ? partes.join(" · ") : "—";
  }
  return "—";
}

export interface EmailDestinatario {
  email: string;
  activo: boolean;
}

export interface InformeWizardData {
  form: InformeFormState;
  tecnicos: Tecnico[];
  vehiculos: Vehiculo[];
  imagenes: ImagenInforme[];
}
