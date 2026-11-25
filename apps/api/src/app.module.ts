import { Controller, Get, Module } from '@nestjs/common';
import { Public } from './common/auth-user';
import { PrismaModule } from './prisma/prisma.service';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SyncModule } from './sync/sync.module';
import { AnimalsModule } from './animals/animals.module';
import { FilesModule } from './files/files.module';
import { MilkModule } from './milk/milk.module';
import { SalesModule } from './sales/sales.module';
import { FeedModule } from './feed/feed.module';
import { MoneyModule } from './money/money.module';

@Controller()
class HealthController {
  @Public()
  @Get('health')
  health() {
    return { ok: true, time: new Date().toISOString() };
  }
}

/** One backend application; each farm feature is its own module. */
@Module({
  imports: [PrismaModule, AuditModule, AuthModule, UsersModule, SyncModule, AnimalsModule, FilesModule, MilkModule, SalesModule, FeedModule, MoneyModule],
  controllers: [HealthController],
})
export class AppModule {}
