import { Module, OnModuleInit } from '@nestjs/common';
import {
  customerCreate, customerPaymentCreate, customerPaymentUpdate, customerRateCreate, customerRateUpdate, customerUpdate,
  farmToday, milkDeliveryCreate, milkDeliveryUpdate, saleAmountPaisa,
} from '@dairy/shared';
import { RejectError } from '../common/errors';
import { createLinkedPayment, refuseManagedPayment, syncLinkedPayment, type LinkedPaymentSpec } from '../common/linked-payment';
import type { Tx } from '../prisma/prisma.service';
import { EntityRegistry } from '../sync/entity-registry';

const PAYMENT_FIELDS = ['customerId', 'date', 'amountPaisa', 'method', 'deliveryId', 'note'];

function notInFuture(date: string) {
  if (date > farmToday()) throw new RejectError('invalid', 'Date cannot be in the future');
}

async function requireCustomer(tx: Tx, id: string) {
  const c = await tx.customer.findUnique({ where: { id } });
  if (!c || c.deletedAt) throw new RejectError('not_found', 'Customer not found');
  return c;
}

const CASH_SALE: LinkedPaymentSpec = {
  entity: 'CustomerPayment',
  delegate: (tx) => tx.customerPayment,
  partyField: 'customerId',
  linkField: 'deliveryId',
  amountField: 'amountPaisa',
  auditFields: PAYMENT_FIELDS,
};
const managed = refuseManagedPayment('deliveryId', 'sale');

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
      // A cash sale is two records: the sale and the money received for it.
      afterCreate: async (ctx, d) => {
        if (d.saleType === 'CASH') await createLinkedPayment(ctx, CASH_SALE, d);
      },
      afterUpdate: (ctx, d) => syncLinkedPayment(ctx, CASH_SALE, d, false),
      afterDelete: (ctx, d) => syncLinkedPayment(ctx, CASH_SALE, d, true),
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
        managed.validate(existing);
        notInFuture(v.date);
        await requireCustomer(ctx.tx, v.customerId);
      },
      beforeDelete: async (_ctx, p) => managed.beforeDelete(p),
    });
  }
}
