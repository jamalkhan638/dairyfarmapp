import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MILK_USAGE_TYPES } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useMilkData } from '../../../lib/use-milk';
import { litres, summarizeMonth } from '../../../domain/milk';
import { formatDate, today } from '../../../lib/format';
import i18n from '../../../lib/i18n';
import { Badge, Body, Button, Card, InfoLine, Muted, Notice, Row, Screen, Section } from '../../../components/ui';

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_UR = ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'];
const monthName = (m: string) => `${(i18n.language === 'en' ? MONTHS_EN : MONTHS_UR)[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
function shift(month: string, by: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** Month totals, with how complete the recording is. */
export default function MilkMonth() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ month?: string }>();
  const { can } = useSession();
  const [month, setMonth] = useState(params.month ?? today().slice(0, 7));
  const data = useMilkData();
  if (!can('milk', 'view')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!data) return <Screen>{null}</Screen>;
  const m = summarizeMonth(month, data.animals, data.records.map((r) => r.data), data.usages.map((u) => u.data));
  const L = (ml: number) => `${litres(ml)} ${t('L')}`;
  const isFuture = month > today().slice(0, 7);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Button title={t('prevMonth')} variant="ghost" onPress={() => setMonth(shift(month, -1))} />
        <Section>{monthName(month)}</Section>
        <Button title={t('nextMonth')} variant="ghost" onPress={() => setMonth(shift(month, 1))} disabled={isFuture || month === today().slice(0, 7)} />
      </Row>
      <Card>
        <Row style={{ flexWrap: 'wrap' }}>
          {m.inProgress ? <Badge text={t('inProgress')} tone="info" /> : null}
          {m.complete ? <Badge text={t('complete')} tone="good" /> : <Badge text={t('incomplete')} tone="warn" />}
        </Row>
        <InfoLine label={t('produced')} value={L(m.producedMl)} />
        {MILK_USAGE_TYPES.map((u) => <InfoLine key={u} label={t(`u_${u}`)} value={L(m.usedMl[u])} />)}
        <InfoLine label={t('sold')} value="—" />
        <Muted>{t('recordedOf', { recorded: m.recorded, expected: m.expected })}</Muted>
        {m.recorded > 0 ? <Muted>{t('averagePerMilking')}: {L(Math.round(m.producedMl / m.recorded))}</Muted> : null}
        <Muted>{t('missingNote')}</Muted>
      </Card>
      {m.days.slice().reverse().map((d) => (
        <Card key={d.date} onPress={() => router.push({ pathname: '/milk', params: { date: d.date } })}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body style={{ fontWeight: '700' }}>{formatDate(d.date)}</Body>
            <Body style={{ fontWeight: '700' }}>{L(d.producedMl)}</Body>
          </Row>
          <Row>
            <Muted>{t('morning')} {litres(d.morningMl)} · {t('evening')} {litres(d.eveningMl)}</Muted>
            {d.expected > 0 && !d.complete ? <Badge text={`${d.recorded}/${d.expected}`} tone="warn" /> : null}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
