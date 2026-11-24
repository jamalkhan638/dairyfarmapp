import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/auth-user';
import { parseBody } from '../common/zod';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private sync: SyncService) {}

  /** Phones send their queued offline changes here, oldest first. */
  @Post('push')
  @HttpCode(200)
  async push(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const b = parseBody(z.object({ mutations: z.array(z.unknown()).max(200) }), body);
    return { results: await this.sync.push(user, b.mutations) };
  }

  /** Phones download everything that changed after their cursor. */
  @Get('pull')
  pull(@CurrentUser() user: AuthUser, @Query('cursor') cursor = '0', @Query('limit') limit = '500') {
    return this.sync.pull(user, cursor, Math.min(Math.max(Number(limit) || 500, 1), 1000));
  }
}
