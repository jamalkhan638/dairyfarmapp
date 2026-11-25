/** Shared sync protocol between the app's offline outbox and the server. */

export const SYNC_ENTITIES = [
  'Animal', 'AnimalStatusChange', 'Attachment', 'MilkRecord', 'MilkUsage',
  'Customer', 'CustomerRate', 'MilkDelivery', 'CustomerPayment',
  'Supplier', 'FeedItem', 'FeedPurchase', 'SupplierPayment', 'FeedConsumption', 'StockAdjustment',
  'Expense', 'CapitalEntry', 'FarmSettings',
] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

/** Read-only entities the server sends to the app (never pushed). */
export const PULL_ONLY_ENTITIES = ['User', 'SyncConflict'] as const;
export type PullEntity = SyncEntity | (typeof PULL_ONLY_ENTITIES)[number];

export type MutationOp = 'create' | 'update' | 'delete' | 'resolve';

export interface Mutation {
  /** Unique per change, generated on the phone. Re-sending it is harmless. */
  mutationId: string;
  entity: SyncEntity | 'SyncConflict';
  op: MutationOp;
  recordId: string;
  /** create: all fields. update: only changed fields. resolve: ResolveData. */
  data?: Record<string, unknown>;
  /** update/delete: the values of the changed fields before this edit (what the phone last saw). */
  base?: Record<string, unknown>;
  /** update/delete: the record version the phone last saw. */
  baseVersion?: number;
  /** When the user saved it on the phone (ISO string). */
  clientTime: string;
}

export type ConflictType = 'DUPLICATE' | 'EDIT' | 'EDIT_DELETED' | 'DELETE_EDITED';

/**
 * applied  - saved on the server
 * conflict - not saved; someone else changed the same data. A SyncConflict was created.
 * rejected - not saved and will not be retried (no permission, invalid data). User decides.
 * blocked  - not processed because an earlier change to the same record is unresolved.
 * retry    - temporary server problem; the phone keeps it and tries again later.
 */
export type MutationStatus = 'applied' | 'conflict' | 'rejected' | 'blocked' | 'retry';

export interface MutationResult {
  mutationId: string;
  status: MutationStatus;
  /** The record as it now is on the server (applied) or the server's copy (conflict). */
  record?: Record<string, unknown> | null;
  conflictId?: string;
  conflictType?: ConflictType;
  /** For rejected: a machine-readable reason code plus a message. */
  errorCode?: string;
  error?: string;
}

export interface PushRequest {
  mutations: Mutation[];
}
export interface PushResponse {
  results: MutationResult[];
}

export interface PullResponse {
  changes: { entity: PullEntity; record: Record<string, unknown> }[];
  cursor: string;
  hasMore: boolean;
  /** Changes when the user's permissions change; the app then re-downloads everything. */
  accessKey: string;
}

export type ResolveAction = 'keep_theirs' | 'use_mine' | 'custom';
export interface ResolveData {
  action: ResolveAction;
  /** For use_mine/custom: the field values to apply to the server record. */
  values?: Record<string, unknown>;
  /** The server version shown to the user when they decided. */
  theirsVersion?: number;
}

/** Fields every synced record carries. Set by the server, never by the user. */
export const SYSTEM_FIELDS = [
  'id',
  'version',
  'createdById',
  'createdAt',
  'clientCreatedAt',
  'updatedById',
  'updatedAt',
  'clientUpdatedAt',
  'deletedAt',
  'deletedById',
] as const;

export interface SystemFields {
  id: string;
  version: number;
  createdById: string;
  createdAt: string;
  clientCreatedAt: string | null;
  updatedById: string;
  updatedAt: string;
  clientUpdatedAt: string | null;
  deletedAt: string | null;
  deletedById: string | null;
}
