// Historial local de eventos disparados/cancelados desde ESTA consola —
// ver README, "Pantalla táctil". No es el historial de eventos de todo el
// sitio (eso lo tiene el backend, con las confirmaciones de cada persona)
// — es la bitácora local de qué pasó en este panel puntual: útil para un
// operador que llega y quiere ver qué se disparó hoy desde acá, incluso
// sin red.
//
// Abre su propia conexión al mismo archivo SQLite que PadronCache
// (better-sqlite3 soporta varias conexiones al mismo archivo en un
// proceso; WAL ya está habilitado por PadronCache) — se mantienen
// separadas a propósito, cada clase dueña de su propia tabla.

import Database from "better-sqlite3";

export interface FilaHistorial {
  eventoId: string;
  ts: number; // epoch ms
  tipo: string; // el botón (INCENDIO, OK, TOXICO, ...)
  resultado: "enviado" | "cancelado_local";
  operadorId: string | null;
  operadorLegajo: string | null;
}

export class HistorialLocal {
  private readonly db: Database.Database;

  constructor(rutaArchivo: string) {
    this.db = new Database(rutaArchivo);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      create table if not exists historial (
        evento_id text primary key,
        ts integer not null,
        tipo text not null,
        resultado text not null,
        operador_id text,
        operador_legajo text
      )
    `);
  }

  registrar(fila: FilaHistorial): void {
    this.db
      .prepare(
        `insert into historial (evento_id, ts, tipo, resultado, operador_id, operador_legajo)
         values (@eventoId, @ts, @tipo, @resultado, @operadorId, @operadorLegajo)`
      )
      .run(fila);
  }

  /** Más recientes primero — es lo único que le interesa a un operador mirando la pantalla. */
  obtenerRecientes(limite = 20): FilaHistorial[] {
    const filas = this.db
      .prepare(
        `select evento_id as eventoId, ts, tipo, resultado, operador_id as operadorId, operador_legajo as operadorLegajo
         from historial order by ts desc limit ?`
      )
      .all(limite);
    return filas as FilaHistorial[];
  }

  cerrar(): void {
    this.db.close();
  }
}
