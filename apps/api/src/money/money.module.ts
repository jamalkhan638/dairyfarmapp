import { Injectable, Module, OnModuleInit } from '@nestjs/common';
import {
  capitalEntryCreate, capitalEntryUpdate, expenseCreate, expenseUpdate, FARM_SETTINGS_ID,
  farmSettingsUpdate, farmToday,
} from '@dairy/shared';
import { z } from 'zod';
import { RejectError } from '../common/errors';
import { createLinkedPayment, notInFuture, syncLinkedPayment, type LinkedPaymentSpec } from '../common/linked-payment';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { EntityRegistry } from '../sync/entity-registry';

import { SUPPLIER_PAYMENT_FIELDS } from '../feed/feed.module';

const PAID_EXPENSE: LinkedPaymentSpec = {
  entity: 'SupplierPayment',
  delegate: (tx) => tx.supplierPayment,
  partyField: 'supplierId',
  linkField: 'expenseId',
  amountField: 'amountPaisa',
  auditFields: SUPPLIER_PAYMENT_FIELDS,
};
const today = () => farmToday();

async function requireLive(tx: Tx, model: 'supplier' | 'animal', id: string, label: string) {
  const r = await (tx[model] as any).findUnique({ where: { id } });
  if (!r || r.deletedAt) throw new RejectError('not_found', `${label} not found`);
}

/** Makes sure the single farm settings record exists (created with the owner account). */
@Injectable()
export class FarmSettingsService {
  constructor(private prisma: PrismaService) {}
  async ensure(tx: Tx | PrismaService, ownerId: string) {
    if (await tx.farmSettings.findUnique({ where: { id: FARM_SETTINGS_ID } })) return;
    await tx.farmSettings.create({ data: { id: FARM_SETTINGS_ID, createdById: ownerId, updatedById: ownerId } });
    await tx.syncChange.create({ data: { entity: 'FarmSettings', recordId: FARM_SETTINGS_ID } });
  }
}

/** Daily expenses, capital entries (cow purchases, equipment, owner money) and farm settings. */
@Module({ providers: [FarmSettingsService], exports: [FarmSettingsService] })
export class MoneyModule implements OnModuleInit {
  constructor(private prisma: PrismaService, private settings: FarmSettingsService) {}

  async onModuleInit() {
    const owner = await this.prisma.user.findFirst({ where: { role: 'OWNER' }, orderBy: { createdAt: 'asc' } }).catch(() => null);
    if (owner) await this.settings.ensure(this.prisma, owner.id);

    EntityRegistry.register({
      name: 'Expense',
      moduleFor: () => 'expenses',
      alsoVisibleTo: ['finance', 'reports'],
      actions: { create: 'add', update: 'edit', delete: 'delete' },
      delegate: (tx) => tx.expense,
      createSchema: expenseCreate,
      updateSchema: expenseUpdate,
      fields: ['date', 'category', 'amountPaisa', 'description', 'supplierId', 'paymentType', 'method', 'cashPaymentId', 'animalId', 'receiptPhotoId'],
      canDelete: true,
      prepareCreate: (_ctx, input) => {
        const supplierId = input.supplierId ?? null;
        if (input.paymentType === 'CREDIT' && !supplierId) throw new RejectError('invalid', 'An expense on credit needs a supplier');
        // Paid now to a named supplier: also recorded as a payment to them, so their balance stays right.
        const needsPayment = input.paymentType === 'CASH' && !!supplierId;
        if (needsPayment && !input.cashPaymentId) throw new RejectError('invalid', 'A paid expense with a supplier needs a payment id');
        return { ...input, supplierId, cashPaymentId: needsPayment ? input.cashPaymentId : null };
      },
      validate: async (ctx, v) => {
        notInFuture(v.date, today());
        if (v.supplierId) await requireLive(ctx.tx, 'supplier', v.supplierId, 'Supplier');
        if (v.animalId) await requireLive(ctx.tx, 'animal', v.animalId, 'Animal');
      },
      afterCreate: async (ctx, e) => {
        if (e.cashPaymentId) await createLinkedPayment(ctx, PAID_EXPENSE, e);
      },
      afterUpdate: (ctx, e) => syncLinkedPayment(ctx, PAID_EXPENSE, e, false),
      afterDelete: (ctx, e) => syncLinkedPayment(ctx, PAID_EXPENSE, e, true),
    });

    EntityRegistry.register({
      name: 'CapitalEntry',
      moduleFor: () => 'finance',
      alsoVisibleTo: ['reports'],
      actions: { create: 'add', update: 'edit', delete: 'delete' },
      delegate: (tx) => tx.capitalEntry,
      createSchema: capitalEntryCreate,
      updateSchema: capitalEntryUpdate,
      fields: ['date', 'type', 'amountPaisa', 'description', 'method', 'animalId', 'receiptPhotoId'],
      canDelete: true,
      validate: async (ctx, v) => {
        notInFuture(v.date, today());
        if (v.animalId) await requireLive(ctx.tx, 'animal', v.animalId, 'Animal');
      },
    });

    EntityRegistry.register({
      name: 'FarmSettings',
      moduleFor: () => 'finance',
      // Everyone can read the farm settings (e.g. the farm name); only finance "edit" can change them.
      alsoVisibleTo: ['animals', 'milk', 'sales', 'feed', 'expenses', 'health', 'reports'],
      actions: { create: 'edit', update: 'edit', delete: 'edit' },
      delegate: (tx) => tx.farmSettings,
      // Created by the server only; phones can only edit it.
      createSchema: z.object({}).refine(() => false, 'Farm settings already exist'),
      updateSchema: farmSettingsUpdate,
      fields: ['farmName', 'gestationDays', 'pregnancyCheckDays', 'heatRepeatDays', 'openingCashPaisa', 'openingCashDate'],
      canDelete: false,
    });
  }
}

