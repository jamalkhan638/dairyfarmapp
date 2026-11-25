import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../lib/session';
import { useHealthData } from '../lib/use-health';
import { daysBetween, pregnancy, withdrawalUntil } from '../domain/health';
import { formatDate, today } from '../lib/format';
import { ReminderList } from './ReminderList';
import { Badge, Body, Button, Card, InfoLine, Muted, Notice, Row, Section } from './ui';

/** One animal's pregnancy status, reminders, and all health & breeding records. */
export function AnimalHealth({ animalId }: { animalId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = useSession();
  const d = useHealthData();
  if (!d) return null;
  const a = d.animals.find((x) => x.animal.id === animalId);
  const female = a?.animal.sex === 'FEMALE';
  const p = pregnancy(d.plain.breeding, animalId, d.settings);
  const wd = withdrawalUntil(d.plain.health, animalId, today());
  const due = d.due.filter((r) => r.animalId === animalId);
  const tagOf = (id: string) => d.animals.find((x) => x.animal.id === id)?.animal.tag;
  const items = [
    ...d.health.filter((h) => h.data.animalId === animalId).map((h) => ({ kind: 'health' as const, id: h.id, date: h.data.date, h: h.data, sync: h.syncState })),
    ...d.breeding.filter((b) => b.data.animalId === animalId).map((b) => ({ kind: 'breeding' as const, id: b.id, date: b.data.date, b: b.data, sync: b.syncState })),
  ].sort((x, y) => y.date.localeCompare(x.date));

  return (
    <>
      {female ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body style={{ fontWeight: '700' }}>{t('pregnancy')}</Body>
            <Badge text={t(`ps_${p.state}`)} tone={p.state === 'PREGNANT' ? 'good' : p.state === 'INSEMINATED' ? 'info' : 'neutral'} />
          </Row>
          {p.expectedCalving ? <InfoLine label={t('expectedCalving')} value={`${formatDate(p.expectedCalving)} (${t('daysToCalving', { days: daysBetween(today(), p.expectedCalving) })})`} /> : null}
          {p.lastInsemination ? <InfoLine label={t('bt_INSEMINATION')} value={formatDate(p.lastInsemination.date)} /> : null}
          {p.lastCalving ? <InfoLine label={t('lastCalving')} value={formatDate(p.lastCalving)} /> : null}
        </Card>
      ) : null}
      {wd ? <Notice tone="bad" text={t('underWithdrawal', { date: formatDate(wd.until) })} /> : null}
      {can('health', 'add') ? (
        <Row>
          <Button title={t('addHealth')} onPress={() => router.push({ pathname: '/health/event', params: { animalId } })} style={{ flex: 1 }} />
          {female ? <Button title={t('addBreeding')} variant="secondary" onPress={() => router.push({ pathname: '/health/breeding', params: { animalId } })} style={{ flex: 1 }} /> : null}
        </Row>
      ) : null}
      {due.length ? (
        <>
          <Section>{t('reminders')}</Section>
          <ReminderList list={due} tagOf={tagOf} tone={due.some((r) => r.dueDate < today()) ? 'bad' : 'info'} />
        </>
      ) : null}
      <Section>{t('healthHistory')}</Section>
      {items.length === 0 ? <Muted>{t('noEntries')}</Muted> : null}
      {items.map((x) => (
        <Card key={x.id} onPress={() => router.push({ pathname: x.kind === 'health' ? '/health/event' : '/health/breeding', params: { id: x.id } })}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body style={{ fontWeight: '700', flexShrink: 1 }}>
              {x.kind === 'health' ? `${t(`ht_${x.h.type}`)} · ${x.h.title}` : `${t(`bt_${x.b.type}`)}${x.b.result ? ` · ${t(`pr_${x.b.result}`)}` : ''}`}
            </Body>
            <Muted>{formatDate(x.date)}</Muted>
          </Row>
          {x.kind === 'health' && (x.h.medicine || x.h.vetName) ? <Muted>{[x.h.medicine, x.h.dose, x.h.vetName].filter(Boolean).join(' · ')}</Muted> : null}
          {x.kind === 'health' && x.h.withdrawalEndDate ? <Muted>{t('underWithdrawal', { date: formatDate(x.h.withdrawalEndDate) })}</Muted> : null}
          {x.kind === 'breeding' && x.b.sire ? <Muted>{t(`im_${x.b.method ?? 'AI'}`)} · {x.b.sire}</Muted> : null}
          {x.sync !== 'synced' ? <Badge text={t('statePending')} tone="warn" /> : null}
        </Card>
      ))}
    </>
  );
}
