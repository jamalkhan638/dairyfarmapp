import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ANIMAL_STATUSES } from '@dairy/shared';
import { useSession } from '../../lib/session';
import { useLocalQuery } from '../../lib/hooks';
import { local } from '../../lib/db';
import { loadAnimals } from '../../domain/animals';
import { litres, loadMilk, summarizeDay } from '../../domain/milk';
import { formatPKR, today } from '../../lib/format';
import { balances, loadSales } from '../../domain/sales';
import { computeReminders, groupReminders, loadHealth } from '../../domain/health';
import { ReminderList } from '../../components/ReminderList';
import { Body, Button, Card, Muted, Row, Screen, Section, Title } from '../../components/ui';
import { colors } from '../../lib/theme';

export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const { me, can } = useSession();
  const { data } = useLocalQuery(async () => {
    const repo = local().repo;
    const animals = await loadAnimals(repo);
    const h = await loadHealth(repo);
    const due = computeReminders(animals, { health: h.health.map((x) => x.data), breeding: h.breeding.map((x) => x.data), reminders: h.reminders.map((x) => x.data), settings: h.settings }, today());
    return { animals, milk: await loadMilk(repo), sales: await loadSales(repo), due };
  });
  const reminders = data ? groupReminders(data.due, today()) : null;
  const tagOf = (id: string) => data?.animals.find((a) => a.animal.id === id)?.animal.tag;
  const owed = data ? [...balances(data.sales.deliveries.map((d) => d.data), data.sales.payments.map((p) => p.data)).values()].reduce((s, b) => s + Math.max(0, b.balancePaisa), 0) : 0;
  const soldToday = data ? data.sales.deliveries.filter((d) => d.data.date === today()).reduce((s, d) => s + d.data.quantityMl, 0) : 0;
  const animals = data?.animals;
  const day = data ? summarizeDay(today(), data.animals, data.milk.records.map((r) => r.data), data.milk.usages.map((u) => u.data)) : null;
  const counts = Object.fromEntries(ANIMAL_STATUSES.map((st) => [st, (animals ?? []).filter((a) => a.status === st).length]));

  return (
    <Screen>
      <Title>{t('hello', { name: me?.name ?? '' })}</Title>
      {can('health', 'view') && reminders && reminders.overdue.length + reminders.today.length > 0 ? (
        <>
          <Section>{t('remindersDue', { count: reminders.overdue.length + reminders.today.length })}</Section>
          <ReminderList list={[...reminders.overdue, ...reminders.today].slice(0, 5)} tagOf={tagOf} tone="warn" />
        </>
      ) : null}
      {can('animals', 'view') ? (
        <Card onPress={() => router.push('/animals')}>
          <Section>{t('herd')}</Section>
          <Row style={{ flexWrap: 'wrap', gap: 16 }}>
            {(['MILKING', 'DRY', 'YOUNG'] as const).map((st) => (
              <View key={st} style={{ minWidth: 90 }}>
                <Body style={{ fontSize: 28, fontWeight: '800', color: colors.primaryDark }}>{counts[st]}</Body>
                <Muted>{t(`s_${st}`)}</Muted>
              </View>
            ))}
          </Row>
        </Card>
      ) : null}
      {can('milk', 'view') && day ? (
        <Card onPress={() => router.push('/milk')}>
          <Section>{t('todayMilk')}</Section>
          <Body style={{ fontSize: 28, fontWeight: '800', color: colors.primaryDark }}>{litres(day.producedMl)} {t('L')}</Body>
          <Muted>{t('morning')} {litres(day.morningMl)} · {t('evening')} {litres(day.eveningMl)}</Muted>
          <Muted>{t('recordedOf', { recorded: day.recorded, expected: day.expected })}</Muted>
        </Card>
      ) : null}
      {can('milk', 'add') ? (
        <Row>
          <Button title={t('morning')} onPress={() => router.push({ pathname: '/milk/entry', params: { date: today(), session: 'MORNING' } })} style={{ flex: 1 }} />
          <Button title={t('evening')} onPress={() => router.push({ pathname: '/milk/entry', params: { date: today(), session: 'EVENING' } })} style={{ flex: 1 }} />
        </Row>
      ) : null}
      {can('milk', 'view') ? <Button title={t('milk')} variant="secondary" onPress={() => router.push('/milk')} /> : null}
      {can('sales', 'view') && data ? (
        <Card onPress={() => router.push('/sales')}>
          <Section>{t('sales')}</Section>
          <Muted>{t('soldTo')}: {litres(soldToday)} {t('L')}</Muted>
          <Body style={{ fontWeight: '700' }}>{t('totalOwed')}: {formatPKR(owed)}</Body>
        </Card>
      ) : null}
      {can('sales', 'add') ? <Button title={t('deliveryRound')} onPress={() => router.push({ pathname: '/sales/round', params: { date: today(), session: 'MORNING' } })} /> : null}
      {can('sales', 'view') ? <Button title={t('customers')} variant="secondary" onPress={() => router.push('/sales')} /> : null}
      {can('feed', 'add') ? <Button title={t('recordFeeding')} onPress={() => router.push('/feed/feeding')} /> : null}
      {can('feed', 'view') ? <Button title={t('feed')} variant="secondary" onPress={() => router.push('/feed')} /> : null}
      {can('expenses', 'add') ? <Button title={t('addExpense')} onPress={() => router.push('/money/expense')} /> : null}
      {can('expenses', 'view') || can('finance', 'view') ? <Button title={t('money')} variant="secondary" onPress={() => router.push('/money')} /> : null}
      {can('health', 'view') ? <Button title={t('health')} variant="secondary" onPress={() => router.push('/health')} /> : null}
      {can('animals', 'view') ? <Button title={t('animals')} onPress={() => router.push('/animals')} /> : null}
      {can('animals', 'add') ? <Button title={t('addAnimal')} variant="secondary" onPress={() => router.push('/animals/new')} /> : null}
      <Button title={t('settings')} variant="secondary" onPress={() => router.push('/settings')} />
      <Muted>{t('comingSoon')}</Muted>
    </Screen>
  );
}
