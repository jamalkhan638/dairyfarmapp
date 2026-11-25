import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AuditEntry } from '@dairy/shared';
import { api } from '../lib/api';
import { local } from '../lib/db';
import { formatDateTime } from '../lib/format';
import { Body, Card, Muted, Notice } from './ui';
import { fieldLabel, formatValue } from '../domain/entity-labels';
import { useLookups } from '../lib/use-animal-tags';

/** Who changed what and when. Loaded from the server; the last copy is kept for offline viewing. */
export function HistoryList({ entity, id }: { entity: string; id: string }) {
  const lookups = useLookups();
  const { t } = useTranslation();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [offline, setOffline] = useState(false);
  const key = `history:${entity}:${id}`;

  useEffect(() => {
    (async () => {
      const cached = await local().repo.getMeta(key);
      if (cached) setEntries(JSON.parse(cached));
      try {
        const fresh = await api.history(entity, id);
        setEntries(fresh);
        await local().repo.setMeta(key, JSON.stringify(fresh));
      } catch {
        setOffline(true);
      }
    })();
  }, [entity, id, key]);

  const action = { CREATE: t('created'), UPDATE: t('updated'), DELETE: t('deleted'), CONFLICT_RESOLVED: t('conflictResolved') };

  return (
    <View style={{ gap: 8 }}>
      {offline && !entries ? <Notice text={t('historyOffline')} /> : null}
      {(entries ?? []).slice().reverse().map((e) => (
        <Card key={e.id}>
          <Body style={{ fontWeight: '700' }}>
            {action[e.action]} · {e.userName}
          </Body>
          <Muted>{formatDateTime(e.clientTime ?? e.at)}</Muted>
          {e.action !== 'CREATE'
            ? Object.entries(e.changes).map(([f, c]) => (
                <Body key={f}>
                  {fieldLabel(entity, f)}: {formatValue(entity, f, c.from, lookups)} → {formatValue(entity, f, c.to, lookups)}
                </Body>
              ))
            : null}
        </Card>
      ))}
    </View>
  );
}
