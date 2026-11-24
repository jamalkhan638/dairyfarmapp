import { Module, OnModuleInit } from '@nestjs/common';
import { farmToday, milkRecordCreate, milkRecordUpdate, milkUsageCreate, milkUsageUpdate } from '@dairy/shared';
import { RejectError } from '../common/errors';
import { requireAnimal } from '../animals/animals.module';
import { EntityRegistry, type Row } from '../sync/entity-registry';

function notInFuture(date: string) {
  if (date > farmToday()) throw new RejectError('invalid', 'Date cannot be in the future');
}

/** Milk production per cow and session, and milk used without being sold. */
@Module({})
export class MilkModule implements OnModuleInit {
  onModuleInit() {
    EntityRegistry.register({
      name: 'MilkRecord',
      moduleFor: () => 'milk',
      actions: { create: 'add', update: 'edit', delete: 'delete' },
      delegate: (tx) => tx.milkRecord,
      createSchema: milkRecordCreate,
      updateSchema: milkRecordUpdate,
      fields: ['animalId', 'date', 'session', 'quantityMl', 'note'],
      canDelete: true,
      duplicateKeyFields: ['animalId', 'date', 'session'],
      validate: async (ctx, values: Row, existing) => {
        notInFuture(values.date);
        const animal = await requireAnimal(ctx.tx, values.animalId, 'Animal');
        if (!existing && animal.sex !== 'FEMALE') throw new RejectError('invalid', 'Milk can only be recorded for female animals');
      },
      // Two phones recording the same cow and milking become a duplicate conflict, not two entries.
      findDuplicate: (tx, values, selfId) =>
        tx.milkRecord.findFirst({ where: { animalId: values.animalId, date: values.date, session: values.session, deletedAt: null, id: { not: selfId } } }),
    });

    EntityRegistry.register({
      name: 'MilkUsage',
      moduleFor: () => 'milk',
      actions: { create: 'add', update: 'edit', delete: 'delete' },
      delegate: (tx) => tx.milkUsage,
      createSchema: milkUsageCreate,
      updateSchema: milkUsageUpdate,
      fields: ['date', 'type', 'quantityMl', 'animalId', 'note'],
      canDelete: true,
      validate: async (ctx, values: Row) => {
        notInFuture(values.date);
        if (values.animalId) await requireAnimal(ctx.tx, values.animalId, 'Animal');
      },
    });
  }
}
