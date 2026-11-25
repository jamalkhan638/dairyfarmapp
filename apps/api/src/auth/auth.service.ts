import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { FARM_SETTINGS_ID, farmToday, type LoginResponse, type MeResponse } from '@dairy/shared';
import { PrismaService } from '../prisma/prisma.service';
import { config } from '../config';
import type { AuthUser } from '../common/auth-user';
import { rowsToMap } from './permissions.util';
import { AuditService } from '../audit/audit.service';
import { SyncFeed } from '../sync/sync-feed';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Slows down password guessing: after 5 wrong passwords for a username within 15 minutes,
 * that username is locked for 15 minutes. Kept in memory (one small server).
 */
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60_000;
const failures = new Map<string, { count: number; first: number }>();
function isLocked(username: string) {
  const f = failures.get(username);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW_MS) {
    failures.delete(username);
    return false;
  }
  return f.count >= MAX_FAILURES;
}
function recordFailure(username: string) {
  const f = failures.get(username);
  if (!f || Date.now() - f.first > WINDOW_MS) failures.set(username, { count: 1, first: Date.now() });
  else f.count++;
}
/** For tests. */
export function resetLoginFailures() {
  failures.clear();
}

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService, private audit: AuditService) {}

  async needsSetup() {
    return (await this.prisma.user.count()) === 0;
  }

  /** First run only: create the owner account. Protected by SETUP_CODE from the server's .env. */
  async setup(input: { setupCode: string; name: string; username: string; password: string; deviceName?: string }) {
    if (!config.setupCode || input.setupCode !== config.setupCode) throw new ForbiddenException('Wrong setup code');
    const id = randomUUID();
    await this.prisma.write(async (tx) => {
      if ((await tx.user.count()) > 0) throw new ConflictException('Owner account already exists');
      await tx.user.create({
        data: {
          id,
          name: input.name,
          username: input.username,
          passwordHash: await argon2.hash(input.password),
          role: 'OWNER',
          createdById: id,
          updatedById: id,
        },
      });
      await this.audit.record(tx, { entity: 'User', recordId: id, action: 'CREATE', userId: id, changes: { name: { from: null, to: input.name }, username: { from: null, to: input.username }, role: { from: null, to: 'OWNER' } } });
      await SyncFeed.add(tx, 'User', id);
      await tx.farmSettings.create({ data: { id: FARM_SETTINGS_ID, createdById: id, updatedById: id, openingCashDate: farmToday() } });
      await SyncFeed.add(tx, 'FarmSettings', FARM_SETTINGS_ID);
    });
    return this.issueTokens(id, input.deviceName);
  }

  async login(username: string, password: string, deviceName?: string): Promise<LoginResponse> {
    const name = username.trim().toLowerCase();
    if (isLocked(name)) throw new HttpException('Too many wrong passwords. Try again in 15 minutes.', HttpStatus.TOO_MANY_REQUESTS);
    const user = await this.prisma.user.findUnique({ where: { username: name } });
    // Same message whether the username or password is wrong.
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      recordFailure(name);
      throw new UnauthorizedException('Wrong username or password');
    }
    failures.delete(name);
    if (!user.active) throw new UnauthorizedException('This account is disabled');
    return this.issueTokens(user.id, deviceName);
  }

  /** Swap a refresh token for a new pair. The old refresh token stops working. */
  async refresh(refreshToken: string): Promise<LoginResponse> {
    const [id, secret] = (refreshToken ?? '').split('.');
    if (!id || !secret) throw new UnauthorizedException('Invalid session');
    const row = await this.prisma.refreshToken.findUnique({ where: { id }, include: { user: true } });
    if (!row || row.revokedAt || row.expiresAt < new Date() || row.tokenHash !== sha256(secret)) {
      throw new UnauthorizedException('Session expired, please log in again');
    }
    if (!row.user.active) throw new UnauthorizedException('This account is disabled');
    await this.prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
    return this.issueTokens(row.userId, row.deviceName ?? undefined);
  }

  async logout(refreshToken: string) {
    const [id] = (refreshToken ?? '').split('.');
    if (id) await this.prisma.refreshToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async changePassword(user: AuthUser, current: string, next: string) {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await argon2.verify(row.passwordHash, current))) throw new BadRequestException('Current password is wrong');
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await argon2.hash(next) } });
  }

  async setLanguage(user: AuthUser, language: string) {
    await this.prisma.user.update({ where: { id: user.id }, data: { language } });
  }

  /** Load the user for a request. Returns null if the account is missing or disabled. */
  async loadUser(id: string): Promise<AuthUser | null> {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { permissions: true } });
    if (!u || !u.active) return null;
    return {
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      language: u.language,
      accessVersion: u.accessVersion,
      permissions: rowsToMap(u.role, u.permissions),
    };
  }

  toMe(u: AuthUser): MeResponse {
    return {
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      language: u.language as MeResponse['language'],
      permissions: u.permissions,
      accessKey: `${u.id}:${u.accessVersion}`,
    };
  }

  private async issueTokens(userId: string, deviceName?: string): Promise<LoginResponse> {
    const user = await this.loadUser(userId);
    if (!user) throw new UnauthorizedException('This account is disabled');
    const id = randomUUID();
    const secret = randomBytes(32).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        id,
        userId,
        tokenHash: sha256(secret),
        deviceName: deviceName?.slice(0, 100),
        expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 86400_000),
      },
    });
    const accessToken = await this.jwt.signAsync({ sub: userId }, { secret: config.jwtSecret, expiresIn: config.accessTokenTtlSeconds });
    return { accessToken, refreshToken: `${id}.${secret}`, user: this.toMe(user) };
  }
}
