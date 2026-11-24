import type { Mutation, MutationResult, ResolveData, SyncEntity } from '@dairy/shared';
import { SYSTEM_FIELDS } from '@dairy/shared';
import type { LocalDb } from './db-types';

export type Row = Record<string, any>;
export type SyncState = 'synced' | 'pending' | 'conflict' | 'rejected';

export interface LocalRecord<T = Row> {
  entity: string;
  id: string;
  data: T;
  server: Row | null;
  syncState: SyncState;
}

export interface OutboxRow {
  seq: number;
  mutation_id: string;
  user_id: string;
  entity: string;
  op: Mutation['op'];
  record_id: string;
  data: string | null;
  base: string | null;
  base_version: number | null;
  local: string | null;
  client_time: string;
  status: 'pending' | 'blocked' | 'conflict' | 'rejected';
  error: string | null;
  error_code: string | null;
  conflict_id: string | null;
  attempts: number;
}

const parse = (s: string | null) => (s ? JSON.parse(s) : null);
const json = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));
const systemFields = new Set<string>(SYSTEM_FIELDS);

/** Fields a user can see/change (no ids, versions, who/when). */
export function userFields(data: Row): Row {
  return Object.fromEntries(Object.entries(data).filter(([k]) => !systemFields.has(k)));
}

export interface Deps {
  newId: () => string;
  now?: () => Date;
}

/**
 * Local-first record store. Every save goes to the phone database immediately and
 * is queued in the outbox; the sync engine sends the outbox later.
 */
export class LocalRepo {
  private listeners = new Set<(local: boolean) => void>();
  constructor(private db: LocalDb, private deps: Deps) {}

  private now() {
    return (this.deps.now ?? (() => new Date()))().toISOString();
  }

  /** Screens subscribe to refresh when data changes. local=true means the user saved something. */
  subscribe(fn: (local: boolean) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  notify(local = false) {
    this.listeners.forEach((l) => l(local));
  }

  // ---------- reading ----------

  async get<T = Row>(entity: string, id: string): Promise<LocalRecord<T> | null> {
    const r = await this.db.first('SELECT * FROM records WHERE entity = ? AND id = ?', [entity, id]);
    return r ? this.toRecord<T>(r) : null;
  }

  async list<T = Row>(entity: string, opts: { includeDeleted?: boolean } = {}): Promise<LocalRecord<T>[]> {
    const rows = await this.db.all('SELECT * FROM records WHERE entity = ?', [entity]);
    return rows.map((r) => this.toRecord<T>(r)).filter((r) => opts.includeDeleted || !(r.data as Row).deletedAt);
  }

  private toRecord<T>(r: any): LocalRecord<T> {
    return { entity: r.entity, id: r.id, data: JSON.parse(r.data), server: parse(r.server), syncState: r.sync_state };
  }

  async outbox(): Promise<OutboxRow[]> {
    return this.db.all<OutboxRow>('SELECT * FROM outbox ORDER BY seq');
  }

  async counts() {
    const rows = await this.db.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM outbox GROUP BY status');
    const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
    const uploads = await this.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM uploads WHERE status = 'pending'");
    return {
      pending: (by.pending ?? 0) + (by.blocked ?? 0),
      conflicts: by.conflict ?? 0,
      rejected: by.rejected ?? 0,
      uploads: Number(uploads?.n ?? 0),
    };
  }

  async getMeta(key: string): Promise<string | null> {
    const r = await this.db.first<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
    return r?.value ?? null;
  }
  async setMeta(key: string, value: string | null, tx: LocalDb = this.db) {
    if (value === null) await tx.run('DELETE FROM meta WHERE key = ?', [key]);
    else await tx.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
  }

  // ---------- local changes ----------

  /**
   * Save a new record locally and queue it.
   * @param sendData what the server needs (may include extra fields, e.g. initial status)
   * @param localData how the record should look on this phone until the server answers
   */
  async create(entity: SyncEntity, userId: string, id: string, sendData: Row, localData: Row = sendData) {
    const now = this.now();
    const local = {
      ...localData,
      id,
      version: 0, // 0 = never synced
      createdById: userId, // display only; the server sets the real value from the login
      createdAt: now,
      clientCreatedAt: now,
      updatedById: userId,
      updatedAt: now,
      clientUpdatedAt: now,
      deletedAt: null,
      deletedById: null,
    };
    await this.db.transaction(async (tx) => {
      await this.enqueue(tx, { userId, entity, op: 'create', recordId: id, data: sendData, local, clientTime: now });
      await this.rebase(tx, entity, id);
    });
    this.notify(true);
  }

  /** Change some fields. Only the changed fields are sent, with the values they had before. */
  async update(entity: SyncEntity, userId: string, id: string, changes: Row) {
    const now = this.now();
    await this.db.transaction(async (tx) => {
      const cur = await tx.first('SELECT * FROM records WHERE entity = ? AND id = ?', [entity, id]);
      if (!cur) throw new Error('Record not found');
      const data = JSON.parse(cur.data);
      const changed = Object.fromEntries(Object.entries(changes).filter(([k, v]) => JSON.stringify(data[k] ?? null) !== JSON.stringify(v ?? null)));
      if (!Object.keys(changed).length) return;
      const base = Object.fromEntries(Object.keys(changed).map((k) => [k, data[k] ?? null]));
      await this.enqueue(tx, {
        userId, entity, op: 'update', recordId: id, data: changed, base, baseVersion: data.version,
        local: { ...changed, updatedById: userId, clientUpdatedAt: now }, clientTime: now,
      });
      await this.rebase(tx, entity, id);
    });
    this.notify(true);
  }

  async remove(entity: SyncEntity, userId: string, id: string) {
    const now = this.now();
    await this.db.transaction(async (tx) => {
      const cur = await tx.first('SELECT * FROM records WHERE entity = ? AND id = ?', [entity, id]);
      if (!cur) return;
      const data = JSON.parse(cur.data);
      await this.enqueue(tx, {
        userId, entity, op: 'delete', recordId: id, base: userFields(data), baseVersion: data.version,
        local: { deletedAt: now, deletedById: userId }, clientTime: now,
      });
      await this.rebase(tx, entity, id);
    });
    this.notify(true);
  }

  /** Queue the user's decision for a conflict. */
  async resolveConflict(userId: string, conflictId: string, decision: ResolveData) {
    const now = this.now();
    await this.db.transaction(async (tx) => {
      await this.enqueue(tx, {
        userId, entity: 'SyncConflict', op: 'resolve', recordId: conflictId, data: decision as unknown as Row,
        local: { status: 'RESOLVING' }, clientTime: now,
      });
      await this.rebase(tx, 'SyncConflict', conflictId);
    });
    this.notify(true);
  }

  /** Throw away a change the server rejected, going back to the server's copy. */
  async discard(seq: number) {
    await this.db.transaction(async (tx) => {
      const row = await tx.first<OutboxRow>('SELECT * FROM outbox WHERE seq = ?', [seq]);
      if (!row) return;
      await tx.run('DELETE FROM outbox WHERE seq = ?', [seq]);
      if (row.op === 'create') await tx.run('DELETE FROM outbox WHERE record_id = ? AND entity = ?', [row.record_id, row.entity]);
      await this.rebase(tx, row.entity, row.record_id);
    });
    this.notify(true);
  }

  /** Try a rejected change again (e.g. after the owner gave permission). */
  async retry(seq: number) {
    await this.db.transaction(async (tx) => {
      await tx.run("UPDATE outbox SET status = 'pending', error = NULL, error_code = NULL, mutation_id = ? WHERE seq = ?", [this.deps.newId(), seq]);
      const row = await tx.first<OutboxRow>('SELECT * FROM outbox WHERE seq = ?', [seq]);
      if (row) await this.rebase(tx, row.entity, row.record_id);
    });
    this.notify(true);
  }

  private async enqueue(
    tx: LocalDb,
    m: { userId: string; entity: string; op: Mutation['op']; recordId: string; data?: Row; base?: Row; baseVersion?: number; local?: Row; clientTime: string },
  ) {
    await tx.run(
      `INSERT INTO outbox (mutation_id, user_id, entity, op, record_id, data, base, base_version, local, client_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [this.deps.newId(), m.userId, m.entity, m.op, m.recordId, json(m.data), json(m.base), m.baseVersion ?? null, json(m.local), m.clientTime],
    );
  }

  // ---------- applying server data ----------

  /**
   * Recalculate what the phone shows for one record: the server copy with this
   * phone's unsent changes laid on top. Changes that hit a conflict or were rejected
   * are not shown as saved (the server copy is the truth), except new records,
   * which stay visible so the user can fix them.
   */
  async rebase(tx: LocalDb, entity: string, id: string) {
    const cur = await tx.first('SELECT server FROM records WHERE entity = ? AND id = ?', [entity, id]);
    const server: Row | null = cur ? parse(cur.server) : null;
    const rows = await tx.all<OutboxRow>('SELECT * FROM outbox WHERE entity = ? AND record_id = ? ORDER BY seq', [entity, id]);
    let data: Row | null = server ? { ...server } : null;
    for (const r of rows) {
      const live = r.status === 'pending' || r.status === 'blocked';
      if (!live && !(r.op === 'create')) continue;
      const local = parse(r.local) ?? {};
      if (r.op === 'create') data = { ...local, ...(data ?? {}) };
      else if (data) data = { ...data, ...local };
    }
    const state: SyncState = rows.some((r) => r.status === 'conflict')
      ? 'conflict'
      : rows.some((r) => r.status === 'rejected')
        ? 'rejected'
        : rows.length
          ? 'pending'
          : 'synced';
    if (!data) {
      await tx.run('DELETE FROM records WHERE entity = ? AND id = ?', [entity, id]);
      return;
    }
    await tx.run(
      `INSERT INTO records (entity, id, data, server, sync_state) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (entity, id) DO UPDATE SET data = excluded.data, server = excluded.server, sync_state = excluded.sync_state`,
      [entity, id, JSON.stringify(data), json(server), state],
    );
  }

  /** Store a record received from the server, keeping any unsent local changes on top. */
  async applyServer(tx: LocalDb, entity: string, record: Row) {
    const id = String(record.id);
    const cur = await tx.first('SELECT server FROM records WHERE entity = ? AND id = ?', [entity, id]);
    const old = cur ? parse(cur.server) : null;
    // Never replace a newer copy with an older one (responses can arrive out of order).
    if (old && typeof old.version === 'number' && typeof record.version === 'number' && record.version < old.version) return;
    await tx.run(
      `INSERT INTO records (entity, id, data, server, sync_state) VALUES (?, ?, ?, ?, 'synced')
       ON CONFLICT (entity, id) DO UPDATE SET server = excluded.server`,
      [entity, id, JSON.stringify(record), JSON.stringify(record)],
    );
    await this.rebase(tx, entity, id);
  }

  // ---------- outbox processing (used by the sync engine) ----------

  /** Changes ready to send for this user. Changes behind an unresolved problem wait. */
  async sendable(userId: string, limit = 100): Promise<OutboxRow[]> {
    return this.db.all<OutboxRow>(
      `SELECT * FROM outbox o
       WHERE o.user_id = ? AND o.status IN ('pending', 'blocked')
         AND NOT EXISTS (
           SELECT 1 FROM outbox p WHERE p.record_id = o.record_id AND p.seq < o.seq AND p.status IN ('conflict', 'rejected')
         )
       ORDER BY o.seq LIMIT ?`,
      [userId, limit],
    );
  }

  toMutation(r: OutboxRow): Mutation {
    return {
      mutationId: r.mutation_id,
      entity: r.entity as Mutation['entity'],
      op: r.op,
      recordId: r.record_id,
      data: parse(r.data) ?? undefined,
      base: parse(r.base) ?? undefined,
      baseVersion: r.base_version ?? undefined,
      clientTime: r.client_time,
    };
  }

  /** Record the server's answer for one queued change. */
  async handleResult(row: OutboxRow, result: MutationResult) {
    await this.db.transaction(async (tx) => {
      switch (result.status) {
        case 'applied': {
          await tx.run('DELETE FROM outbox WHERE seq = ?', [row.seq]);
          if (row.op === 'resolve') {
            await this.afterResolved(tx, row, result);
          } else if (result.record) {
            await this.applyServer(tx, row.entity, result.record);
          }
          await this.rebase(tx, row.entity, row.record_id);
          break;
        }
        case 'conflict': {
          if (row.op === 'resolve') {
            // The record changed again while deciding; the conflict now shows the newest copy.
            await tx.run('DELETE FROM outbox WHERE seq = ?', [row.seq]);
          } else {
            await tx.run("UPDATE outbox SET status = 'conflict', conflict_id = ?, error_code = ? WHERE seq = ?", [result.conflictId ?? null, result.conflictType ?? null, row.seq]);
          }
          if (result.record) {
            let entity = row.entity;
            if (row.op === 'resolve') {
              const c = await tx.first('SELECT data FROM records WHERE entity = ? AND id = ?', ['SyncConflict', row.record_id]);
              entity = c ? JSON.parse(c.data).entity : '';
            }
            if (entity) await this.applyServer(tx, entity, result.record);
          }
          await this.rebase(tx, row.entity, row.record_id);
          break;
        }
        case 'rejected':
          await tx.run("UPDATE outbox SET status = 'rejected', error = ?, error_code = ? WHERE seq = ?", [result.error ?? null, result.errorCode ?? null, row.seq]);
          await this.rebase(tx, row.entity, row.record_id);
          break;
        case 'blocked':
          await tx.run("UPDATE outbox SET status = 'blocked', attempts = attempts + 1, error = ? WHERE seq = ?", [result.error ?? null, row.seq]);
          break;
        case 'retry':
          await tx.run('UPDATE outbox SET attempts = attempts + 1, error = ? WHERE seq = ?', [result.error ?? null, row.seq]);
          break;
      }
    });
  }

  /**
   * A conflict was resolved on the server. Remove the change that caused it.
   * For a duplicate new record the user did not keep as new, the local copy and
   * any later edits to it are dropped (the existing server record stays).
   */
  private async afterResolved(tx: LocalDb, row: OutboxRow, result: MutationResult) {
    const conflict = result.record as Row | undefined;
    if (conflict) await this.applyServer(tx, 'SyncConflict', conflict);
    const original = await tx.first<OutboxRow>('SELECT * FROM outbox WHERE conflict_id = ?', [row.record_id]);
    if (!original) return;
    await tx.run('DELETE FROM outbox WHERE seq = ?', [original.seq]);
    const droppedNewRecord = original.op === 'create' && conflict?.resolution !== 'saved_as_new';
    if (droppedNewRecord) {
      await tx.run('DELETE FROM outbox WHERE entity = ? AND record_id = ?', [original.entity, original.record_id]);
      await tx.run('DELETE FROM records WHERE entity = ? AND id = ? AND server IS NULL', [original.entity, original.record_id]);
    }
    await this.rebase(tx, original.entity, original.record_id);
  }
}
