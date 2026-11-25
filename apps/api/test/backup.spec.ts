import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createApp, resetDb } from './helpers';
import { resetLoginFailures } from '../src/auth/auth.service';

let app: INestApplication;
let ownerToken: string;
let workerToken: string;
const dir = path.join(os.tmpdir(), `dairy-backup-test-${process.pid}`);

beforeAll(async () => {
  await fs.mkdir(path.join(dir, 'daily'), { recursive: true });
  await fs.writeFile(path.join(dir, 'last-success'), '2026-11-25T21:30:05Z\n');
  await fs.writeFile(path.join(dir, 'daily', 'dairy-2026-11-25.dump'), 'x'.repeat(1234));
  process.env.BACKUP_STATUS_DIR = dir;
  app = await createApp();
  await resetDb(app);
  const s = await request(app.getHttpServer()).post('/api/auth/setup').send({ setupCode: 'test-setup', name: 'Jamal', username: 'jamal', password: 'secret123' });
  ownerToken = s.body.accessToken;
  await request(app.getHttpServer()).post('/api/users').set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Ali', username: 'ali', password: 'worker123' });
  workerToken = (await request(app.getHttpServer()).post('/api/auth/login').send({ username: 'ali', password: 'worker123' })).body.accessToken;
});
afterAll(async () => {
  delete process.env.BACKUP_STATUS_DIR;
  await app.close();
  await fs.rm(dir, { recursive: true, force: true });
});

it('the owner sees the last backup and can ask for one; workers cannot', async () => {
  const s = await request(app.getHttpServer()).get('/api/admin/backup').set('Authorization', `Bearer ${ownerToken}`);
  expect(s.body).toMatchObject({ available: true, lastSuccess: '2026-11-25T21:30:05Z', lastError: null, requested: false, latest: [{ name: 'dairy-2026-11-25.dump', sizeBytes: 1234 }] });
  const r = await request(app.getHttpServer()).post('/api/admin/backup').set('Authorization', `Bearer ${ownerToken}`);
  expect(r.status).toBe(202);
  await expect(fs.stat(path.join(dir, 'backup-now'))).resolves.toBeTruthy();
  const s2 = await request(app.getHttpServer()).get('/api/admin/backup').set('Authorization', `Bearer ${ownerToken}`);
  expect(s2.body.requested).toBe(true);
  expect((await request(app.getHttpServer()).get('/api/admin/backup').set('Authorization', `Bearer ${workerToken}`)).status).toBe(403);
});

it('locks a username for 15 minutes after 5 wrong passwords', async () => {
  resetLoginFailures();
  const login = (password: string) => request(app.getHttpServer()).post('/api/auth/login').send({ username: 'ali', password });
  for (let i = 0; i < 5; i++) expect((await login('wrong')).status).toBe(401);
  expect((await login('worker123')).status).toBe(429); // even the right password waits
  resetLoginFailures();
  expect((await login('worker123')).status).toBe(200);
});
