import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EXPENSE_CATEGORIES } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useFinanceData } from '../../../lib/use-finance';
import { expensesByCategory } from '../../../domain/finance';
import { formatPKR, today } from '../../../lib/format';
import { monthRange } from '../../../lib/months';
import { Body, Button, Card, InfoLine, Muted, Notice, Section } from '../../../components/ui';
import { Screen } from '../../../components/ui';

/** Expenses: add one, and this month's totals (feed bought shown separately). */
export default function ExpensesHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = useSession();
  const d = useFinanceData();
  if (!can('expenses', 'view')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!d) return <Screen>{null}</Screen>;
  const { from, to } = monthRange(today().slice(0, 7));
  const exp = expensesByCategory(d.expenses.map((e) => e.data), from, to);
  const feedBought = d.purchases.filter((p) => !p.deletedAt && p.date >= from && p.date <= to).reduce((s, p) => s + p.totalPaisa, 0);

  return (
    <Screen>
      {can('expenses', 'add') ? <Button title={`+ ${t('addExpense')}`} onPress={() => router.push('/money/expense')} style={{ minHeight: 64 }} /> : null}
      <Card onPress={() => router.push('/money/expenses')}>
        <Section>{t('thisMonth')}</Section>
        <InfoLine label={`🌾 ${t('feedBoughtThisMonth')}`} value={formatPKR(feedBought)} />
        {EXPENSE_CATEGORIES.filter((c) => exp.by[c] > 0).map((c) => <InfoLine key={c} label={t(`ec_${c}`)} value={formatPKR(exp.by[c])} />)}
        <InfoLine label={t('otherExpenses')} value={formatPKR(exp.total)} />
        <Muted>{t('feedExpenseHelp')}</Muted>
      </Card>
      <Button title={t('allExpenses')} variant="secondary" onPress={() => router.push('/money/expenses')} />
      <Body> </Body>
    </Screen>
  );
}
