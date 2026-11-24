import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { ACTIONS, MODULES, type PermissionMap, type UserSummary } from '@dairy/shared';
import { CurrentUser, OwnerOnly, type AuthUser } from '../common/auth-user';
import { parseBody } from '../common/zod';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService, type Changes } from '../audit/audit.service';
import { SyncFeed } from '../sync/sync-feed';
import { mapToRows, rowsToMap } from '../auth/permissions.util';
import { passwordSchema, usernameSchema } from '../auth/auth.controller';

const modulePerm = z.object(Object.fromEntries(ACTIONS.map((a) => [a, z.boolean()])) as Record<(typeof ACTIONS)[number], z.ZodBoolean>);
const permissionsSchema = z.object(Object.fromEntries(MODULES.map((m) => [m, modulePerm.optional()])) as Record<(typeof MODULES)[number], z.ZodOptional<typeof modulePerm>>);

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(['OWNER', 'WORKER']).default('WORKER'),
  permissions: permissionsSchema.default({}),
});
const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  active: z.boolean().optional(),
  role: z.enum(['OWNER', 'WORKER']).optional(),
  permissions: permissionsSchema.optional(),
});

/** Owner-only account management. Not offline: changing access needs the server. */
@Controller('users')
@OwnerOnly()
class UsersController {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private async summary(id: string, tx: Tx | PrismaService = this.prisma): Promise<UserSummary> {
    const u = await tx.user.findUniqueOrThrow({ where: { id }, include: { permissions: true } });
    return { id: u.id, name: u.name, username: u.username, role: u.role, active: u.active, permissions: rowsToMap(u.role, u.permissions) };
  }

  @Get()
  async list(): Promise<UserSummary[]> {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' }, include: { permissions: true } });
    return users.map((u) => ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active, permissions: rowsToMap(u.role, u.permissions) }));
  }

  @Post()
  async create(@CurrentUser() owner: AuthUser, @Body() body: unknown) {
    const b = parseBody(createSchema, body);
    const id = randomUUID();
    const passwordHash = await argon2.hash(b.password);
    return this.prisma.write(async (tx) => {
      if (await tx.user.findUnique({ where: { username: b.username } })) throw new ConflictException('That username is taken');
      await tx.user.create({
        data: {
          id, name: b.name, username: b.username, passwordHash, role: b.role, createdById: owner.id, updatedById: owner.id,
          permissions: { create: mapToRows(b.permissions as Partial<PermissionMap>) },
        },
      });
      const after = await this.summary(id, tx);
      await this.audit.record(tx, {
        entity: 'User', recordId: id, action: 'CREATE', userId: owner.id,
        changes: { name: { from: null, to: after.name }, username: { from: null, to: after.username }, role: { from: null, to: after.role }, permissions: { from: null, to: after.permissions } },
      });
      await SyncFeed.add(tx, 'User', id);
      return after;
    });
  }

  @Patch(':id')
  async update(@CurrentUser() owner: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const b = parseBody(updateSchema, body);
    return this.prisma.write(async (tx) => {
      const exists = await tx.user.findUnique({ where: { id } });
      if (!exists) throw new NotFoundException();
      const before = await this.summary(id, tx);
      const losingOwner = (b.active === false || b.role === 'WORKER') && before.role === 'OWNER';
      if (losingOwner) {
        const owners = await tx.user.count({ where: { role: 'OWNER', active: true } });
        if (owners <= 1) throw new BadRequestException('The farm must keep at least one active owner');
      }
      const accessChanged = b.permissions !== undefined || b.role !== undefined || b.active !== undefined;
      await tx.user.update({
        where: { id },
        data: {
          name: b.name, active: b.active, role: b.role, updatedById: owner.id, version: { increment: 1 },
          // Makes the user's phone re-download everything with the new access.
          ...(accessChanged ? { accessVersion: { increment: 1 } } : {}),
        },
      });
      if (b.permissions) {
        for (const row of mapToRows(b.permissions as Partial<PermissionMap>)) {
          await tx.permission.upsert({ where: { userId_module: { userId: id, module: row.module } }, create: { userId: id, ...row }, update: row });
        }
      }
      if (b.active === false) await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      const after = await this.summary(id, tx);
      const changes: Changes = {};
      for (const f of ['name', 'role', 'active', 'permissions'] as const) {
        if (JSON.stringify(before[f]) !== JSON.stringify(after[f])) changes[f] = { from: before[f], to: after[f] };
      }
      if (Object.keys(changes).length) {
        await this.audit.record(tx, { entity: 'User', recordId: id, action: 'UPDATE', userId: owner.id, changes });
        await SyncFeed.add(tx, 'User', id);
      }
      return after;
    });
  }

  @Post(':id/password')
  @HttpCode(204)
  async resetPassword(@CurrentUser() owner: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const b = parseBody(z.object({ password: passwordSchema }), body);
    const passwordHash = await argon2.hash(b.password);
    await this.prisma.write(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash, updatedById: owner.id } });
      // Log out the user everywhere; the password itself is never stored in history.
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record(tx, { entity: 'User', recordId: id, action: 'UPDATE', userId: owner.id, changes: { password: { from: '••••', to: 'reset' } } });
    });
  }
}

@Module({ controllers: [UsersController] })
export class UsersModule {}
