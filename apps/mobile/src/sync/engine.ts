import type { Mutation, PullResponse, PushResponse } from '@dairy/shared';
import type { LocalDb } from './db-types';
import type { LocalRepo } from './repo';

export interface SyncApi {
  push(mutations: Mutation[]): Promise<PushResponse>;
  pull(cursor: string): Promise<PullResponse>;
  /** Upload one photo's bytes; resolves true when the server has it. */
  upload?(attachmentId: string, localUri: string, contentType: string): Promise<boolean>;
}

/** Thrown by the API client when the phone cannot reach the server. */
export class OfflineError extends Error {}
/** Thrown by the API client when the login is no longer valid. */
export class AuthError extends Error {}

export interface SyncStatus {
  phase: 'idle' | 'syncing' | 'offline' | 'error' | 'login_required';
  pending: number;
  conflicts: number;
  rejected: number;
  uploads: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

/**
 * Sends the outbox, downloads changes, uploads photos. Safe to call often:
 * only one run happens at a time and every step can be repeated without harm.
 */
export class SyncEngine {
  private running: Promise<void> | null = null;
  private again = false;
  private listeners = new Set<(s: SyncStatus) => void>();
  status: SyncStatus = { phase: 'idle', pending: 0, conflicts: 0, rejected: 0, uploads: 0, lastSyncAt: null, lastError: null };

  constructor(private db: LocalDb, private repo: LocalRepo, private api: SyncApi, private userId: () => string | null) {}

  subscribe(fn: (s: SyncStatus) => void) {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private async emit(patch: Partial<SyncStatus> = {}) {
    const counts = await this.repo.counts();
    const lastSyncAt = await this.repo.getMeta('lastSyncAt');
    this.status = { ...this.status, ...counts, lastSyncAt, ...patch };
    this.listeners.forEach((l) => l(this.status));
  }

  /** Refresh counts after a local change without syncing. */
  refresh() {
    return this.emit();
  }

  sync(): Promise<void> {
    if (this.running) {
      this.again = true; // something changed mid-sync: run once more afterwards
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.runOnce();
        } while (this.again);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async runOnce() {
    const userId = this.userId();
    if (!userId) return;
    await this.emit({ phase: 'syncing' });
    try {
      await this.pushAll(userId);
      await this.pullAll();
      // Records pulled may unblock photo uploads and conflict resolutions.
      await this.pushAll(userId);
      await this.uploadAll(userId);
      await this.repo.setMeta('lastSyncAt', new Date().toISOString());
      await this.emit({ phase: 'idle', lastError: null });
    } catch (e) {
      if (e instanceof OfflineError) await this.emit({ phase: 'offline', lastError: null });
      else if (e instanceof AuthError) await this.emit({ phase: 'login_required', lastError: e.message });
      else await this.emit({ phase: 'error', lastError: (e as Error).message });
    } finally {
      this.repo.notify();
    }
  }

  private async pushAll(userId: string) {
    for (let round = 0; round < 20; round++) {
      const rows = await this.repo.sendable(userId, 100);
      if (!rows.length) return;
      const { results } = await this.api.push(rows.map((r) => this.repo.toMutation(r)));
      const byId = new Map(results.map((r) => [r.mutationId, r]));
      let progressed = false;
      for (const row of rows) {
        const result = byId.get(row.mutation_id);
        if (!result) continue;
        await this.repo.handleResult(row, result);
        if (result.status !== 'retry' && result.status !== 'blocked') progressed = true;
      }
      if (!progressed) return; // server problem or waiting on a conflict: try next time
    }
  }

  private async pullAll(): Promise<void> {
    let cursor = (await this.repo.getMeta('cursor')) ?? '0';
    const knownKey = await this.repo.getMeta('accessKey');
    for (let page = 0; page < 1000; page++) {
      const res = await this.api.pull(cursor);
      if (res.accessKey !== knownKey && cursor !== '0') {
        // Permissions changed: download everything again so nothing is missing or left over.
        await this.db.transaction(async (tx) => {
          await tx.run('DELETE FROM records');
          await this.repo.setMeta('cursor', '0', tx);
          await this.repo.setMeta('accessKey', res.accessKey, tx);
        });
        return this.pullAll().then(() => this.rebaseOutbox());
      }
      await this.db.transaction(async (tx) => {
        for (const c of res.changes) await this.repo.applyServer(tx, c.entity, c.record);
        await this.repo.setMeta('cursor', res.cursor, tx);
        await this.repo.setMeta('accessKey', res.accessKey, tx);
      });
      cursor = res.cursor;
      if (!res.hasMore) return;
    }
  }

  /** Make unsent local records visible again after a full re-download. */
  private async rebaseOutbox() {
    const rows = await this.db.all<{ entity: string; record_id: string }>('SELECT DISTINCT entity, record_id FROM outbox');
    await this.db.transaction(async (tx) => {
      for (const r of rows) await this.repo.rebase(tx, r.entity, r.record_id);
    });
  }

  private async uploadAll(userId: string) {
    if (!this.api.upload) return;
    const pending = await this.db.all<{ attachment_id: string; local_uri: string; content_type: string }>(
      `SELECT u.* FROM uploads u JOIN records r ON r.entity = 'Attachment' AND r.id = u.attachment_id
       WHERE u.status = 'pending' AND u.user_id = ? AND r.server IS NOT NULL`,
      [userId],
    );
    for (const u of pending) {
      const ok = await this.api.upload(u.attachment_id, u.local_uri, u.content_type);
      await this.db.run(
        ok ? "UPDATE uploads SET status = 'done', error = NULL WHERE attachment_id = ?" : 'UPDATE uploads SET attempts = attempts + 1 WHERE attachment_id = ?',
        [u.attachment_id],
      );
    }
  }

  /** Queue a photo file for upload once its Attachment record reaches the server. */
  async queueUpload(userId: string, attachmentId: string, localUri: string, contentType: string) {
    await this.db.run('INSERT OR REPLACE INTO uploads (attachment_id, user_id, local_uri, content_type) VALUES (?, ?, ?, ?)', [attachmentId, userId, localUri, contentType]);
  }
}
