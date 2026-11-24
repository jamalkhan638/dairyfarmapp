import * as SQLite from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import type { LocalDb, SqlParam } from '../sync/db-types';
import { migrate } from '../sync/schema';
import { LocalRepo } from '../sync/repo';
import { SyncEngine } from '../sync/engine';
import { api } from './api';

/**
 * expo-sqlite adapter. All writes go through one queue, so a transaction never
 * interleaves with another write.
 */
class ExpoLocalDb implements LocalDb {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private db: SQLite.SQLiteDatabase) {}
  private direct: LocalDb = {
    run: async (sql, params = []) => {
      await this.db.runAsync(sql, params as SqlParam[]);
    },
    all: (sql, params = []) => this.db.getAllAsync(sql, params as SqlParam[]),
    first: (sql, params = []) => this.db.getFirstAsync(sql, params as SqlParam[]),
    transaction: (fn) => fn(this.direct),
  };
  run(sql: string, params?: SqlParam[]) {
    return this.transaction((tx) => tx.run(sql, params));
  }
  all<T>(sql: string, params?: SqlParam[]) {
    return this.direct.all<T>(sql, params);
  }
  first<T>(sql: string, params?: SqlParam[]) {
    return this.direct.first<T>(sql, params);
  }
  transaction<T>(fn: (tx: LocalDb) => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      let out!: T;
      await this.db.withTransactionAsync(async () => {
        out = await fn(this.direct);
      });
      return out;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }
}

export const newId = () => randomUUID();

let current: { db: LocalDb; repo: LocalRepo; engine: SyncEngine } | null = null;
let userIdRef: string | null = null;

export function setSyncUser(id: string | null) {
  userIdRef = id;
}

export async function openLocal() {
  if (current) return current;
  const sqlite = await SQLite.openDatabaseAsync('dairy.db');
  await sqlite.execAsync('PRAGMA journal_mode = WAL;');
  const db = new ExpoLocalDb(sqlite);
  await migrate(db);
  const repo = new LocalRepo(db, { newId });
  const engine = new SyncEngine(db, repo, api, () => userIdRef);
  current = { db, repo, engine };
  return current;
}

export function local() {
  if (!current) throw new Error('Local database not open yet');
  return current;
}

/**
 * Called after login. The phone keeps one person's data. If someone else logs in,
 * the downloaded data is cleared; unsent changes of the previous person block it.
 */
export async function prepareForUser(userId: string): Promise<'ok' | 'other_user_pending'> {
  const { db, repo } = await openLocal();
  const owner = await repo.getMeta('dataOwner');
  if (owner && owner !== userId) {
    const pending = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM outbox WHERE user_id <> ?', [userId]);
    if (Number(pending?.n ?? 0) > 0) return 'other_user_pending';
    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM records');
      await tx.run("DELETE FROM meta WHERE key IN ('cursor', 'accessKey', 'lastSyncAt')");
      await tx.run('DELETE FROM uploads');
    });
  }
  await repo.setMeta('dataOwner', userId);
  return 'ok';
}
