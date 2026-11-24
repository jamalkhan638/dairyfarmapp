import { Controller, ForbiddenException, Get, Global, Module, NotFoundException, Param, ParseUUIDPipe } from '@nestjs/common';
import { can } from '@dairy/shared';
import { CurrentUser, type AuthUser } from '../common/auth-user';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { EntityRegistry } from '../sync/entity-registry';
import { AuditService } from './audit.service';

@Controller('history')
class HistoryController {
  constructor(private audit: AuditService, private prisma: PrismaService) {}

  /** Who changed what and when, for one record. Same view permission as the record itself. */
  @Get(':entity/:id')
  async history(@CurrentUser() user: AuthUser, @Param('entity') entity: string, @Param('id', ParseUUIDPipe) id: string) {
    if (entity === 'User' || entity === 'SyncConflict') {
      if (user.role !== 'OWNER') throw new ForbiddenException();
    } else {
      const def = EntityRegistry.get(entity);
      if (!def) throw new NotFoundException();
      const record = await def.delegate(this.prisma as unknown as Tx).findUnique({ where: { id } });
      if (!record) throw new NotFoundException();
      if (!can(user.role, user.permissions, def.moduleFor(record), 'view')) throw new ForbiddenException();
    }
    return this.audit.history(entity, id);
  }
}

@Global()
@Module({ controllers: [HistoryController], providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
