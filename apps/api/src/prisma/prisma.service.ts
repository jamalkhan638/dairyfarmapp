import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../generated/prisma/client';
import { config } from '../config';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Run a write transaction. Every write in the app goes through here and takes the
   * same advisory lock, so writes are applied one at a time. That keeps the sync
   * change feed (SyncChange.seq) in commit order, so phones never miss a change.
   * A small farm's write volume makes this lock cost nothing noticeable.
   */
  write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242)`;
      return fn(tx);
    }, { timeout: 20_000 });
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
