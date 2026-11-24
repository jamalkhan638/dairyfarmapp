import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLocalQuery, useUserNames } from '../lib/hooks';
import { local } from '../lib/db';
import { daysAgo, formatDate, formatDateTime } from '../lib/format';
import { litres, type MilkRecord } from '../domain/milk';
import { Badge, Body, Card, InfoLine, Muted, Row } from './ui';

/** One cow's milk for the last 30 days, per milking, with who entered it. */
export function AnimalMilk({ animalId }: { animalId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const names = useUserNames();
  const from = daysAgo(29);
  const { data } = useLocalQuery(async () => (await local().repo.list<MilkRecord>('MilkRecord')).filter((r) => r.data.animalId === animalId && r.data.date >= from), [animalId, from]);
  const rows = (data ?? []).sort((a, b) => (a.data.date === b.data.date ? a.data.session.localeCompare(b.data.session) : b.data.date.localeCompare(a.data.date)));
  const total = rows.reduce((s, r) => s + r.data.quantityMl, 0);
  return (
    <>
      <Card>
        <InfoLine label={t('last30')} value={`${litres(total)} ${t('L')}`} />
        {rows.length ? <InfoLine label={t('averagePerMilking')} value={`${litres(Math.round(total / rows.length))} ${t('L')}`} /> : null}
      </Card>
      {rows.length === 0 ? <Muted>{t('noEntries')}</Muted> : null}
      {rows.map((r) => (
        <Card key={r.id} onPress={() => router.push(`/history/MilkRecord/${r.id}`)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body>{formatDate(r.data.date)} · {r.data.session === 'MORNING' ? t('morning') : t('evening')}</Body>
            <Body style={{ fontWeight: '800' }}>{litres(r.data.quantityMl)} {t('L')}</Body>
          </Row>
          <Muted>{t('addedBy', { name: names.get(r.data.createdById) ?? t('unknownUser'), time: formatDateTime((r.data as any).clientCreatedAt ?? (r.data as any).createdAt) })}</Muted>
          {r.syncState !== 'synced' ? <Badge text={t(r.syncState === 'pending' ? 'statePending' : 'stateConflict')} tone={r.syncState === 'pending' ? 'warn' : 'bad'} /> : null}
        </Card>
      ))}
    </>
  );
}
