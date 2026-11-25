import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import {
  can,
  SYNC_ENTITIES,
  type Action,
  type ConflictType,
  type Mutation,
  type MutationResult,
  type PullResponse,
  type ResolveData,
} from '@dairy/shared';
import type { AuthUser } from '../common/auth-user';
import { RejectError } from '../common/errors';
import { parseMutationData } from '../common/zod';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService, diff, plain, sameValue } from '../audit/audit.service';
import { canView, EntityRegistry, toClient, type EntityContext, type EntityDef, type Row } from './entity-registry';
import { SyncFeed } from './sync-feed';

const mutationSchema = z.object({
  mutationId: z.uuid(),
  entity: z.enum([...SYNC_ENTITIES, 'SyncConflict']),
  op: z.enum(['create', 'update', 'delete', 'resolve']),
  recordId: z.uuid(),
  data: z.record(z.string(), z.unknown()).optional(),
  base: z.record(z.string(), z.unknown()).optional(),
  baseVersion: z.number().int().optional(),
  clientTime: z.iso.datetime({ offset: true }),
});

const resolveSchema = z.object({
  action: z.enum(['keep_theirs', 'use_mine', 'custom']),
  values: z.record(z.string(), z.unknown()).optional(),
  theirsVersion: z.number().int().optional(),
});

const PUBLIC_USER_FIELDS = ['id', 'name', 'username', 'role', 'active', 'version', 'createdAt', 'updatedAt'];

@Injectable()
export class SyncService {
  private log = new Logger('Sync');

  constructor(private prisma: PrismaService, private auditService: AuditService) {}

  // ---------------- push ----------------

  async push(user: AuthUser, rawMutations: unknown[]): Promise<MutationResult[]> {
    const results: MutationResult[] = [];
    /** Records with an unresolved problem in this batch: later changes to them wait. */
    const held = new Set<string>();

    for (const raw of rawMutations) {
      const parsed = mutationSchema.safeParse(raw);
      if (!parsed.success) {
        const id = (raw as any)?.mutationId ?? 'unknown';
        results.push({ mutationId: String(id), status: 'rejected', errorCode: 'invalid', error: 'Malformed change' });
        continue;
      }
      const m = parsed.data as Mutation;
      if (held.has(m.recordId)) {
        results.push({ mutationId: m.mutationId, status: 'blocked', errorCode: 'waiting', error: 'An earlier change to this record needs attention first' });
        continue;
      }
      const result = await this.processOne(user, m);
      results.push(result);
      if (result.status !== 'applied') held.add(m.recordId);
    }
    return results;
  }

  private async processOne(user: AuthUser, m: Mutation): Promise<MutationResult> {
    const previous = await this.prisma.syncMutation.findUnique({ where: { id: m.mutationId } });
    if (previous) return this.replay(user, m, previous);

    try {
      return await this.prisma.write(async (tx) => {
        // Checked again inside the lock in case the same batch arrived twice at once.
        const again = await tx.syncMutation.findUnique({ where: { id: m.mutationId } });
        if (again) return this.replay(user, m, again);

        if (m.op !== 'resolve') {
          const open = await tx.syncConflict.findFirst({ where: { recordId: m.recordId, createdById: user.id, status: 'OPEN' } });
          if (open) {
            return { mutationId: m.mutationId, status: 'blocked', conflictId: open.id, errorCode: 'open_conflict', error: 'Resolve the open conflict for this record first' } as MutationResult;
          }
        }

        const result = await this.apply(tx, user, m);
        await tx.syncMutation.create({
          data: { id: m.mutationId, userId: user.id, entity: m.entity, recordId: m.recordId, op: m.op, result: result as object },
        });
        return result;
      });
    } catch (e) {
      if (e instanceof RejectError) {
        const result: MutationResult = { mutationId: m.mutationId, status: 'rejected', errorCode: e.code, error: e.message };
        await this.prisma.syncMutation.create({
          data: { id: m.mutationId, userId: user.id, entity: m.entity, recordId: m.recordId, op: m.op, result: result as object },
        }).catch(() => undefined);
        return result;
      }
      this.log.error(`Mutation ${m.mutationId} failed`, e as Error);
      return { mutationId: m.mutationId, status: 'retry', errorCode: 'server_error', error: 'Server problem, will try again' };
    }
  }

  /** A change the server already processed: return the same answer, never apply twice. */
  private replay(user: AuthUser, m: Mutation, prev: { userId: string; result: unknown }): MutationResult {
    if (prev.userId !== user.id) {
      return { mutationId: m.mutationId, status: 'rejected', errorCode: 'mutation_id_taken', error: 'Duplicate change id' };
    }
    return prev.result as MutationResult;
  }

  private context(tx: Tx, user: AuthUser, m: Mutation): EntityContext {
    return {
      tx,
      user,
      mutation: m,
      audit: (entity, recordId, action, changes) =>
        this.auditService.record(tx, { entity, recordId, action, userId: user.id, changes, clientTime: m.clientTime, mutationId: m.mutationId }),
      feed: (entity, recordId) => SyncFeed.add(tx, entity, recordId),
    };
  }

  private requirePermission(user: AuthUser, def: EntityDef, record: Row, needed: Action | Action[]) {
    const module = def.moduleFor(record);
    const list = Array.isArray(needed) ? needed : [needed];
    if (!list.some((a) => can(user.role, user.permissions, module, a))) {
      throw new RejectError('forbidden', `You do not have permission to ${list.join('/')} ${module}`);
    }
  }

  private def(name: string): EntityDef {
    const d = EntityRegistry.get(name);
    if (!d) throw new RejectError('invalid', `Unknown record type ${name}`);
    return d;
  }

  private async apply(tx: Tx, user: AuthUser, m: Mutation): Promise<MutationResult> {
    if (m.op === 'resolve') return this.resolve(tx, user, m);
    const def = this.def(m.entity);
    const ctx = this.context(tx, user, m);
    if (m.op === 'create') return this.applyCreate(ctx, def, m);
    if (m.op === 'update') return this.applyUpdate(ctx, def, m);
    return this.applyDelete(ctx, def, m);
  }

  private applied(m: Mutation, def: EntityDef, record: Row): MutationResult {
    return { mutationId: m.mutationId, status: 'applied', record: toClient(record, def.hiddenFields) };
  }

  private async conflict(ctx: EntityContext, def: EntityDef, type: ConflictType, theirs: Row | null, existingId?: string): Promise<MutationResult> {
    const id = randomUUID();
    const m = ctx.mutation;
    const row = await ctx.tx.syncConflict.create({
      data: {
        id,
        entity: def.name,
        recordId: m.recordId,
        type,
        mutationId: m.mutationId,
        mine: m as object,
        theirs: theirs ? (toClient(theirs, def.hiddenFields) as object) : undefined,
        theirsVersion: theirs?.version ?? null,
        existingId: existingId ?? null,
        createdById: ctx.user.id,
      },
    });
    await ctx.feed('SyncConflict', id);
    return {
      mutationId: m.mutationId,
      status: 'conflict',
      conflictId: row.id,
      conflictType: type,
      record: theirs ? toClient(theirs, def.hiddenFields) : null,
    };
  }

  private async applyCreate(ctx: EntityContext, def: EntityDef, m: Mutation): Promise<MutationResult> {
    const input = parseMutationData(def.createSchema, m.data) as Row;
    this.requirePermission(ctx.user, def, input, def.actions.create);
    const delegate = def.delegate(ctx.tx);
    if (await delegate.findUnique({ where: { id: m.recordId } })) {
      throw new RejectError('id_exists', 'A record with this id already exists');
    }
    let values = def.prepareCreate ? await def.prepareCreate(ctx, input, m.recordId) : input;
    if (def.derive) values = { ...values, ...def.derive(values) };
    if (def.validate) await def.validate(ctx, values, null);
    if (def.findDuplicate) {
      const dup = await def.findDuplicate(ctx.tx, values, m.recordId);
      if (dup) return this.conflict(ctx, def, 'DUPLICATE', dup, dup.id);
    }
    const created = await delegate.create({
      data: {
        ...values,
        id: m.recordId,
        createdById: ctx.user.id,
        updatedById: ctx.user.id,
        clientCreatedAt: new Date(m.clientTime),
        clientUpdatedAt: new Date(m.clientTime),
      },
    });
    await ctx.audit(def.name, created.id, 'CREATE', diff(null, created, def.fields));
    await ctx.feed(def.name, created.id);
    if (def.afterCreate) await def.afterCreate(ctx, created, input);
    return this.applied(m, def, await delegate.findUnique({ where: { id: created.id } }));
  }

  private async applyUpdate(ctx: EntityContext, def: EntityDef, m: Mutation, opts: { restore?: boolean } = {}): Promise<MutationResult> {
    if (!def.updateSchema) throw new RejectError('not_editable', `${def.name} records cannot be edited`);
    const delegate = def.delegate(ctx.tx);
    const current: Row | null = await delegate.findUnique({ where: { id: m.recordId } });
    if (!current) throw new RejectError('not_found', 'Record not found');
    this.requirePermission(ctx.user, def, current, def.actions.update);
    if (current.deletedAt && !opts.restore) return this.conflict(ctx, def, 'EDIT_DELETED', current);

    const parsed = parseMutationData(def.updateSchema, m.data) as Row;
    // Only fields the phone actually sent (never schema defaults).
    const sent = Object.keys(m.data ?? {}).filter((k) => k in parsed);
    const base = m.base ?? {};
    const changes: Row = {};
    const clashing: string[] = [];
    for (const f of sent) {
      const mine = parsed[f];
      if (sameValue(current[f], mine)) continue; // already has this value
      const unchangedSinceBase = f in base ? sameValue(current[f], base[f]) : m.baseVersion === current.version;
      if (unchangedSinceBase) changes[f] = mine;
      else clashing.push(f);
    }
    // Someone else changed one of the same fields since this phone last saw it.
    if (clashing.length) return this.conflict(ctx, def, 'EDIT', current);
    if (!Object.keys(changes).length && !opts.restore) return this.applied(m, def, current);

    if (def.derive) {
      const derived = def.derive({ ...current, ...changes });
      for (const [k, v] of Object.entries(derived)) if (!sameValue(current[k], v)) changes[k] = v;
    }
    const merged = { ...current, ...changes };
    if (def.validate) await def.validate(ctx, merged, current);
    const keyChanged = (def.duplicateKeyFields ?? []).some((f) => f in changes) || opts.restore;
    if (def.findDuplicate && keyChanged) {
      const dup = await def.findDuplicate(ctx.tx, merged, current.id);
      if (dup) return this.conflict(ctx, def, 'DUPLICATE', dup, dup.id);
    }
    const updated = await delegate.update({
      where: { id: current.id },
      data: {
        ...changes,
        ...(opts.restore ? { deletedAt: null, deletedById: null } : {}),
        version: { increment: 1 },
        updatedById: ctx.user.id,
        clientUpdatedAt: new Date(m.clientTime),
      },
    });
    const fieldsChanged = opts.restore ? [...Object.keys(changes), 'deletedAt'] : Object.keys(changes);
    await ctx.audit(def.name, current.id, 'UPDATE', diff(current, updated, fieldsChanged));
    await ctx.feed(def.name, current.id);
    if (def.afterUpdate) await def.afterUpdate(ctx, updated, current);
    return this.applied(m, def, await delegate.findUnique({ where: { id: current.id } }));
  }

  private async applyDelete(ctx: EntityContext, def: EntityDef, m: Mutation, opts: { force?: boolean } = {}): Promise<MutationResult> {
    if (!def.canDelete) throw new RejectError('not_deletable', `${def.name} records cannot be deleted`);
    const delegate = def.delegate(ctx.tx);
    const current: Row | null = await delegate.findUnique({ where: { id: m.recordId } });
    if (!current) throw new RejectError('not_found', 'Record not found');
    this.requirePermission(ctx.user, def, current, def.actions.delete);
    if (current.deletedAt) return this.applied(m, def, current);
    if (def.beforeDelete) await def.beforeDelete(ctx, current);

    if (!opts.force && current.version !== m.baseVersion) {
      // Deleting is only safe if nobody changed what this user saw before deleting.
      const base = m.base ?? {};
      const changedSince = Object.keys(base).length === 0 || def.fields.some((f) => f in base && !sameValue(current[f], base[f]));
      if (changedSince) return this.conflict(ctx, def, 'DELETE_EDITED', current);
    }
    const deleted = await delegate.update({
      where: { id: current.id },
      data: { deletedAt: new Date(), deletedById: ctx.user.id, updatedById: ctx.user.id, version: { increment: 1 }, clientUpdatedAt: new Date(m.clientTime) },
    });
    await ctx.audit(def.name, current.id, 'DELETE', { deletedAt: { from: null, to: plain(deleted.deletedAt) } });
    await ctx.feed(def.name, current.id);
    if (def.afterDelete) await def.afterDelete(ctx, deleted);
    return this.applied(m, def, deleted);
  }

  // ---------------- conflict resolution ----------------

  private async resolve(tx: Tx, user: AuthUser, m: Mutation): Promise<MutationResult> {
    const conflict = await tx.syncConflict.findUnique({ where: { id: m.recordId } });
    if (!conflict) throw new RejectError('not_found', 'Conflict not found');
    const asRecord = (c: Row): MutationResult => ({ mutationId: m.mutationId, status: 'applied', record: toClient(c) });
    if (conflict.status === 'RESOLVED') return asRecord(conflict);
    if (conflict.createdById !== user.id && user.role !== 'OWNER') {
      throw new RejectError('forbidden', 'Only the person who made the change or the owner can resolve this');
    }
    const data = parseMutationData(resolveSchema, m.data) as ResolveData;
    const def = this.def(conflict.entity);
    const mine = conflict.mine as unknown as Mutation;
    const ctx = this.context(tx, user, m);

    const finish = async (resolution: string) => {
      const done = await tx.syncConflict.update({
        where: { id: conflict.id },
        data: { status: 'RESOLVED', resolution, resolvedById: user.id, resolvedAt: new Date(), version: { increment: 1 } },
      });
      await this.auditService.record(tx, {
        entity: 'SyncConflict', recordId: conflict.id, action: 'CONFLICT_RESOLVED', userId: user.id,
        changes: { resolution: { from: null, to: resolution } }, clientTime: m.clientTime, mutationId: m.mutationId,
      });
      await ctx.feed('SyncConflict', conflict.id);
      return asRecord(done);
    };

    if (data.action === 'keep_theirs') return finish('keep_theirs');

    const values = data.action === 'use_mine' ? (mine.data ?? {}) : (data.values ?? {});
    const subMutation = (over: Partial<Mutation>): Mutation => ({ ...m, entity: def.name, ...over });

    // DUPLICATE from a create: "custom" saves my record with changed values (e.g. a different tag).
    if (conflict.type === 'DUPLICATE' && mine.op === 'create' && data.action === 'custom') {
      const sub = subMutation({ op: 'create', recordId: conflict.recordId, data: { ...(mine.data ?? {}), ...values } });
      const r = await this.applyCreate(this.context(tx, user, sub), def, sub);
      if (r.status !== 'applied') {
        await finish('superseded');
        return r;
      }
      return finish('saved_as_new');
    }

    // Everything else changes the server's record, so the user must have seen its latest version.
    const targetId = conflict.type === 'DUPLICATE' ? conflict.existingId! : conflict.recordId;
    const current: Row | null = await def.delegate(tx).findUnique({ where: { id: targetId } });
    if (!current) throw new RejectError('not_found', 'Record not found');
    if (data.theirsVersion !== current.version) {
      // The record changed again while they were deciding: show them the newest copy.
      const refreshed = await tx.syncConflict.update({
        where: { id: conflict.id },
        data: { theirs: toClient(current, def.hiddenFields) as object, theirsVersion: current.version, version: { increment: 1 } },
      });
      await ctx.feed('SyncConflict', conflict.id);
      return { mutationId: m.mutationId, status: 'conflict', conflictId: refreshed.id, conflictType: conflict.type, record: toClient(current, def.hiddenFields) };
    }

    if (conflict.type === 'DELETE_EDITED') {
      const sub = subMutation({ op: 'delete', recordId: targetId });
      await this.applyDelete(this.context(tx, user, sub), def, sub, { force: true });
      return finish(data.action);
    }

    const editable = Object.fromEntries(Object.entries(values).filter(([k]) => def.fields.includes(k)));
    const base = Object.fromEntries(Object.keys(editable).map((k) => [k, current[k]]));
    const sub = subMutation({ op: 'update', recordId: targetId, data: editable, base, baseVersion: current.version });
    const r = await this.applyUpdate(this.context(tx, user, sub), def, sub, { restore: conflict.type === 'EDIT_DELETED' });
    if (r.status !== 'applied') {
      await finish('superseded');
      return r;
    }
    return finish(data.action);
  }

  // ---------------- pull ----------------

  async pull(user: AuthUser, cursor: string, limit: number): Promise<PullResponse> {
    const after = BigInt(/^\d+$/.test(cursor) ? cursor : '0');
    const feed = await this.prisma.syncChange.findMany({ where: { seq: { gt: after } }, orderBy: { seq: 'asc' }, take: limit });
    const newCursor = feed.length ? feed[feed.length - 1].seq.toString() : after.toString();

    // Latest occurrence of each record decides its position in the response.
    const order = new Map<string, { entity: string; id: string }>();
    for (const c of feed) {
      const key = `${c.entity}:${c.recordId}`;
      order.delete(key);
      order.set(key, { entity: c.entity, id: c.recordId });
    }
    const byEntity = new Map<string, string[]>();
    for (const { entity, id } of order.values()) byEntity.set(entity, [...(byEntity.get(entity) ?? []), id]);

    const loaded = new Map<string, Row>();
    for (const [entity, ids] of byEntity) {
      for (const r of await this.loadVisible(user, entity, ids)) loaded.set(`${entity}:${r.id}`, r);
    }
    const changes: PullResponse['changes'] = [];
    for (const [key, { entity }] of order) {
      const r = loaded.get(key);
      if (r) changes.push({ entity: entity as any, record: r });
    }
    return { changes, cursor: newCursor, hasMore: feed.length === limit, accessKey: `${user.id}:${user.accessVersion}` };
  }

  private async loadVisible(user: AuthUser, entity: string, ids: string[]): Promise<Row[]> {
    if (entity === 'User') {
      const users = await this.prisma.user.findMany({ where: { id: { in: ids } } });
      return users.map((u) => toClient(Object.fromEntries(PUBLIC_USER_FIELDS.map((f) => [f, (u as Row)[f]]))));
    }
    if (entity === 'SyncConflict') {
      const rows = await this.prisma.syncConflict.findMany({
        where: { id: { in: ids }, ...(user.role === 'OWNER' ? {} : { createdById: user.id }) },
      });
      return rows.map((r) => toClient(r));
    }
    const def = EntityRegistry.get(entity);
    if (!def) return [];
    const rows: Row[] = await def.delegate(this.prisma as unknown as Tx).findMany({ where: { id: { in: ids } } });
    return rows
      .filter((r) => canView(def, r, (m) => can(user.role, user.permissions, m, 'view')))
      .map((r) => toClient(r, def.hiddenFields));
  }
}
