import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PermissionMap, Role } from '@dairy/shared';

/** The logged-in user, loaded fresh from the database on every request. */
export interface AuthUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  language: string;
  accessVersion: number;
  permissions: PermissionMap;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

export const IS_PUBLIC = 'isPublic';
/** Endpoint needs no login (setup, login, refresh, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const OWNER_ONLY = 'ownerOnly';
/** Endpoint is for the owner only. */
export const OwnerOnly = () => SetMetadata(OWNER_ONLY, true);
