import { Module, OnModuleInit } from '@nestjs/common';
import { breedingEventCreate, breedingEventUpdate, farmToday, healthEventCreate, healthEventUpdate, reminderCreate, reminderUpdate } from '@dairy/shared';
import { RejectError } from '../common/errors';
import { notInFuture } from '../common/linked-payment';
import type { Tx } from '../prisma/prisma.service';
import { EntityRegistry, type Row } from '../sync/entity-registry';

async function requireAnimal(tx: Tx, id: string) {
  const a = await tx.animal.findUnique({ where: { id } });
  if (!a || a.deletedAt) throw new RejectError('not_found', 'Animal not found');
  return a;
}

/** Health records, breeding records and reminders. */
@Module({})
export class HealthModule implements OnModuleInit {
  onModuleInit() {
    EntityRegistry.register({
      name: 'HealthEvent',
      moduleFor: () => 'health',
      // Milk workers need withdrawal dates to know which milk must not be sold.
      alsoVisibleTo: ['milk'],
      actions: { create: 'add', update: 'edit', delete: 'delete' },
      delegate: (tx) => tx.healthEvent,
      createSchema: healthEventCreate,
      updateSchema: healthEventUpdate,
      fields: ['animalId', 'date', 'type', 'title', 'medicine', 'dose', 'vetName', 'withdrawalEndDate', 'nextDueDate', 'expenseId', 'notes'],
      canDelete: true,
      validate: async (ctx, v: Row) => {
        notInFuture(v.date, farmToday());
        await requireAnimal(ctx.tx, v.animalId);
        if (v.withdrawalEndDate && v.withdrawalEndDate < v.date) throw new RejectError('invalid', 'Withdrawal end date is before the treatment date');
        if (v.nextDueDate && v.nextDueDate <= v.date) throw new RejectError('invalid', 'Next due date must be after the event date');
      },
    });

    EntityRegistry.register({
      name: 'BreedingEvent',
      moduleFor: () => 'health',
      alsoVisibleTo: ['milk'],
      actions: { create: 'add', update: 'edit', delete: 'delete' },
      delegate: (tx) => tx.breedingEvent,
      createSchema: breedingEventCreate,
      updateSchema: breedingEventUpdate,
      fields: ['animalId', 'date', 'type', 'method', 'sire', 'technician', 'result', 'calfId', 'calfSex', 'notes'],
      canDelete: true,
      prepareCreate: (_ctx, input) => ({
        ...input,
        // Keep only the details that belong to this kind of event.
        method: input.type === 'INSEMINATION' ? input.method ?? 'AI' : null,
        sire: input.type === 'INSEMINATION' ? input.sire ?? null : null,
        result: input.type === 'PREGNANCY_CHECK' ? input.result ?? null : null,
        calfId: input.type === 'CALVING' ? input.calfId ?? null : null,
        calfSex: input.type === 'CALVING' ? input.calfSex ?? null : null,
      }),
      validate: async (ctx, v: Row) => {
        notInFuture(v.date, farmToday());
        const a = await requireAnimal(ctx.tx, v.animalId);
        if (a.sex !== 'FEMALE') throw new RejectError('invalid', 'Breeding records are for female animals');
        if (v.type === 'PREGNANCY_CHECK' && !v.result) throw new RejectError('invalid', 'Choose the pregnancy check result');
        if (v.calfId) {
          if (v.calfId === v.animalId) throw new RejectError('invalid', 'The calf cannot be the mother');
          await requireAnimal(ctx.tx, v.calfId);
        }
      },
    });

    EntityRegistry.register({
      name: 'Reminder',
      moduleFor: () => 'health',
      alsoVisibleTo: ['milk', 'animals'],
      actions: { create: 'add', update: 'edit', delete: 'delete' },
      delegate: (tx) => tx.reminder,
      createSchema: reminderCreate,
      updateSchema: reminderUpdate,
      fields: ['animalId', 'dueDate', 'title', 'sourceKey', 'done', 'notes'],
      canDelete: true,
      validate: async (ctx, v: Row) => {
        if (v.animalId) await requireAnimal(ctx.tx, v.animalId);
      },
    });
  }
}
