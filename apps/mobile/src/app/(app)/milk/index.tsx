import React, { useState } from 'react';
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

/** Milk: one big "Record milk" button, then the day's summary. */
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
      const produced = data.records.filter((r) => r.data.animalId === a.animal.id && r.data.date === date && !r.data.deletedAt).reduce((x, r) => x + r.data.quantityMl, 0);
      const discarded = dayUsages.filter((u) => u.data.type === 'DISCARDED' && u.data.animalId === a.animal.id).reduce((x, u) => x + u.data.quantityMl, 0);
      return produced - discarded > 0 ? { a, ml: produced - discarded } : null;
    })
    .filter(Boolean) as { a: (typeof data.animals)[number]; ml: number }[];

  return (
    <Screen>
      {can('milk', 'add') ? (
        <Button title={`🥛 ${t('recordMilk')}`} onPress={() => router.push({ pathname: '/milk/entry', params: { date } })} style={{ minHeight: 64 }} />
      ) : null}

      {data.animals.length === 0 ? (
        <Card>
          <Body style={{ fontWeight: '700' }}>🐄 {t('addAnimalFirst')}</Body>
          {can('animals', 'add') ? <Button title={t('addAnimal')} variant="secondary" onPress={() => router.push('/animals/new')} /> : null}
        </Card>
      ) : null}

      <DateField label={t('date')} value={date} onChange={(d) => d && setDate(d)} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Section>{formatDate(date)}</Section>
          {s.isToday ? <Badge text={t('dayInProgress')} tone="info" /> : s.complete ? <Badge text={t('complete')} tone="good" /> : <Badge text={t('incomplete')} tone="warn" />}
        </Row>
        <InfoLine label={`☀️ ${t('morning')}`} value={L(s.morningMl)} />
        <InfoLine label={`🌙 ${t('evening')}`} value={L(s.eveningMl)} />
        <InfoLine label={t('produced')} value={L(s.producedMl)} />
        {data.soldByDate ? <InfoLine label={t('sold')} value={L(s.soldMl)} /> : null}
        {MILK_USAGE_TYPES.map((u) => (s.usedMl[u] ? <InfoLine key={u} label={t(`u_${u}`)} value={L(s.usedMl[u])} /> : null))}
        {data.soldByDate ? <InfoLine label={t('remaining')} value={L(s.remainingMl)} /> : null}
        {s.expected > 0 ? <Muted>{t('recordedOf', { recorded: s.recorded, expected: s.expected })}</Muted> : null}
      </Card>
      {data.soldByDate && s.remainingMl < 0 ? <Notice tone="warn" text={t('remainingNegative')} /> : null}

      {withdrawalMilk.length ? (
        <Card>
          <Body style={{ fontWeight: '700' }}>{t('withdrawalToday')}</Body>
          {withdrawalMilk.map(({ a, ml }) => (
            <Row key={a.animal.id} style={{ justifyContent: 'space-between' }}>
              <Body style={{ flexShrink: 1 }}>{t('withdrawalMilk', { tag: a.animal.tag, litres: litres(ml) })}</Body>
              {can('milk', 'add') ? (
                <Button title={t('recordDiscarded')} variant="danger" onPress={() => local().repo.create('MilkUsage', me!.id, newId(), { date, type: 'DISCARDED', quantityMl: ml, animalId: a.animal.id, session: null, note: t('withdrawalToday') })} />
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

      <Button title={t('monthly')} variant="secondary" onPress={() => router.push({ pathname: '/milk/month', params: { month: date.slice(0, 7) } })} />
      {can('milk', 'add') ? <Button title={`+ ${t('addUsage')}`} variant="ghost" onPress={() => router.push({ pathname: '/milk/usage', params: { date } })} /> : null}
    </Screen>
  );
}
