export type SqlParam = string | number | null;

/**
 * Minimal database interface the sync engine needs. The app implements it with
 * expo-sqlite; tests implement it with Node's built-in SQLite.
 */
export interface LocalDb {
  run(sql: string, params?: SqlParam[]): Promise<void>;
  all<T = any>(sql: string, params?: SqlParam[]): Promise<T[]>;
  first<T = any>(sql: string, params?: SqlParam[]): Promise<T | null>;
  /** Run fn atomically. Writes are queued so only one transaction runs at a time. */
  transaction<T>(fn: (tx: LocalDb) => Promise<T>): Promise<T>;
}
