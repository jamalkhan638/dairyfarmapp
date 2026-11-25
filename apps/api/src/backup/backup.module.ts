import { Controller, Get, HttpCode, Module, Post } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { OwnerOnly } from '../common/auth-user';

export interface BackupStatus {
  /** False in development, when no backup folder is connected. */
  available: boolean;
  lastSuccess: string | null;
  lastError: string | null;
  /** True while a "back up now" request is waiting to be picked up (within 30 seconds). */
  requested: boolean;
  latest: { name: string; sizeBytes: number }[];
}

const dir = () => process.env.BACKUP_STATUS_DIR ?? '';
const read = (f: string) => fs.readFile(path.join(dir(), f), 'utf8').then((s) => s.trim()).catch(() => null);

/** Owner only: see when the last backup worked, and ask for one now. The backup itself runs in the backup container. */
@Controller('admin/backup')
@OwnerOnly()
class BackupController {
  @Get()
  async status(): Promise<BackupStatus> {
    if (!dir()) return { available: false, lastSuccess: null, lastError: null, requested: false, latest: [] };
    const daily = path.join(dir(), 'daily');
    const names = await fs.readdir(daily).catch(() => [] as string[]);
    const files = await Promise.all(
      names.filter((n) => !n.startsWith('.')).map(async (name) => ({ name, sizeBytes: (await fs.stat(path.join(daily, name))).size })),
    );
    files.sort((a, b) => b.name.localeCompare(a.name));
    return {
      available: true,
      lastSuccess: await read('last-success'),
      lastError: await read('last-error'),
      requested: (await read('backup-now')) !== null,
      latest: files.slice(0, 4),
    };
  }

  @Post()
  @HttpCode(202)
  async request() {
    if (!dir()) return { requested: false };
    await fs.writeFile(path.join(dir(), 'backup-now'), new Date().toISOString());
    return { requested: true };
  }
}

@Module({ controllers: [BackupController] })
export class BackupModule {}
