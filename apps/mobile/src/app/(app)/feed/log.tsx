import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../lib/session';
import { useFeedData } from '../../../lib/use-feed';
import { useUserNames } from '../../../lib/hooks';
import { consumptionCost, feedExpense, kg } from '../../../domain/feed';
import { formatDateTime, formatPKR, today } from '../../../lib/format';
import { Badge, Body, Button, Card, DateField, InfoLine, Muted, Notice, Row, Screen } from '../../../components/ui';

/** Everything fed on one day, with its cost. */
export default function FeedingLog() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = useSession();
  const names = useUserNames();
  const [date, setDate] = useState<string>(today());
  const data = useFeedData();
  if (!can('feed', 'view')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!data) return <Screen>{null}</Screen>;
  const P = data.purchases.map((p) => p.data);
  const day = data.consumptions.filter((c) => c.data.date === date);
  const exp = feedExpense(day.map((c) => c.data), P, date, date);
  const item = (id: string) => data.items.find((i) => i.id === id)?.data.name ?? '';
  const tagOf = (id: string) => data.animals.find((a) => a.animal.id === id)?.animal.tag ?? '?';
  return (
    <Screen footer={can('feed', 'add') ? <Button title={t('recordFeeding')} onPress={() => router.push({ pathname: '/feed/feeding', params: { date } })} /> : undefined}>
      <DateField label={t('date')} value={date} onChange={(d) => d && setDate(d)} />
      <Card>
        <InfoLine label={t('feedExpense')} value={formatPKR(exp.costPaisa)} />
        <InfoLine label={t('kgFed')} value={kg(exp.fedGrams)} />
        <InfoLine label={t('kgWasted')} value={kg(exp.wastedGrams)} />
        {exp.unpricedGrams ? <Notice tone="warn" text={t('unpricedFeed', { kg: kg(exp.unpricedGrams) })} /> : null}
      </Card>
      {day.length === 0 ? <Muted>{t('noEntries')}</Muted> : null}
      {day.map((c) => {
        const cost = consumptionCost(c.data, P);
        const n = c.data.animalIds.length;
        return (
          <Card key={c.id} onPress={() => router.push({ pathname: '/feed/feeding', params: { id: c.id } })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body style={{ fontWeight: '700', flexShrink: 1 }}>{item(c.data.feedItemId)} · {kg(c.data.quantityGrams)} {t('kgUnit')}</Body>
              <Body style={{ fontWeight: '800' }}>{cost === null ? '—' : formatPKR(cost)}</Body>
            </Row>
            <Muted>{n === 1 ? `#${tagOf(c.data.animalIds[0])}` : t('animalsCount', { count: n })}{c.data.wastedGrams ? ` · ${t('kgWasted')} ${kg(c.data.wastedGrams)}` : ''}</Muted>
            <Muted>{t('addedBy', { name: names.get(c.data.createdById) ?? t('unknownUser'), time: formatDateTime((c.data as any).clientCreatedAt ?? (c.data as any).createdAt) })}</Muted>
            <Row>
              {n > 1 ? <Badge text={t('estimateLabel')} tone="warn" /> : null}
              {c.syncState !== 'synced' ? <Badge text={t('statePending')} tone="warn" /> : null}
            </Row>
          </Card>
        );
      })}
    </Screen>
  );
}
