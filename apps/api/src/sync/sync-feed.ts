import type { Tx } from '../prisma/prisma.service';

/** Adds an entry to the ordered change feed that phones download. */
export const SyncFeed = {
  async add(tx: Tx, entity: string, recordId: string) {
    await tx.syncChange.create({ data: { entity, recordId } });
  },
};
