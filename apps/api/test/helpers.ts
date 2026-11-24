import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import type { Mutation } from '@dairy/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

export async function createApp() {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

export async function resetDb(app: INestApplication) {
  const prisma = app.get(PrismaService);
  await prisma.$executeRawUnsafe(
    'TRUNCATE "AnimalStatusChange","Animal","Attachment","AuditLog","SyncMutation","SyncChange","SyncConflict","RefreshToken","Permission","User" RESTART IDENTITY CASCADE',
  );
}

export function client(app: INestApplication, token?: string) {
  const h = (r: request.Test) => (token ? r.set('Authorization', `Bearer ${token}`) : r);
  return {
    get: (url: string) => h(request(app.getHttpServer()).get(url)),
    post: (url: string, body?: object) => h(request(app.getHttpServer()).post(url)).send(body ?? {}),
    patch: (url: string, body?: object) => h(request(app.getHttpServer()).patch(url)).send(body ?? {}),
    put: (url: string) => h(request(app.getHttpServer()).put(url)),
  };
}

export function mutation(m: Omit<Mutation, 'mutationId' | 'clientTime'> & Partial<Mutation>): Mutation {
  return { mutationId: randomUUID(), clientTime: new Date().toISOString(), ...m };
}

export function newAnimal(tag: string, extra: Record<string, unknown> = {}) {
  const id = randomUUID();
  return {
    id,
    statusChangeId: randomUUID(),
    m(): Mutation {
      return mutation({
        entity: 'Animal', op: 'create', recordId: id,
        data: { tag, initialStatus: 'MILKING', initialStatusDate: '2026-11-01', initialStatusChangeId: this.statusChangeId, ...extra },
      });
    },
  };
}
