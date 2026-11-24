import { emptyPermissionMap, fullPermissionMap, MODULES, type PermissionMap, type Role } from '@dairy/shared';

export interface PermissionRow {
  module: string;
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export function rowsToMap(role: Role, rows: PermissionRow[]): PermissionMap {
  if (role === 'OWNER') return fullPermissionMap();
  const map = emptyPermissionMap();
  for (const r of rows) {
    if (!(MODULES as readonly string[]).includes(r.module)) continue;
    const anyWrite = r.canAdd || r.canEdit || r.canDelete;
    // Adding, editing or deleting always implies being able to see the module.
    map[r.module as keyof PermissionMap] = { view: r.canView || anyWrite, add: r.canAdd, edit: r.canEdit, delete: r.canDelete };
  }
  return map;
}

export function mapToRows(map: Partial<PermissionMap>): PermissionRow[] {
  return MODULES.map((m) => {
    const p = map[m] ?? { view: false, add: false, edit: false, delete: false };
    const anyWrite = p.add || p.edit || p.delete;
    return { module: m, canView: p.view || anyWrite, canAdd: p.add, canEdit: p.edit, canDelete: p.delete };
  });
}
