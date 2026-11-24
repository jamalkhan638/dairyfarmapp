import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSync } from '../../lib/sync';
import { useLocalQuery } from '../../lib/hooks';
import { local } from '../../lib/db';
import { useSession } from '../../lib/session';
import { formatDateTime } from '../../lib/format';
import { entityLabel, recordTitle } from '../../domain/entity-labels';
import { Badge, Body, Button, Card, InfoLine, Muted, Row, Screen, Section } from '../../components/ui';

export default function SyncDetails() {
  const { t } = useTranslation();
  const router = useRouter();
  const { me } = useSession();
  const { status, online, syncNow } = useSync();
  const { data } = useLocalQuery(async () => {
    const { repo } = local();
    const outbox = await repo.outbox();
    const conflicts = (await repo.list<any>('SyncConflict')).filter((c) => c.data.status !== 'RESOLVED');
    const titles = new Map<string, string>();
    for (const r of outbox) {
      const rec = await repo.get(r.entity, r.record_id);
      titles.set(`${r.entity}:${r.record_id}`, recordTitle(r.entity, rec?.data));
    }
    for (const c of conflicts) titles.set(`c:${c.id}`, recordTitle(c.data.entity, c.data.theirs ?? c.data.mine?.data));
    return { outbox, conflicts, titles };
  });

  const op = { create: t('opCreate'), update: t('opUpdate'), delete: t('opDelete'), resolve: t('opResolve') };
  const rejected = (data?.outbox ?? []).filter((r) => r.status === 'rejected');
  const waiting = (data?.outbox ?? []).filter((r) => r.status === 'pending' || r.status === 'blocked');
  const heldBy = new Set((data?.outbox ?? []).filter((r) => r.status === 'conflict' || r.status === 'rejected').map((r) => r.record_id));

  return (
    <Screen>
      <Card>
        <InfoLine label={t('sync')} value={online ? t('online') : t('offline')} />
        <InfoLine label={t('lastSync', { time: '' }).replace(/[:：]\s*$/, '')} value={status.lastSyncAt ? formatDateTime(status.lastSyncAt) : t('neverSynced')} />
        <InfoLine label={t('waitingChanges')} value={String(status.pending)} />
        {status.uploads ? <InfoLine label={t('photo')} value={t('uploadsWaiting', { count: status.uploads })} /> : null}
        {status.lastError ? <Muted>{status.lastError}</Muted> : null}
      </Card>
      <Button title={status.phase === 'syncing' ? t('syncing') : t('syncNow')} onPress={syncNow} busy={status.phase === 'syncing'} />

      {data?.conflicts.length ? <Section>{t('conflicts')}</Section> : null}
      {data?.conflicts.map((c) => (
        <Card key={c.id} onPress={() => router.push(`/conflict/${c.id}`)}>
          <Row>
            <Badge text={t('conflict')} tone="bad" />
            <Body style={{ fontWeight: '700' }}>{entityLabel(c.data.entity)} {data.titles.get(`c:${c.id}`)}</Body>
          </Row>
          <Muted>{formatDateTime(c.data.createdAt)}{c.data.createdById !== me?.id ? '' : ''}</Muted>
        </Card>
      ))}

      {rejected.length ? <Section>{t('notAccepted')}</Section> : null}
      {rejected.map((r) => (
        <Card key={r.seq}>
          <Body style={{ fontWeight: '700' }}>{op[r.op]} · {entityLabel(r.entity)} {data?.titles.get(`${r.entity}:${r.record_id}`)}</Body>
          <Muted>{r.error_code === 'forbidden' ? t('noPermission') : r.error}</Muted>
          <Muted>{formatDateTime(r.client_time)}</Muted>
          <Row>
            <Button title={t('retry')} variant="secondary" onPress={() => local().repo.retry(r.seq)} style={{ flex: 1 }} />
            <Button title={t('discard')} variant="danger" onPress={() => local().repo.discard(r.seq)} style={{ flex: 1 }} />
          </Row>
        </Card>
      ))}

      {waiting.length ? <Section>{t('waitingChanges')}</Section> : null}
      {waiting.map((r) => (
        <View key={r.seq}>
          <Card>
            <Body>{op[r.op]} · {entityLabel(r.entity)} {data?.titles.get(`${r.entity}:${r.record_id}`)}</Body>
            <Muted>{formatDateTime(r.client_time)}</Muted>
            {heldBy.has(r.record_id) || r.status === 'blocked' ? <Badge text={t('waitingForConflict')} tone="warn" /> : null}
          </Card>
        </View>
      ))}
    </Screen>
  );
}
