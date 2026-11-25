import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EXPENSE_CATEGORIES } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useFinanceData } from '../../../lib/use-finance';
import { cashBook, cashForPeriod, expensesByCategory } from '../../../domain/finance';
import { formatDate, formatPKR, today } from '../../../lib/format';
import { monthRange } from '../../../lib/months';
import { Badge, Body, Button, Card, InfoLine, Muted, Notice, Row, Screen, Section } from '../../../components/ui';

/** Cash in hand, this month's money in/out, and this month's operating expenses by category. */
export default function MoneyHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = useSession();
  const d = useFinanceData();
  const seesCash = can('finance', 'view');
  if (!can('expenses', 'view') && !seesCash) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!d) return <Screen>{null}</Screen>;
  const { from, to } = monthRange(today().slice(0, 7));
  const book = cashBook({ ...d, expenses: d.expenses.map((e) => e.data), capital: d.capital.map((c) => c.data) }, { cashSalesNotSynced: d.cashSalesNotSynced });
  const month = cashForPeriod(book, from, to);
  const exp = expensesByCategory(d.expenses.map((e) => e.data), from, to);

  return (
    <Screen>
      {can('expenses', 'add') ? <Button title={t('addExpense')} onPress={() => router.push('/money/expense')} /> : null}
      {can('finance', 'add') ? <Button title={t('addCapital')} variant="secondary" onPress={() => router.push('/money/capital')} /> : null}

      {seesCash ? (
        <Card onPress={() => router.push('/money/cashbook')}>
          <Section>{t('cashInHand')}</Section>
          <Body style={{ fontSize: 28, fontWeight: '800' }}>{formatPKR(book.balance)}</Body>
          <InfoLine label={t('thisMonthIn')} value={formatPKR(month.inPaisa)} />
          <InfoLine label={t('thisMonthOut')} value={formatPKR(month.outPaisa)} />
          {book.openingDate ? <Muted>{t('setOpening')}: {formatPKR(book.opening)} · {formatDate(book.openingDate)}</Muted> : <Notice tone="warn" text={t('noOpeningSet')} />}
          <Muted>{t('cashNotProfit')}</Muted>
        </Card>
      ) : null}

      <Card onPress={() => router.push('/money/expenses')}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Section>{t('operatingExpenses')} · {t('thisMonth')}</Section>
          <Badge text={t('inProgress')} tone="info" />
        </Row>
        <Body style={{ fontSize: 24, fontWeight: '800' }}>{formatPKR(exp.total)}</Body>
        {EXPENSE_CATEGORIES.filter((c) => exp.by[c] > 0).map((c) => <InfoLine key={c} label={t(`ec_${c}`)} value={formatPKR(exp.by[c])} />)}
        <Muted>{t('capitalNote')}</Muted>
      </Card>

      {seesCash ? <Button title={t('cashBook')} variant="secondary" onPress={() => router.push('/money/cashbook')} /> : null}
      <Button title={t('allExpenses')} variant="secondary" onPress={() => router.push('/money/expenses')} />
      {can('finance', 'edit') ? <Button title={t('setOpening')} variant="secondary" onPress={() => router.push('/money/opening')} /> : null}
    </Screen>
  );
}
