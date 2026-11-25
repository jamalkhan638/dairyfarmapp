import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useFinanceData } from '../../../lib/use-finance';
import { useUserNames } from '../../../lib/hooks';
import { expensesByCategory } from '../../../domain/finance';
import { formatDate, formatDateTime, formatPKR, today } from '../../../lib/format';
import { monthName, monthRange, shiftMonth } from '../../../lib/months';
import { Badge, Body, Button, Card, Choice, InfoLine, Muted, Row, Screen, Section } from '../../../components/ui';

/** Expenses of a month, filterable by category. */
export default function Expenses() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = useSession();
  const names = useUserNames();
  const d = useFinanceData();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [cat, setCat] = useState<ExpenseCategory | 'all'>('all');
  if (!d) return <Screen>{null}</Screen>;
  const { from, to } = monthRange(month);
  const sum = expensesByCategory(d.expenses.map((e) => e.data), from, to);
  const list = d.expenses.filter((e) => e.data.date >= from && e.data.date <= to && (cat === 'all' || e.data.category === cat)).sort((a, b) => b.data.date.localeCompare(a.data.date));
  const feedList = cat === 'all' ? d.purchases.filter((p) => !p.deletedAt && p.date >= from && p.date <= to).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const feedTotal = feedList.reduce((s, p) => s + p.totalPaisa, 0);
  const itemName = (id: string) => d.items.find((i) => i.id === id)?.data.name ?? '';
  const supplier = (id: string | null) => (id ? d.suppliers.find((s) => s.id === id)?.data.name : null);
  const tag = (id: string | null) => (id ? d.animals.find((a) => a.animal.id === id)?.animal.tag : null);
  return (
    <Screen footer={can('expenses', 'add') ? <Button title={t('addExpense')} onPress={() => router.push('/money/expense')} /> : undefined}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Button title={t('prevMonth')} variant="ghost" onPress={() => setMonth(shiftMonth(month, -1))} />
        <Section>{monthName(month)}</Section>
        <Button title={t('nextMonth')} variant="ghost" onPress={() => setMonth(shiftMonth(month, 1))} disabled={month >= today().slice(0, 7)} />
      </Row>
      <Card>
        <InfoLine label={t('operatingExpenses')} value={formatPKR(sum.total)} />
        {month === today().slice(0, 7) ? <Badge text={t('inProgress')} tone="info" /> : null}
      </Card>
      <Choice value={cat} onChange={setCat} options={[{ value: 'all', label: t('all') }, ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: `${t(`ec_${c}`)}${sum.by[c] ? ` ${formatPKR(sum.by[c])}` : ''}` }))]} />
      {feedList.length ? (
        <Card>
          <InfoLine label={`🌾 ${t('feedBoughtThisMonth')}`} value={formatPKR(feedTotal)} />
          {feedList.map((p) => (
            <Pressable key={p.id} onPress={() => router.push({ pathname: '/feed/purchase', params: { id: p.id } })}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Muted>{formatDate(p.date)} · {itemName(p.feedItemId)} · {p.bags ? `${p.bags} ${t('bags')}` : `${(p.quantityGrams / 1000).toLocaleString('en-US')} ${t('kgUnit')}`}</Muted>
                <Body>{formatPKR(p.totalPaisa)}</Body>
              </Row>
            </Pressable>
          ))}
        </Card>
      ) : null}
      {list.length === 0 && feedList.length === 0 ? <Muted>{t('noEntries')}</Muted> : null}
      {list.map((e) => (
        <Card key={e.id} onPress={() => router.push({ pathname: '/money/expense', params: { id: e.id } })}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body style={{ fontWeight: '700', flexShrink: 1 }}>{formatDate(e.data.date)} · {t(`ec_${e.data.category}`)}</Body>
            <Body style={{ fontWeight: '800' }}>{formatPKR(e.data.amountPaisa)}</Body>
          </Row>
          <Muted>{[e.data.description, supplier(e.data.supplierId), tag(e.data.animalId) ? `#${tag(e.data.animalId)}` : null, e.data.paymentType === 'CREDIT' ? t('onCredit') : t(`pm_${e.data.method}`)].filter(Boolean).join(' · ')}</Muted>
          <Muted>{t('addedBy', { name: names.get(e.data.createdById) ?? t('unknownUser'), time: formatDateTime((e.data as any).clientCreatedAt ?? (e.data as any).createdAt) })}</Muted>
          <Row>
            {e.data.receiptPhotoId ? <Badge text={t('receipt')} tone="info" /> : null}
            {e.syncState !== 'synced' ? <Badge text={t('statePending')} tone="warn" /> : null}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
