/** Feature modules a worker can be given access to. */
export const MODULES = ['animals', 'milk', 'sales', 'feed', 'expenses', 'health', 'reports', 'finance'] as const;
export type ModuleName = (typeof MODULES)[number];

export const ACTIONS = ['view', 'add', 'edit', 'delete'] as const;
export type Action = (typeof ACTIONS)[number];

export type Role = 'OWNER' | 'WORKER';

export interface ModulePermission {
  view: boolean;
  add: boolean;
  edit: boolean;
  delete: boolean;
}

export type PermissionMap = Record<ModuleName, ModulePermission>;

export const NO_ACCESS: ModulePermission = { view: false, add: false, edit: false, delete: false };
export const FULL_ACCESS: ModulePermission = { view: true, add: true, edit: true, delete: true };

export function emptyPermissionMap(): PermissionMap {
  return Object.fromEntries(MODULES.map((m) => [m, { ...NO_ACCESS }])) as PermissionMap;
}

export function fullPermissionMap(): PermissionMap {
  return Object.fromEntries(MODULES.map((m) => [m, { ...FULL_ACCESS }])) as PermissionMap;
}

/** Owners can do everything; workers only what the map allows. Add/edit/delete imply view. */
export function can(role: Role, perms: PermissionMap | undefined, module: ModuleName, action: Action): boolean {
  if (role === 'OWNER') return true;
  if (!perms) return false;
  return !!perms[module]?.[action];
}
