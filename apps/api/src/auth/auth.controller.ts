import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { LANGUAGES } from '@dairy/shared';
import { CurrentUser, Public, type AuthUser } from '../common/auth-user';
import { parseBody } from '../common/zod';
import { AuthService } from './auth.service';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, 'Username: 3-30 letters, numbers, dot, dash or underscore');
export const passwordSchema = z.string().min(6, 'Password must be at least 6 characters').max(100);

const setupSchema = z.object({
  setupCode: z.string(),
  name: z.string().trim().min(1).max(80),
  username: usernameSchema,
  password: passwordSchema,
  deviceName: z.string().optional(),
});
const loginSchema = z.object({ username: z.string(), password: z.string(), deviceName: z.string().optional() });
const refreshSchema = z.object({ refreshToken: z.string() });

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Get('status')
  async status() {
    return { needsSetup: await this.auth.needsSetup() };
  }

  @Public()
  @Post('setup')
  setup(@Body() body: unknown) {
    return this.auth.setup(parseBody(setupSchema, body));
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown) {
    const b = parseBody(loginSchema, body);
    return this.auth.login(b.username, b.password, b.deviceName);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: unknown) {
    return this.auth.refresh(parseBody(refreshSchema, body).refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: unknown) {
    await this.auth.logout(parseBody(refreshSchema, body).refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.toMe(user);
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const b = parseBody(z.object({ language: z.enum(LANGUAGES) }), body);
    await this.auth.setLanguage(user, b.language);
    return { ...this.auth.toMe(user), language: b.language };
  }

  @Post('password')
  @HttpCode(204)
  async password(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const b = parseBody(z.object({ current: z.string(), next: passwordSchema }), body);
    await this.auth.changePassword(user, b.current, b.next);
  }
}
