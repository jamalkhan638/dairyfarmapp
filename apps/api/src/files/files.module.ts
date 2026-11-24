import {
  BadRequestException, Controller, ForbiddenException, Get, HttpCode, Module, NotFoundException,
  OnModuleInit, Param, ParseUUIDPipe, Put, Req, Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { attachmentCreate, attachmentUpdate, can } from '@dairy/shared';
import { CurrentUser, type AuthUser } from '../common/auth-user';
import { RejectError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { canView, EntityRegistry, type Row } from '../sync/entity-registry';
import { StorageService } from './storage.service';

const MAX_BYTES = 10 * 1024 * 1024;

function parentDef(record: Row) {
  const parent = EntityRegistry.get(record.entity);
  if (!parent || parent.name === 'Attachment') throw new RejectError('invalid', `Cannot attach files to ${record.entity}`);
  return parent;
}
const parentModule = (record: Row) => parentDef(record).moduleFor({});

/**
 * A photo is saved in two steps so it works offline:
 *  1. The Attachment record (metadata) syncs like any other record.
 *  2. The phone uploads the image bytes here once the record exists on the server.
 * Images are served through the API, so the storage bucket never needs to be public.
 */
@Controller('files')
class FilesController {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  @Put(':id')
  @HttpCode(204)
  async upload(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const a = await this.prisma.attachment.findUnique({ where: { id } });
    if (!a || a.deletedAt) throw new NotFoundException('Attachment record not synced yet');
    if (a.createdById !== user.id && user.role !== 'OWNER') throw new ForbiddenException('Only the person who added this file can upload it');
    const body = await readBody(req);
    if (body.length === 0 || body.length > MAX_BYTES) throw new BadRequestException('File is empty or too large');
    await this.storage.put(a.storageKey, body, a.contentType);
    // Upload completion is a technical step, not a user edit, so it is not added to history.
    if (!a.uploadedAt) {
      await this.prisma.write(async (tx) => {
        await tx.attachment.update({ where: { id }, data: { uploadedAt: new Date(), sizeBytes: body.length } });
        await tx.syncChange.create({ data: { entity: 'Attachment', recordId: id } });
      });
    }
  }

  @Get(':id')
  async download(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const a = await this.prisma.attachment.findUnique({ where: { id } });
    if (!a || !a.uploadedAt) throw new NotFoundException('File not uploaded yet');
    if (!canView(parentDef(a), {}, (m) => can(user.role, user.permissions, m, 'view'))) throw new ForbiddenException();
    const data = await this.storage.get(a.storageKey);
    res.setHeader('Content-Type', a.contentType);
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(data);
  }
}

function readBody(req: Request): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BYTES) {
        reject(new BadRequestException('File too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

@Module({ controllers: [FilesController], providers: [StorageService] })
export class FilesModule implements OnModuleInit {
  onModuleInit() {
    EntityRegistry.register({
      name: 'Attachment',
      moduleFor: (r) => parentModule(r),
      alsoVisibleToFor: (r) => parentDef(r).alsoVisibleTo ?? [],
      actions: { create: ['add', 'edit'], update: 'edit', delete: 'edit' },
      delegate: (tx) => tx.attachment,
      createSchema: attachmentCreate,
      updateSchema: attachmentUpdate,
      fields: ['entity', 'recordId', 'contentType', 'sizeBytes'],
      canDelete: true,
      hiddenFields: ['storageKey'],
      prepareCreate: (_ctx, input, id) => ({ ...input, storageKey: `${input.entity.toLowerCase()}/${input.recordId}/${id}` }),
    });
  }
}
