import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../lib/session';
import { local, newId } from '../lib/db';
import { formatDate } from '../lib/format';
import { completeReminder } from '../domain/health-actions';
import { reminderText } from '../domain/reminder-text';
import type { DueReminder } from '../domain/health';
import { Badge, Body, Button, Card, Muted, Row } from './ui';

/** Reminders with a "Done" button. Tapping opens the animal (or the custom reminder). */
export function ReminderList({ list, tagOf, tone }: { list: DueReminder[]; tagOf: (id: string) => string | undefined; tone: 'bad' | 'warn' | 'info' }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { me, can } = useSession();
  return (
    <>
      {list.map((r) => (
        <Card key={r.key} onPress={() => (r.reminderId ? router.push({ pathname: '/health/reminder', params: { id: r.reminderId } }) : r.animalId ? router.push(`/animals/${r.animalId}`) : undefined)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body style={{ fontWeight: '700', flexShrink: 1 }}>{reminderText(r, tagOf)}</Body>
            <Badge text={formatDate(r.dueDate)} tone={tone} />
          </Row>
          {r.kind === 'WITHDRAWAL_END' ? <Muted>{t('withdrawalHint')}</Muted> : null}
          {can('health', 'add') && r.kind !== 'WITHDRAWAL_END' ? (
            <Button title={t('markDone')} variant="secondary" onPress={() => completeReminder(local().repo, me!.id, newId, { ...r, title: reminderText(r, tagOf) })} />
          ) : null}
        </Card>
      ))}
    </>
  );
}
