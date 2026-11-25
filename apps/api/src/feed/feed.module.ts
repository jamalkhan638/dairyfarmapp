import { Module, OnModuleInit } from '@nestjs/common';
import {
  costPerKgPaisa, farmToday, feedConsumptionCreate, feedConsumptionUpdate, feedItemCreate, feedItemUpdate,
  feedPurchaseCreate, feedPurchaseUpdate, stockAdjustmentCreate, stockAdjustmentUpdate, supplierCreate,
  supplierPaymentCreate, supplierPaymentUpdate, supplierUpdate,
} from '@dairy/shared';
import { RejectError } from '../common/errors';
import { createLinkedPayment, notInFuture, refuseManagedPayment, syncLinkedPayment, type LinkedPaymentSpec } from '../common/linked-payment';
import type { Tx } from '../prisma/prisma.service';
import { EntityRegistry } from '../sync/entity-registry';

export const SUPPLIER_PAYMENT_FIELDS = ['supplierId', 'date', 'amountPaisa', 'method', 'purchaseId', 'expenseId', 'note'];
const CASH_PURCHASE: LinkedPaymentSpec = {
  entity: 'SupplierPayment',
  delegate: (tx) => tx.supplierPayment,
  partyField: 'supplierId',
  linkField: 'purchaseId',
  amountField: 'totalPaisa',
  auditFields: SUPPLIER_PAYMENT_FIELDS,
};
const managed = refuseManagedPayment({ purchaseId: 'cash purchase', expenseId: 'paid expense' });
const today = () => farmToday();

async function requireLive(tx: Tx, model: 'supplier' | 'feedItem' | 'animal', id: string, label: string) {
  const r = await (tx[model] as any).findUnique({ where: { id } });
  if (!r || r.deletedAt) throw new RejectError('not_found', `${label} not found`);
  return r;
}

/** Feed items, suppliers, purchases (stock in), feeding and wastage (stock out), payments to suppliers. */
@Module({})
export class FeedModule implements OnModuleInit {
  onModuleInit() {
    EntityRegistry.register({
      name: 'Supplier',
      moduleFor: () => 'feed',
      alsoVisibleTo: ['expenses', 'finance'],
      actions: { create: 'add', update: 'edit', delete: 'delete' },
      delegate: (tx) => tx.supplier,
      createSchema: supplierCreate,
      updateSchema: supplierUpdate,
      fields: ['name', 'phone', 'address', 'notes', 'active'],
      canDelete: true,
      duplicateKeyFields: ['name'],
      findDuplicate: (tx, v, selfId) => tx.supplier.findFirst({ where: { name: { equals: v.name, mode: 'insensitive' }, deletedAt: null, id: { not: selfId } } }),
      beforeDelete: async (ctx, s) => {
        const where = { supplierId: s.id, deletedAt: null };
        const used = (await ctx.tx.feedPurchase.count({ where })) + (await ctx.tx.supplierPayment.count({ where })) + (await ctx.tx.expense.count({ where }));
        if (used) throw new RejectError('in_use', 'This supplier has purchases, expenses or payments. Mark the supplier inactive instead.');
      },
    });

    EntityRegistry.register({
      name: 'FeedItem',
      moduleFor: () => 'feed',
      actions: { create: 'add', update: 'edit', delete: 'delete' },
      delegate: (tx) => tx.feedItem,
      createSchema: feedItemCreate,
      updateSchema: feedItemUpdate,
      fields: ['name', 'category', 'bagWeightGrams', 'notes', 'active'],
      canDelete: true,
      duplicateKeyFields: ['name'],
      findDuplicate: (tx, v, selfId) => tx.feedItem.findFirst({ where: { name: { equals: v.name, mode: 'insensitive' }, deletedAt: null, id: { not: selfId } } }),
      beforeDelete: async (ctx, item) => {
        const where = { feedItemId: item.id, deletedAt: null };
        const used = (await ctx.tx.feedPurchase.count({ where })) + (await ctx.tx.feedConsumption.count({ where })) + (await ctx.tx.stockAdjustment.count({ where }));
        if (used) throw new RejectError('in_use', 'This feed item has purchases or feeding records. Mark it inactive instead.');
      },
    });

    EntityRegistry.register({
      name: 'FeedPurchase',
      moduleFor: () => 'feed',
      alsoVisibleTo: ['finance', 'reports'],
      actions: { create: 'add', update: 'edit', delete: 'delete' },
      delegate: (tx) => tx.feedPurchase,
      createSchema: feedPurchaseCreate,
      updateSchema: feedPurchaseUpdate,
      fields: ['feedItemId', 'supplierId', 'date', 'quantityGrams', 'bags', 'totalPaisa', 'costPerKgPaisa', 'paymentType', 'cashPaymentId', 'note'],
      canDelete: true,
      derive: (v) => ({ costPerKgPaisa: costPerKgPaisa(v.totalPaisa, v.quantityGrams) }),
      prepareCreate: (_ctx, input) => {
        const supplierId = input.supplierId ?? null;
        if (input.paymentType === 'CREDIT' && !supplierId) throw new RejectError('invalid', 'A credit purchase needs a supplier');
        // A cash purchase from a named supplier gets a payment record; without a supplier there is no balance to track.
        const needsPayment = input.paymentType === 'CASH' && !!supplierId;
        if (needsPayment && !input.cashPaymentId) throw new RejectError('invalid', 'A cash purchase needs a payment id');
        return { ...input, supplierId, cashPaymentId: needsPayment ? input.cashPaymentId : null };
      },
      validate: async (ctx, v) => {
        notInFuture(v.date, today());
        await requireLive(ctx.tx, 'feedItem', v.feedItemId, 'Feed item');
        if (v.supplierId) await requireLive(ctx.tx, 'supplier', v.supplierId, 'Supplier');
      },
      afterCreate: async (ctx, p) => {
        if (p.cashPaymentId) await createLinkedPayment(ctx, CASH_PURCHASE, p);
      },
      afterUpdate: (ctx, p) => syncLinkedPayment(ctx, CASH_PURCHASE, p, false),
      afterDelete: (ctx, p) => syncLinkedPayment(ctx, CASH_PURCHASE, p, true),
    });

    EntityRegistry.register({
      name: 'SupplierPayment',
      moduleFor: () => 'feed',
      alsoVisibleTo: ['expenses', 'finance', 'reports'],
      actions: { create: 'add', update: 'edit', delete: 'delete' },
      delegate: (tx) => tx.supplierPayment,
      createSchema: supplierPaymentCreate,
      updateSchema: supplierPaymentUpdate,
      fields: SUPPLIER_PAYMENT_FIELDS,
      canDelete: true,
      validate: async (ctx, v, existing) => {
        managed.validate(existing);
        notInFuture(v.date, today());
        await requireLive(ctx.tx, 'supplier', v.supplierId, 'Supplier');
      },
      beforeDelete: async (_ctx, p) => managed.beforeDelete(p),
    });

    EntityRegistry.register({
      name: 'FeedConsumption',
      moduleFor: () => 'feed',
      alsoVisibleTo: ['reports'],
      actions: { create: 'add', update: 'edit', delete: 'delete' },
      delegate: (tx) => tx.feedConsumption,
      createSchema: feedConsumptionCreate,
      updateSchema: feedConsumptionUpdate,
      fields: ['feedItemId', 'date', 'quantityGrams', 'wastedGrams', 'animalIds', 'note'],
      canDelete: true,
      prepareCreate: (_ctx, input) => ({ ...input, animalIds: [...new Set(input.animalIds as string[])] }),
      validate: async (ctx, v, existing) => {
        notInFuture(v.date, today());
        if (v.quantityGrams + v.wastedGrams <= 0) throw new RejectError('invalid', 'Enter the kg fed or wasted');
        await requireLive(ctx.tx, 'feedItem', v.feedItemId, 'Feed item');
        if (!existing) {
          const found = await ctx.tx.animal.count({ where: { id: { in: v.animalIds }, deletedAt: null } });
          if (found !== v.animalIds.length) throw new RejectError('not_found', 'One of the animals was not found');
        }
      },
    });

    EntityRegistry.register({
      name: 'StockAdjustment',
      moduleFor: () => 'feed',
      actions: { create: 'edit', update: 'edit', delete: 'edit' },
      delegate: (tx) => tx.stockAdjustment,
      createSchema: stockAdjustmentCreate,
      updateSchema: stockAdjustmentUpdate,
      fields: ['feedItemId', 'date', 'changeGrams', 'reason'],
      canDelete: true,
      validate: async (ctx, v) => {
        notInFuture(v.date, today());
        await requireLive(ctx.tx, 'feedItem', v.feedItemId, 'Feed item');
      },
    });
  }
}
