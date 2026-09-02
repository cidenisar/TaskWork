import type { ImagenInforme, Tecnico, Vehiculo } from "@/lib/types";

export interface InformeFormState {
  titulo: string;
  fecha: string;
  cliente: string;
  proyecto: string;
  ticketNumero: string;
  tipoInforme: string;
  tipoInformeNuevo: string;
  permisoTrabajo: string;
  provincia: string;
  ubicacion: string;
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
  provincia: "",
  ubicacion: "",
  descripcionTrabajo: "",
  tareasPendientes: "",
};

export interface CatalogosInforme {
  tiposInforme: string[];
  provincias: string[];
  tecnicos: { nombre: string; torre: string | null }[];
  torres: string[];
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
