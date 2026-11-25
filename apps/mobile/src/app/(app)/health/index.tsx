import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../lib/session';
import { useHealthData } from '../../../lib/use-health';
import { daysBetween, groupReminders, pregnancy, withdrawalUntil } from '../../../domain/health';
import { isActive } from '../../../domain/animals';
import { formatDate, today } from '../../../lib/format';
import { ReminderList } from '../../../components/ReminderList';
import { Body, Button, Card, Muted, Notice, Row, Screen, Section } from '../../../components/ui';

/** Reminders (overdue, today, next 30 days), pregnant animals, and milk withdrawals. */
export default function HealthHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = useSession();
  const d = useHealthData();
  if (!can('health', 'view')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!d) return <Screen>{null}</Screen>;
  const g = groupReminders(d.due, today());
  const tags = new Map(d.animals.map((a) => [a.animal.id, a.animal.tag]));
  const tagOf = (id: string) => tags.get(id);
  const onFarm = d.animals.filter((a) => isActive(a.status) && a.animal.sex === 'FEMALE');
  const pregnant = onFarm.map((a) => ({ a, p: pregnancy(d.plain.breeding, a.animal.id, d.settings) })).filter((x) => x.p.state === 'PREGNANT').sort((x, y) => (x.p.expectedCalving ?? '').localeCompare(y.p.expectedCalving ?? ''));
  const withdrawals = onFarm.map((a) => ({ a, w: withdrawalUntil(d.plain.health, a.animal.id, today()) })).filter((x) => x.w);

  return (
    <Screen>
      {can('health', 'add') ? (
        <Row>
          <Button title={t('addHealth')} onPress={() => router.push('/health/event')} style={{ flex: 1 }} />
          <Button title={t('addBreeding')} onPress={() => router.push('/health/breeding')} style={{ flex: 1 }} />
        </Row>
      ) : null}
      {withdrawals.length ? (
        <Card>
          <Section>{t('withdrawalToday')}</Section>
          {withdrawals.map(({ a, w }) => <Body key={a.animal.id}>#{a.animal.tag} · {t('underWithdrawal', { date: formatDate(w!.until) })}</Body>)}
        </Card>
      ) : null}

      <Section>{t('reminders')}</Section>
      {g.overdue.length + g.today.length + g.upcoming.length === 0 ? <Muted>{t('noReminders')}</Muted> : null}
      {g.overdue.length ? <Body style={{ fontWeight: '700' }}>{t('overdue')}</Body> : null}
      <ReminderList list={g.overdue} tagOf={tagOf} tone="bad" />
      {g.today.length ? <Body style={{ fontWeight: '700' }}>{t('dueToday')}</Body> : null}
      <ReminderList list={g.today} tagOf={tagOf} tone="warn" />
      {g.upcoming.length ? <Body style={{ fontWeight: '700' }}>{t('upcoming')}</Body> : null}
      <ReminderList list={g.upcoming} tagOf={tagOf} tone="info" />
      {can('health', 'add') ? <Button title={t('addReminder')} variant="secondary" onPress={() => router.push('/health/reminder')} /> : null}

      <Section>{t('pregnantCows')}</Section>
      {pregnant.length === 0 ? <Muted>—</Muted> : null}
      {pregnant.map(({ a, p }) => (
        <Card key={a.animal.id} onPress={() => router.push(`/animals/${a.animal.id}`)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body style={{ fontWeight: '700' }}>#{a.animal.tag}{a.animal.name ? ` ${a.animal.name}` : ''}</Body>
            <Muted>{t('expectedCalving')}: {formatDate(p.expectedCalving)}</Muted>
          </Row>
          {p.expectedCalving ? <Muted>{t('daysToCalving', { days: daysBetween(today(), p.expectedCalving) })}</Muted> : null}
        </Card>
      ))}
    </Screen>
  );
}
