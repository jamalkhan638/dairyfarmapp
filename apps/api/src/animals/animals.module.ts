import { Module, OnModuleInit } from '@nestjs/common';
import { animalCreate, animalUpdate, statusChangeCreate, statusChangeUpdate } from '@dairy/shared';
import { RejectError } from '../common/errors';
import type { Tx } from '../prisma/prisma.service';
import { diff } from '../audit/audit.service';
import { EntityRegistry, type EntityContext, type Row } from '../sync/entity-registry';

const ANIMAL_FIELDS = [
  'tag', 'name', 'breed', 'sex', 'birthDate', 'birthDateEstimated', 'purchaseDate',
  'purchasePricePaisa', 'motherId', 'photoId', 'notes', 'status', 'statusDate',
];
const STATUS_FIELDS = ['animalId', 'status', 'effectiveDate', 'reason'];

/**
 * An animal's status is whatever its latest (by date) status change says.
 * Called after any status change is added, edited or deleted.
 */
export async function recomputeAnimalStatus(ctx: EntityContext, animalId: string) {
  const { tx } = ctx;
  const latest = await tx.animalStatusChange.findFirst({
    where: { animalId, deletedAt: null },
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
  });
  const animal = await tx.animal.findUnique({ where: { id: animalId } });
  if (!animal || !latest) return;
  if (animal.status === latest.status && animal.statusDate === latest.effectiveDate) return;
  const updated = await tx.animal.update({
    where: { id: animalId },
    data: { status: latest.status, statusDate: latest.effectiveDate, version: { increment: 1 }, updatedById: ctx.user.id, clientUpdatedAt: new Date(ctx.mutation.clientTime) },
  });
  await ctx.audit('Animal', animalId, 'UPDATE', diff(animal, updated, ['status', 'statusDate']));
  await ctx.feed('Animal', animalId);
}

export async function requireAnimal(tx: Tx, id: string, label: string) {
  const a = await tx.animal.findUnique({ where: { id } });
  if (!a || a.deletedAt) throw new RejectError('not_found', `${label} not found`);
  return a;
}

@Module({})
export class AnimalsModule implements OnModuleInit {
  onModuleInit() {
    EntityRegistry.register({
      name: 'Animal',
      moduleFor: () => 'animals',
      alsoVisibleTo: ['milk', 'health', 'feed', 'sales', 'expenses', 'finance', 'reports'],
      actions: { create: 'add', update: 'edit', delete: 'delete' },
      delegate: (tx) => tx.animal,
      createSchema: animalCreate,
      updateSchema: animalUpdate,
      fields: ANIMAL_FIELDS,
      canDelete: true,
      duplicateKeyFields: ['tag'],
      prepareCreate: (_ctx, input) => {
        const { initialStatus, initialStatusDate, initialStatusChangeId, ...rest } = input;
        return { ...rest, status: initialStatus, statusDate: initialStatusDate };
      },
      validate: async (ctx, values, existing) => {
        if (values.motherId) {
          if (values.motherId === (existing?.id ?? ctx.mutation.recordId)) throw new RejectError('invalid', 'An animal cannot be its own mother');
          await requireAnimal(ctx.tx, values.motherId, 'Mother');
        }
      },
      findDuplicate: (tx, values, selfId) =>
        tx.animal.findFirst({ where: { tag: { equals: values.tag, mode: 'insensitive' }, deletedAt: null, id: { not: selfId } } }),
      afterCreate: async (ctx, record, input) => {
        // The starting status is stored as the first entry of the status history.
        const sc = await ctx.tx.animalStatusChange.create({
          data: {
            id: input.initialStatusChangeId,
            animalId: record.id,
            status: input.initialStatus,
            effectiveDate: input.initialStatusDate,
            reason: 'Initial status',
            createdById: ctx.user.id,
            updatedById: ctx.user.id,
            clientCreatedAt: new Date(ctx.mutation.clientTime),
            clientUpdatedAt: new Date(ctx.mutation.clientTime),
          },
        });
        await ctx.audit('AnimalStatusChange', sc.id, 'CREATE', diff(null, sc, STATUS_FIELDS));
        await ctx.feed('AnimalStatusChange', sc.id);
      },
    });

    EntityRegistry.register({
      name: 'AnimalStatusChange',
      moduleFor: () => 'animals',
      alsoVisibleTo: ['milk', 'health', 'feed'],
      // Changing an animal's status is an edit of that animal.
      actions: { create: 'edit', update: 'edit', delete: 'edit' },
      delegate: (tx) => tx.animalStatusChange,
      createSchema: statusChangeCreate,
      updateSchema: statusChangeUpdate,
      fields: STATUS_FIELDS,
      canDelete: true,
      validate: async (ctx, values) => {
        await requireAnimal(ctx.tx, values.animalId, 'Animal');
      },
      afterCreate: (ctx, r: Row) => recomputeAnimalStatus(ctx, r.animalId),
      afterUpdate: (ctx, r: Row) => recomputeAnimalStatus(ctx, r.animalId),
      afterDelete: async (ctx, r: Row) => {
        const remaining = await ctx.tx.animalStatusChange.count({ where: { animalId: r.animalId, deletedAt: null } });
        if (remaining === 0) throw new RejectError('invalid', 'An animal must keep at least one status entry');
        await recomputeAnimalStatus(ctx, r.animalId);
      },
    });
  }
}
