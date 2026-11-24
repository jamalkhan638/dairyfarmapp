import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { NodeLocalDb } from './node-local-db';
import { migrate } from '../../mobile/src/sync/schema';
import { LocalRepo } from '../../mobile/src/sync/repo';
import { OfflineError, SyncEngine, type SyncApi } from '../../mobile/src/sync/engine';
import { loadAnimals } from '../../mobile/src/domain/animals';

/** A simulated phone: the app's real local database, outbox and sync engine. */
export class Phone {
  db = new NodeLocalDb();
  repo = new LocalRepo(this.db, { newId: randomUUID });
  online = true;
  engine: SyncEngine;
  constructor(private app: INestApplication, public userId: string, private token: string) {
    const api: SyncApi = {
      push: async (mutations) => {
        if (!this.online) throw new OfflineError();
        const r = await request(this.app.getHttpServer()).post('/api/sync/push').set('Authorization', `Bearer ${this.token}`).send({ mutations });
        return r.body;
      },
      pull: async (cursor) => {
        if (!this.online) throw new OfflineError();
        const r = await request(this.app.getHttpServer()).get(`/api/sync/pull?cursor=${cursor}`).set('Authorization', `Bearer ${this.token}`);
        return r.body;
      },
    };
    this.engine = new SyncEngine(this.db, this.repo, api, () => this.userId);
  }
  async init() {
    await migrate(this.db);
    return this;
  }
  sync() {
    return this.engine.sync();
  }
  async animal(tag: string) {
    return (await loadAnimals(this.repo)).find((a) => a.animal.tag === tag);
  }
}

export async function login(app: INestApplication, username: string, password: string) {
  const r = await request(app.getHttpServer()).post('/api/auth/login').send({ username, password });
  return { token: r.body.accessToken as string, id: r.body.user.id as string };
}
