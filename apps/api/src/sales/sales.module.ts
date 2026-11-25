import { Module, OnModuleInit } from '@nestjs/common';
import {
  customerCreate, customerPaymentCreate, customerPaymentUpdate, customerRateCreate, customerRateUpdate, customerUpdate,
  farmToday, milkDeliveryCreate, milkDeliveryUpdate, saleAmountPaisa,
} from '@dairy/shared';
import { RejectError } from '../common/errors';
import { diff } from '../audit/audit.service';
import type { Tx } from '../prisma/prisma.service';
import { EntityRegistry, type EntityContext, type Row } from '../sync/entity-registry';

const PAYMENT_FIELDS = ['customerId', 'date', 'amountPaisa', 'method', 'deliveryId', 'note'];

function notInFuture(date: string) {
  if (date > farmToday()) throw new RejectError('invalid', 'Date cannot be in the future');
}

async function requireCustomer(tx: Tx, id: string) {
  const c = await tx.customer.findUnique({ where: { id } });
  if (!c || c.deletedAt) throw new RejectError('not_found', 'Customer not found');
  return c;
}

/** Keep the payment of a cash sale equal to the sale (same amount and date), or remove it with the sale. */
async function syncCashPayment(ctx: EntityContext, delivery: Row, deleted: boolean) {
  if (!delivery.cashPaymentId) return;
  const p = await ctx.tx.customerPayment.findUnique({ where: { id: delivery.cashPaymentId } });
  if (!p || p.deletedAt) return;
  const now = new Date(ctx.mutation.clientTime);
  if (deleted) {
    const d = await ctx.tx.customerPayment.update({
      where: { id: p.id },
      data: { deletedAt: new Date(), deletedById: ctx.user.id, updatedById: ctx.user.id, version: { increment: 1 }, clientUpdatedAt: now },
    });
    await ctx.audit('CustomerPayment', p.id, 'DELETE', { deletedAt: { from: null, to: d.deletedAt!.toISOString() } });
  } else {
    if (p.amountPaisa === delivery.amountPaisa && p.date === delivery.date) return;
    const u = await ctx.tx.customerPayment.update({
      where: { id: p.id },
      data: { amountPaisa: delivery.amountPaisa, date: delivery.date, updatedById: ctx.user.id, version: { increment: 1 }, clientUpdatedAt: now },
    });
    await ctx.audit('CustomerPayment', p.id, 'UPDATE', diff(p, u, ['amountPaisa', 'date']));
  }
  await ctx.feed('CustomerPayment', p.id);
}

/** Customers, their rates, milk deliveries (cash or credit) and payments received. */
@Module({})
export class SalesModule implements OnModuleInit {
  onModuleInit() {
    EntityRegistry.register({
      name: 'Customer',
      moduleFor: () => 'sales',
      actions: { create: 'add', update: 'edit', delete: 'delete' },
      delegate: (tx) => tx.customer,
      createSchema: customerCreate,
      updateSchema: customerUpdate,
      fields: ['name', 'phone', 'address', 'notes', 'defaultSaleType', 'active'],
      canDelete: true,
      duplicateKeyFields: ['name'],
      findDuplicate: (tx, v, selfId) => tx.customer.findFirst({ where: { name: { equals: v.name, mode: 'insensitive' }, deletedAt: null, id: { not: selfId } } }),
      beforeDelete: async (ctx, c) => {
        const used = (await ctx.tx.milkDelivery.count({ where: { customerId: c.id, deletedAt: null } })) + (await ctx.tx.customerPayment.count({ where: { customerId: c.id, deletedAt: null } }));
        if (used) throw new RejectError('in_use', 'This customer has deliveries or payments. Mark the customer inactive instead.');
      },
    });

    EntityRegistry.register({
      name: 'CustomerRate',
      moduleFor: () => 'sales',
      actions: { create: 'edit', update: 'edit', delete: 'edit' },
      delegate: (tx) => tx.customerRate,
      createSchema: customerRateCreate,
      updateSchema: customerRateUpdate,
      fields: ['customerId', 'ratePaisaPerLitre', 'effectiveFrom', 'note'],
      canDelete: true,
      duplicateKeyFields: ['customerId', 'effectiveFrom'],
      validate: async (ctx, v) => {
        await requireCustomer(ctx.tx, v.customerId);
      },
      findDuplicate: (tx, v, selfId) => tx.customerRate.findFirst({ where: { customerId: v.customerId, effectiveFrom: v.effectiveFrom, deletedAt: null, id: { not: selfId } } }),
    });

    EntityRegistry.register({
      name: 'MilkDelivery',
      moduleFor: () => 'sales',
      actions: { create: 'add', update: 'edit', delete: 'delete' },
      delegate: (tx) => tx.milkDelivery,
      createSchema: milkDeliveryCreate,
      updateSchema: milkDeliveryUpdate,
      fields: ['customerId', 'date', 'session', 'quantityMl', 'ratePaisaPerLitre', 'amountPaisa', 'saleType', 'cashPaymentId', 'note'],
      canDelete: true,
      duplicateKeyFields: ['customerId', 'date', 'session'],
      derive: (v) => ({ amountPaisa: saleAmountPaisa(v.quantityMl, v.ratePaisaPerLitre) }),
      prepareCreate: (_ctx, input) => {
        if (input.saleType === 'CASH' && !input.cashPaymentId) throw new RejectError('invalid', 'A cash sale needs a payment id');
        return { ...input, cashPaymentId: input.saleType === 'CASH' ? input.cashPaymentId : null };
      },
      validate: async (ctx, v) => {
        notInFuture(v.date);
        await requireCustomer(ctx.tx, v.customerId);
      },
      findDuplicate: (tx, v, selfId) =>
        tx.milkDelivery.findFirst({ where: { customerId: v.customerId, date: v.date, session: v.session, deletedAt: null, id: { not: selfId } } }),
      afterCreate: async (ctx, d) => {
        if (d.saleType !== 'CASH') return;
        // A cash sale is two records: the sale and the money received for it.
        const now = new Date(ctx.mutation.clientTime);
        if (await ctx.tx.customerPayment.findUnique({ where: { id: d.cashPaymentId } })) throw new RejectError('id_exists', 'Payment id already used');
        const p = await ctx.tx.customerPayment.create({
          data: {
            id: d.cashPaymentId, customerId: d.customerId, date: d.date, amountPaisa: d.amountPaisa, method: 'CASH', deliveryId: d.id,
            createdById: ctx.user.id, updatedById: ctx.user.id, clientCreatedAt: now, clientUpdatedAt: now,
          },
        });
        await ctx.audit('CustomerPayment', p.id, 'CREATE', diff(null, p, PAYMENT_FIELDS));
        await ctx.feed('CustomerPayment', p.id);
      },
      afterUpdate: (ctx, d) => syncCashPayment(ctx, d, false),
      afterDelete: (ctx, d) => syncCashPayment(ctx, d, true),
    });

    EntityRegistry.register({
      name: 'CustomerPayment',
      moduleFor: () => 'sales',
      actions: { create: 'add', update: 'edit', delete: 'delete' },
      delegate: (tx) => tx.customerPayment,
      createSchema: customerPaymentCreate,
      updateSchema: customerPaymentUpdate,
      fields: PAYMENT_FIELDS,
      canDelete: true,
      validate: async (ctx, v, existing) => {
        if (existing?.deliveryId) throw new RejectError('managed', 'This payment belongs to a cash sale. Change the sale instead.');
        notInFuture(v.date);
        await requireCustomer(ctx.tx, v.customerId);
      },
      beforeDelete: async (_ctx, p) => {
        if (p.deliveryId) throw new RejectError('managed', 'This payment belongs to a cash sale. Delete the sale instead.');
      },
    });
  }
}
