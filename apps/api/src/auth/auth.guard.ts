import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC, OWNER_ONLY } from '../common/auth-user';
import { config } from '../config';
import { AuthService } from './auth.service';

/** Applied to every endpoint: requires a valid login unless marked @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwt: JwtService, private auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthorizedException('Not logged in');
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: config.jwtSecret });
    } catch {
      throw new UnauthorizedException('Session expired');
    }
    const user = await this.auth.loadUser(payload.sub);
    if (!user) throw new UnauthorizedException('This account is disabled');
    req.user = user;

    if (this.reflector.getAllAndOverride<boolean>(OWNER_ONLY, targets) && user.role !== 'OWNER') {
      throw new ForbiddenException('Only the owner can do this');
    }
    return true;
  }
}
