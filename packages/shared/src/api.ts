import type { Language } from './enums';
import type { Role } from './permissions';
import type { PermissionMap } from './permissions';

export interface MeResponse {
  id: string;
  name: string;
  username: string;
  role: Role;
  language: Language;
  permissions: PermissionMap;
  accessKey: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: MeResponse;
}

export interface AuditEntry {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'CONFLICT_RESOLVED';
  userId: string;
  userName: string;
  at: string;
  clientTime: string | null;
  changes: Record<string, { from: unknown; to: unknown }>;
}

export interface UserSummary {
  id: string;
  name: string;
  username: string;
  role: Role;
  active: boolean;
  permissions: PermissionMap;
}
