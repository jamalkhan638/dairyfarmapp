import { Injectable } from '@nestjs/common';
import type { AuditEntry } from '@dairy/shared';
import type { AuditAction } from '../generated/prisma/client';
import { PrismaService, type Tx } from '../prisma/prisma.service';

export type Changes = Record<string, { from: unknown; to: unknown }>;

/** Normalise a value for comparing and storing in history. */
export function plain(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return Number(v);
  return v;
}

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(plain(a)) === JSON.stringify(plain(b));
}

/** Field-by-field differences between two versions of a record. */
export function diff(before: Record<string, unknown> | null, after: Record<string, unknown>, fields: string[]): Changes {
  const out: Changes = {};
  for (const f of fields) {
    const from = before ? plain(before[f]) : null;
    const to = plain(after[f]);
    if (!sameValue(from, to)) out[f] = { from, to };
  }
  return out;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async record(
    tx: Tx,
    e: { entity: string; recordId: string; action: AuditAction; userId: string; changes: Changes; clientTime?: string | null; mutationId?: string | null },
  ) {
    await tx.auditLog.create({
      data: {
        entity: e.entity,
        recordId: e.recordId,
        action: e.action,
        userId: e.userId,
        changes: e.changes as object,
        clientTime: e.clientTime ? new Date(e.clientTime) : null,
        mutationId: e.mutationId ?? null,
      },
    });
  }

  async history(entity: string, recordId: string): Promise<AuditEntry[]> {
    const rows = await this.prisma.auditLog.findMany({ where: { entity, recordId }, orderBy: { id: 'asc' } });
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } });
    const names = new Map(users.map((u) => [u.id, u.name]));
    return rows.map((r) => ({
      id: String(r.id),
      action: r.action,
      userId: r.userId,
      userName: names.get(r.userId) ?? 'Unknown user',
      at: r.at.toISOString(),
      clientTime: r.clientTime?.toISOString() ?? null,
      changes: r.changes as AuditEntry['changes'],
    }));
  }
}
