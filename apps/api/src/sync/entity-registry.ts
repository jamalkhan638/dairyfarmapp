import type { Action, ModuleName, Mutation, SyncEntity } from '@dairy/shared';
import type { ZodType } from 'zod';
import type { AuthUser } from '../common/auth-user';
import type { Tx } from '../prisma/prisma.service';
import type { Changes } from '../audit/audit.service';

export type Row = Record<string, any>;

/** What an entity's hooks get while a mutation is being applied. */
export interface EntityContext {
  tx: Tx;
  user: AuthUser;
  mutation: Mutation;
  /** Write a history entry for a side-effect change (e.g. derived animal status). */
  audit(entity: string, recordId: string, action: 'CREATE' | 'UPDATE' | 'DELETE', changes: Changes): Promise<void>;
  /** Tell phones a record changed. */
  feed(entity: string, recordId: string): Promise<void>;
}

/**
 * How one kind of record is validated, permission-checked and saved through sync.
 * Each feature module (animals, milk, ...) registers its definitions here.
 */
export interface EntityDef {
  name: SyncEntity;
  /** Which permission module controls this record. */
  moduleFor(record: Row): ModuleName;
  /** Permission needed for each operation; an array means any one of them is enough. */
  actions: { create: Action | Action[]; update: Action | Action[]; delete: Action | Action[] };
  delegate(tx: Tx): any;
  createSchema: ZodType<any>;
  /** null = records cannot be edited after creation. */
  updateSchema: ZodType<any> | null;
  /** User-visible fields: shown in history and compared for conflicts. */
  fields: string[];
  canDelete: boolean;
  /** Turn validated create input into database columns. */
  prepareCreate?(ctx: EntityContext, input: Row, id: string): Promise<Row> | Row;
  /** Throw RejectError if the values are not allowed (e.g. parent missing). */
  validate?(ctx: EntityContext, values: Row, existing: Row | null): Promise<void>;
  /** Another live record with the same business key (e.g. same ear tag), if any. */
  findDuplicate?(tx: Tx, values: Row, selfId: string): Promise<Row | null>;
  /** Fields that make up the duplicate key; only re-checked when one of them changes. */
  duplicateKeyFields?: string[];
  afterCreate?(ctx: EntityContext, record: Row, input: Row): Promise<void>;
  afterUpdate?(ctx: EntityContext, record: Row, before: Row): Promise<void>;
  afterDelete?(ctx: EntityContext, record: Row): Promise<void>;
  /** Remove server-only fields before sending to phones. */
  hiddenFields?: string[];
}

const defs = new Map<string, EntityDef>();

export const EntityRegistry = {
  register(def: EntityDef) {
    defs.set(def.name, def);
  },
  get(name: string): EntityDef | undefined {
    return defs.get(name);
  },
  all(): EntityDef[] {
    return [...defs.values()];
  },
};

/** Dates to ISO strings, server-only fields removed. */
export function toClient(record: Row, hidden: string[] = []): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(record)) {
    if (hidden.includes(k)) continue;
    if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v) && k !== 'mine' && k !== 'theirs') continue; // skip relations
    out[k] = v instanceof Date ? v.toISOString() : typeof v === 'bigint' ? Number(v) : v;
  }
  return out;
}
