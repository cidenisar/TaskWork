// Cache local persistente del padrón de operadores — ver Especificación
// del Sistema de Emergencias, invariante 2: "cada consola valida el PIN
// de operador contra una copia local, así que puede habilitar el panel
// sin conexión". SQLite en vez de en memoria a propósito: si la Pi se
// reinicia mientras está desconectada (corte de luz + reconexión lenta),
// un cache en memoria arranca vacío justo en el peor momento — SQLite
// sobrevive al restart, y el padrón retained de MQTT lo termina de
// refrescar en cuanto reconecta.

import Database from "better-sqlite3";
import type { OperadorPadron } from "../types.js";

export class PadronCache {
  private readonly db: Database.Database;

  constructor(rutaArchivo: string) {
    this.db = new Database(rutaArchivo);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      create table if not exists operadores (
        id text primary key,
        legajo text,
        pin_hash text not null,
        rol text not null
      )
    `);
  }

  /** Reemplaza el padrón completo — mismo criterio que el payload MQTT retained: la última foto gana. */
  reemplazar(operadores: OperadorPadron[]): void {
    const borrarTodo = this.db.prepare("delete from operadores");
    const insertar = this.db.prepare(
      "insert into operadores (id, legajo, pin_hash, rol) values (@id, @legajo, @pinHash, @rol)"
    );
    const transaccion = this.db.transaction((filas: OperadorPadron[]) => {
      borrarTodo.run();
      for (const o of filas) insertar.run(o);
    });
    transaccion(operadores);
  }

  obtenerTodos(): OperadorPadron[] {
    const filas = this.db.prepare("select id, legajo, pin_hash as pinHash, rol from operadores").all();
    return filas as OperadorPadron[];
  }

  cerrar(): void {
    this.db.close();
  }
}
