import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MILK_USAGE_TYPES } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useMilkData } from '../../../lib/use-milk';
import { withdrawalUntil } from '../../../domain/health';
import { local, newId } from '../../../lib/db';
import { litres, summarizeDay } from '../../../domain/milk';
import { formatDate, today } from '../../../lib/format';
import { Badge, Body, Button, Card, DateField, InfoLine, Muted, Notice, Row, Screen, Section } from '../../../components/ui';

/** One day of milk: totals, what is missing, and milk used without selling. */
export default function MilkDay() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const { me, can } = useSession();
  const [date, setDate] = useState<string>(params.date ?? today());
  const data = useMilkData();

  if (!can('milk', 'view')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!data) return <Screen>{null}</Screen>;
  const s = summarizeDay(date, data.animals, data.records.map((r) => r.data), data.usages.map((u) => u.data), data.soldByDate?.[date] ?? 0);
  const L = (ml: number) => `${litres(ml)} ${t('L')}`;
  const dayUsages = data.usages.filter((u) => u.data.date === date);
  // Milk from cows under withdrawal that day, minus what was already recorded as discarded for them.
  const withdrawalMilk = data.animals
    .map((a) => {
      if (!withdrawalUntil(data.health, a.animal.id, date)) return null;
      const produced = data.records.filter((r) => r.data.animalId === a.animal.id && r.data.date === date && !r.data.deletedAt).reduce((t, r) => t + r.data.quantityMl, 0);
      const discarded = dayUsages.filter((u) => u.data.type === 'DISCARDED' && u.data.animalId === a.animal.id).reduce((t, u) => t + u.data.quantityMl, 0);
      return produced - discarded > 0 ? { a, ml: produced - discarded } : null;
    })
    .filter(Boolean) as { a: (typeof data.animals)[number]; ml: number }[];
  const tag = (id: string | null) => (id ? data.animals.find((a) => a.animal.id === id)?.animal.tag : null);

  return (
    <Screen>
      <DateField label={t('date')} value={date} onChange={(d) => d && setDate(d)} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Section>{formatDate(date)}</Section>
          {s.isToday ? <Badge text={t('dayInProgress')} tone="info" /> : s.complete ? <Badge text={t('complete')} tone="good" /> : <Badge text={t('incomplete')} tone="warn" />}
        </Row>
        <InfoLine label={t('morning')} value={L(s.morningMl)} />
        <InfoLine label={t('evening')} value={L(s.eveningMl)} />
        <InfoLine label={t('produced')} value={L(s.producedMl)} />
        <Muted>{t('recordedOf', { recorded: s.recorded, expected: s.expected })}</Muted>
      </Card>

      {can('milk', 'add') ? (
        <Row>
          <Button title={`${t('recordMilk')}: ${t('morning')}`} onPress={() => router.push({ pathname: '/milk/entry', params: { date, session: 'MORNING' } })} style={{ flex: 1 }} />
          <Button title={`${t('recordMilk')}: ${t('evening')}`} onPress={() => router.push({ pathname: '/milk/entry', params: { date, session: 'EVENING' } })} style={{ flex: 1 }} />
        </Row>
      ) : null}

      {withdrawalMilk.length ? (
        <Card>
          <Body style={{ fontWeight: '700' }}>{t('withdrawalToday')}</Body>
          {withdrawalMilk.map(({ a, ml }) => (
            <Row key={a.animal.id} style={{ justifyContent: 'space-between' }}>
              <Body style={{ flexShrink: 1 }}>{t('withdrawalMilk', { tag: a.animal.tag, litres: litres(ml) })}</Body>
              {can('milk', 'add') ? (
                <Button title={t('recordDiscarded')} variant="danger" onPress={() => local().repo.create('MilkUsage', me!.id, newId(), { date, type: 'DISCARDED', quantityMl: ml, animalId: a.animal.id, note: t('withdrawalToday') })} />
              ) : null}
            </Row>
          ))}
        </Card>
      ) : null}
      {s.missing.length ? (
        <Card>
          <Body style={{ fontWeight: '700' }}>{t('missingEntries')}</Body>
          {s.missing.map((m) => (
            <Muted key={`${m.animal.animal.id}${m.session}`}>
              #{m.animal.animal.tag}{m.animal.animal.name ? ` ${m.animal.animal.name}` : ''} · {m.session === 'MORNING' ? t('morning') : t('evening')}
            </Muted>
          ))}
          <Muted>{t('missingNote')}</Muted>
        </Card>
      ) : null}
      {s.expected === 0 ? <Muted>{t('noMilkingCows')}</Muted> : null}

      <Section>{t('usage')}</Section>
      <Card>
        <InfoLine label={t('produced')} value={L(s.producedMl)} />
        {MILK_USAGE_TYPES.map((u) => <InfoLine key={u} label={t(`u_${u}`)} value={L(s.usedMl[u])} />)}
        <InfoLine label={t('sold')} value={data.soldByDate ? L(s.soldMl) : '—'} />
        <InfoLine label={t('remaining')} value={data.soldByDate ? L(s.remainingMl) : '—'} />
        <Muted>{t('soldComing')}</Muted>
      </Card>
      {data.soldByDate && s.remainingMl < 0 ? <Notice tone="warn" text={t('remainingNegative')} /> : null}
      {dayUsages.map((u) => (
        <Card key={u.id} onPress={can('milk', 'edit') ? () => router.push({ pathname: '/milk/usage', params: { id: u.id } }) : undefined}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body>{t(`u_${u.data.type}`)}{tag(u.data.animalId) ? ` · #${tag(u.data.animalId)}` : ''}</Body>
            <Body style={{ fontWeight: '700' }}>{L(u.data.quantityMl)}</Body>
          </Row>
          {u.data.note ? <Muted>{u.data.note}</Muted> : null}
          {u.syncState !== 'synced' ? <Badge text={t('statePending')} tone="warn" /> : null}
        </Card>
      ))}
      {can('milk', 'add') ? <Button title={t('addUsage')} variant="secondary" onPress={() => router.push({ pathname: '/milk/usage', params: { date } })} /> : null}
      <View style={{ height: 8 }} />
      <Button title={t('monthly')} variant="secondary" onPress={() => router.push({ pathname: '/milk/month', params: { month: date.slice(0, 7) } })} />
    </Screen>
  );
}
