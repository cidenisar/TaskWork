// Parseo y diff del import de Padrón (pestaña "Importar" de
// "Administración de Padrón de Personas") — ver Cowork.
//
// Desvío deliberado del wireframe: ahí "importar" es un botón que
// simula subir un archivo fijo (`padron_agosto.xlsx`) con datos
// inventados. Acá se sube un archivo real y se lo parsea de verdad. Se
// soporta **CSV** (coma o punto y coma como separador, con o sin
// comillas) — no el binario de Excel (.xlsx/.xls), que necesitaría una
// librería nueva solo para esto; si se sube un .xlsx, se lo rechaza con
// un mensaje pidiendo exportarlo como CSV primero (toda planilla lo
// hace con "Guardar como… → CSV").
//
// El DNI es la clave de upsert real: hay un índice único
// `(organizacion_id, dni)` en la base (confirmado contra el esquema
// real), así que dos personas nunca pueden compartir DNI en la misma
// organización sin importar el tipo. El import solo trabaja sobre
// personal **fijo** — el eventual/contratista entra por código de
// acceso (pestaña Códigos), nunca por acá — así que si una fila del CSV
// trae un DNI que ya pertenece a una persona eventual (o pendiente de
// aprobación, o rechazada), no se puede simplemente "convertirla" a
// fijo sin que un admin lo decida a propósito: queda marcada como
// conflicto, ni alta ni cambio.

import type { PersonaFila } from "./personas";

export interface FilaCsv {
  linea: number;
  nombre: string;
  dni: string;
  legajo: string | null;
  telefono: string;
  sitioNombre: string;
}

export interface ErrorFilaCsv {
  linea: number;
  motivo: string;
}

export interface ParseoCsv {
  filas: FilaCsv[];
  errores: ErrorFilaCsv[];
}

const COLUMNAS_REQUERIDAS = ["nombre", "dni", "telefono", "sitio"] as const;

function normalizarEncabezado(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // saca acentos: "Teléfono" -> "telefono"
}

/** Separa una línea CSV respetando comillas (RFC 4180 simplificado). */
function separarLinea(linea: string, delimitador: string): string[] {
  const campos: string[] = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (entreComillas) {
      if (c === '"') {
        if (linea[i + 1] === '"') {
          actual += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        actual += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === delimitador) {
      campos.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos.map((c) => c.trim());
}

export function parsearCsvPadron(textoCrudo: string): ParseoCsv | { error: string } {
  const texto = textoCrudo.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lineas = texto.split("\n").filter((l) => l.trim() !== "");
  if (lineas.length === 0) return { error: "El archivo está vacío." };

  const primeraLinea = lineas[0];
  const delimitador = (primeraLinea.match(/;/g)?.length ?? 0) >= (primeraLinea.match(/,/g)?.length ?? 0) ? ";" : ",";
  const encabezado = separarLinea(primeraLinea, delimitador).map(normalizarEncabezado);

  const idx = {
    nombre: encabezado.indexOf("nombre"),
    dni: encabezado.indexOf("dni"),
    legajo: encabezado.indexOf("legajo"),
    telefono: encabezado.indexOf("telefono"),
    sitio: encabezado.indexOf("sitio"),
  };
  const faltantes = COLUMNAS_REQUERIDAS.filter((c) => idx[c] === -1);
  if (faltantes.length > 0) {
    return { error: `Faltan columnas en el encabezado: ${faltantes.join(", ")}. Columnas esperadas: nombre, dni, legajo (opcional), telefono, sitio.` };
  }

  const filas: FilaCsv[] = [];
  const errores: ErrorFilaCsv[] = [];
  for (let i = 1; i < lineas.length; i++) {
    const linea = i + 1; // número de línea "humano" (1 = encabezado)
    const campos = separarLinea(lineas[i], delimitador);
    const nombre = (campos[idx.nombre] ?? "").trim();
    const dni = (campos[idx.dni] ?? "").trim();
    const legajo = idx.legajo === -1 ? "" : (campos[idx.legajo] ?? "").trim();
    const telefono = (campos[idx.telefono] ?? "").trim();
    const sitioNombre = (campos[idx.sitio] ?? "").trim();
    if (!nombre || !dni || !telefono || !sitioNombre) {
      errores.push({ linea, motivo: "Falta nombre, DNI, teléfono o sitio." });
      continue;
    }
    filas.push({ linea, nombre, dni, legajo: legajo || null, telefono, sitioNombre });
  }
  return { filas, errores };
}

export interface AltaImport {
  dni: string;
  nombre: string;
  legajo: string | null;
  telefono: string;
  sitioId: string;
  sitioNombre: string;
}
export interface CambioImport {
  personaId: string;
  nombre: string;
  sitioId: string;
  legajo: string | null;
  telefono: string;
  detalle: string[];
}
export interface ConflictoImport {
  linea: number;
  dni: string;
  nombre: string;
  motivo: string;
}
export interface ErrorSitioImport {
  linea: number;
  dni: string;
  nombre: string;
  sitioNombre: string;
}

export interface DiffImport {
  altas: AltaImport[];
  cambios: CambioImport[];
  posiblesBajas: PersonaFila[];
  conflictos: ConflictoImport[];
  erroresSitio: ErrorSitioImport[];
}

export function calcularDiffImport(filasCsv: FilaCsv[], padronActual: PersonaFila[], sitios: { id: string; nombre: string }[]): DiffImport {
  const sitioIdPorNombre = new Map(sitios.map((s) => [normalizarEncabezado(s.nombre), s.id]));
  const personaPorDni = new Map(padronActual.map((p) => [p.dni, p]));
  const dnisDelCsv = new Set<string>();

  const altas: AltaImport[] = [];
  const cambios: CambioImport[] = [];
  const conflictos: ConflictoImport[] = [];
  const erroresSitio: ErrorSitioImport[] = [];

  for (const fila of filasCsv) {
    const sitioId = sitioIdPorNombre.get(normalizarEncabezado(fila.sitioNombre));
    if (!sitioId) {
      erroresSitio.push({ linea: fila.linea, dni: fila.dni, nombre: fila.nombre, sitioNombre: fila.sitioNombre });
      continue;
    }
    dnisDelCsv.add(fila.dni);
    const existente = personaPorDni.get(fila.dni);
    if (!existente) {
      altas.push({ dni: fila.dni, nombre: fila.nombre, legajo: fila.legajo, telefono: fila.telefono, sitioId, sitioNombre: fila.sitioNombre });
      continue;
    }
    if (existente.tipo !== "fijo") {
      conflictos.push({
        linea: fila.linea,
        dni: fila.dni,
        nombre: fila.nombre,
        motivo: `Ese DNI ya pertenece a "${existente.nombre}", registrado como personal eventual — el import no lo puede convertir a fijo solo.`,
      });
      continue;
    }
    const detalle: string[] = [];
    if (existente.telefono !== fila.telefono) detalle.push("teléfono actualizado");
    if ((existente.legajo ?? "") !== (fila.legajo ?? "")) detalle.push("legajo actualizado");
    if (existente.sitioId !== sitioId) detalle.push(`sitio actualizado a ${fila.sitioNombre}`);
    if (existente.nombre !== fila.nombre) detalle.push("nombre actualizado");
    if (detalle.length > 0) {
      cambios.push({ personaId: existente.id, nombre: fila.nombre, sitioId, legajo: fila.legajo, telefono: fila.telefono, detalle });
    }
  }

  const posiblesBajas = padronActual.filter((p) => p.tipo === "fijo" && p.estado === "activo" && !dnisDelCsv.has(p.dni));

  return { altas, cambios, posiblesBajas, conflictos, erroresSitio };
}

// aplicarImport (la única parte de este flujo que escribe en Supabase)
// vive en personas.ts a propósito — este archivo queda sin ningún
// import de Supabase, así el parseo/diff se puede probar con datos
// puros, sin necesitar credenciales ni red.
