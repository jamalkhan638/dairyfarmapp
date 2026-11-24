import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { SyncState } from '../sync/repo';
import { useUserNames } from '../lib/hooks';
import { formatDateTime } from '../lib/format';
import { Badge, Muted } from './ui';

/**
 * "Added by …" and "Last updated by …". Names come from the user ids the server
 * stored with the record; nobody types them.
 */
export function RecordMeta({ data, syncState }: { data: Record<string, any>; syncState: SyncState }) {
  const { t } = useTranslation();
  const names = useUserNames();
  const name = (id: string) => names.get(id) ?? t('unknownUser');
  const created = data.clientCreatedAt ?? data.createdAt;
  const updated = data.clientUpdatedAt ?? data.updatedAt;
  const edited = (data.version ?? 0) > 1 || data.updatedById !== data.createdById || updated !== created;
  const badge = {
    synced: <Badge text={t('stateSynced')} tone="good" />,
    pending: <Badge text={t('statePending')} tone="warn" />,
    conflict: <Badge text={t('stateConflict')} tone="bad" />,
    rejected: <Badge text={t('stateRejected')} tone="bad" />,
  }[syncState];
  return (
    <View style={{ gap: 4 }}>
      {badge}
      <Muted>{t('addedBy', { name: name(data.createdById), time: formatDateTime(created) })}</Muted>
      {edited ? <Muted>{t('updatedBy', { name: name(data.updatedById), time: formatDateTime(updated) })}</Muted> : null}
    </View>
  );
}
