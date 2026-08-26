// =====================================================================
// STUBS TEMPORALES — SOLO PARA TYPE-CHECKING EN EL SANDBOX DE DESARROLLO
// =====================================================================
// Este entorno no tiene acceso a los registries de npm (ver README.md,
// "Limitación de red de este sandbox"), así que no se pudieron instalar
// las dependencias reales (@supabase/supabase-js, mqtt, dotenv) ni sus
// tipos oficiales. Este archivo declara el subconjunto mínimo de tipos que
// usa el código de este proyecto, para poder correr `tsc --noEmit` acá
// mismo sin esas librerías instaladas.
//
// BORRAR ESTE ARCHIVO apenas se corra `npm install` en un entorno con
// acceso a internet — a partir de ahí, TypeScript va a usar los tipos
// reales y más completos que vienen con cada paquete, y este stub
// quedaría compitiendo con ellos (podría ocultar errores de tipo reales).
// =====================================================================

declare module "dotenv/config" {}

// Globals de Node.js — normalmente los trae @types/node (tampoco instalable
// acá, mismo motivo). En un `npm install` real estos quedan mejor tipados
// por ese paquete y este stub no hace falta.
declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
};
declare const process: {
  env: Record<string, string | undefined>;
};
declare class Buffer {
  toString(encoding?: string): string;
}

declare module "mqtt" {
  export interface MqttClient {
    on(event: "connect", cb: () => void): void;
    on(event: "error", cb: (err: Error) => void): void;
    on(event: "message", cb: (topic: string, payload: Buffer) => void): void;
    subscribe(
      topic: string | string[],
      opts: { qos: 0 | 1 | 2 },
      cb?: (err: Error | null) => void
    ): void;
    publish(
      topic: string,
      message: string,
      opts?: { qos?: 0 | 1 | 2; retain?: boolean }
    ): void;
    end(): void;
  }
  export interface ConnectOptions {
    username?: string;
    password?: string;
    reconnectPeriod?: number;
  }
  const mqtt: {
    connect(url: string, opts?: ConnectOptions): MqttClient;
  };
  export default mqtt;
}

declare module "@supabase/supabase-js" {
  export interface PostgrestError {
    message: string;
    code?: string;
  }
  export interface PostgrestSingleResponse<T> {
    data: T | null;
    error: PostgrestError | null;
  }
  export interface PostgrestFilterBuilder<T> extends Promise<PostgrestSingleResponse<T>> {
    select(columns?: string): PostgrestFilterBuilder<T>;
    insert(values: unknown): PostgrestFilterBuilder<T>;
    update(values: unknown): PostgrestFilterBuilder<T>;
    eq(column: string, value: unknown): PostgrestFilterBuilder<T>;
    or(filters: string): PostgrestFilterBuilder<T>;
    ilike(column: string, pattern: string): PostgrestFilterBuilder<T>;
    order(column: string, opts?: { ascending?: boolean }): PostgrestFilterBuilder<T>;
    limit(n: number): PostgrestFilterBuilder<T>;
    maybeSingle(): Promise<PostgrestSingleResponse<T>>;
    single(): Promise<PostgrestSingleResponse<T>>;
  }
  export interface SupabaseClient {
    from(table: string): PostgrestFilterBuilder<any>;
  }
  export function createClient(
    url: string,
    key: string,
    opts?: { auth?: { persistSession?: boolean } }
  ): SupabaseClient;
}
