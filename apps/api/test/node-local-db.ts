import { DatabaseSync } from 'node:sqlite';
import type { LocalDb, SqlParam } from '../../mobile/src/sync/db-types';

/** The phone database interface backed by Node's built-in SQLite (tests only). */
export class NodeLocalDb implements LocalDb {
  private db = new DatabaseSync(':memory:');
  private queue: Promise<unknown> = Promise.resolve();
  private direct: LocalDb = {
    run: async (sql, params = []) => { this.db.prepare(sql).run(...(params as SqlParam[])); },
    all: async (sql, params = []) => this.db.prepare(sql).all(...(params as SqlParam[])) as any[],
    first: async (sql, params = []) => (this.db.prepare(sql).get(...(params as SqlParam[])) as any) ?? null,
    transaction: (fn) => fn(this.direct),
  };
  run(sql: string, params?: SqlParam[]) { return this.transaction((tx) => tx.run(sql, params)); }
  all<T>(sql: string, params?: SqlParam[]) { return this.direct.all<T>(sql, params); }
  first<T>(sql: string, params?: SqlParam[]) { return this.direct.first<T>(sql, params); }
  transaction<T>(fn: (tx: LocalDb) => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      this.db.exec('BEGIN');
      try {
        const r = await fn(this.direct);
        this.db.exec('COMMIT');
        return r;
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      }
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}
