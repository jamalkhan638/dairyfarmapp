import { diff } from '../audit/audit.service';
import type { Tx } from '../prisma/prisma.service';
import type { EntityContext, Row } from '../sync/entity-registry';
import { RejectError } from './errors';

/**
 * A cash sale or cash purchase is two records: the sale/purchase and the payment.
 * The server creates the payment (with the id the phone chose) and keeps it equal
 * to its parent: same amount and date, deleted together.
 */
export interface LinkedPaymentSpec {
  entity: 'CustomerPayment' | 'SupplierPayment';
  delegate(tx: Tx): any;
  /** customerId / supplierId, same name on parent and payment. */
  partyField: string;
  /** Field on the payment pointing to its parent (deliveryId / purchaseId). */
  linkField: string;
  /** Field on the parent holding the amount (amountPaisa / totalPaisa). */
  amountField: string;
  auditFields: string[];
}

export async function createLinkedPayment(ctx: EntityContext, spec: LinkedPaymentSpec, parent: Row) {
  const now = new Date(ctx.mutation.clientTime);
  if (await spec.delegate(ctx.tx).findUnique({ where: { id: parent.cashPaymentId } })) throw new RejectError('id_exists', 'Payment id already used');
  const p = await spec.delegate(ctx.tx).create({
    data: {
      id: parent.cashPaymentId,
      [spec.partyField]: parent[spec.partyField],
      date: parent.date,
      amountPaisa: parent[spec.amountField],
      method: 'CASH',
      [spec.linkField]: parent.id,
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
      clientCreatedAt: now,
      clientUpdatedAt: now,
    },
  });
  await ctx.audit(spec.entity, p.id, 'CREATE', diff(null, p, spec.auditFields));
  await ctx.feed(spec.entity, p.id);
}

export async function syncLinkedPayment(ctx: EntityContext, spec: LinkedPaymentSpec, parent: Row, deleted: boolean) {
  if (!parent.cashPaymentId) return;
  const d = spec.delegate(ctx.tx);
  const p = await d.findUnique({ where: { id: parent.cashPaymentId } });
  if (!p || p.deletedAt) return;
  const now = new Date(ctx.mutation.clientTime);
  if (deleted) {
    const u = await d.update({
      where: { id: p.id },
      data: { deletedAt: new Date(), deletedById: ctx.user.id, updatedById: ctx.user.id, version: { increment: 1 }, clientUpdatedAt: now },
    });
    await ctx.audit(spec.entity, p.id, 'DELETE', { deletedAt: { from: null, to: u.deletedAt.toISOString() } });
  } else {
    const amount = parent[spec.amountField];
    if (p.amountPaisa === amount && p.date === parent.date) return;
    const u = await d.update({
      where: { id: p.id },
      data: { amountPaisa: amount, date: parent.date, updatedById: ctx.user.id, version: { increment: 1 }, clientUpdatedAt: now },
    });
    await ctx.audit(spec.entity, p.id, 'UPDATE', diff(p, u, ['amountPaisa', 'date']));
  }
  await ctx.feed(spec.entity, p.id);
}

/** The linked payment can't be changed on its own: change its sale/purchase instead. */
export function refuseManagedPayment(linkField: string, what: string) {
  return {
    validate(existing: Row | null) {
      if (existing?.[linkField]) throw new RejectError('managed', `This payment belongs to a cash ${what}. Change the ${what} instead.`);
    },
    beforeDelete(record: Row) {
      if (record[linkField]) throw new RejectError('managed', `This payment belongs to a cash ${what}. Delete the ${what} instead.`);
    },
  };
}

export function notInFuture(date: string, today: string) {
  if (date > today) throw new RejectError('invalid', 'Date cannot be in the future');
}
