import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../lib/session';
import { useLocalQuery } from '../../lib/hooks';
import { local } from '../../lib/db';
import { litres, summarizeDay } from '../../domain/milk';
import { computeReminders, groupReminders, loadHealth } from '../../domain/health';
import { loadReportData, monthReport } from '../../domain/reports';
import { cashBook } from '../../domain/finance';
import { formatPKR, today } from '../../lib/format';
import { ReminderList } from '../../components/ReminderList';
import { Badge, Body, Card, InfoLine, Muted, Row, Screen, Section, Title } from '../../components/ui';
import { colors, font, space } from '../../lib/theme';

function Tile({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        { flexBasis: '48%', flexGrow: 1, minHeight: 64, borderRadius: 12, padding: space(3), justifyContent: 'center', borderWidth: 1 },
        primary ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={{ fontSize: font.body, fontWeight: '700', color: primary ? '#fff' : colors.primaryDark, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>{children}</View>;
}

/** Dashboard: today's milk, reminders, this month so far, money, and big buttons for daily work. */
export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const { me, can } = useSession();
  const { data } = useLocalQuery(async () => {
    const repo = local().repo;
    const d = await loadReportData(repo);
    const h = await loadHealth(repo);
    const due = computeReminders(d.animals, { health: h.health.map((x) => x.data), breeding: h.breeding.map((x) => x.data), reminders: h.reminders.map((x) => x.data), settings: h.settings }, today());
    return { d, due };
  });
  const go = (href: Href) => () => router.push(href);
  if (!data) return <Screen>{null}</Screen>;
  const { d, due } = data;
  const day = summarizeDay(today(), d.animals, d.milkRecords, d.milkUsages, d.deliveries.filter((x) => !x.deletedAt && x.date === today()).reduce((s, x) => s + x.quantityMl, 0));
  const month = monthReport(d, today().slice(0, 7));
  const reminders = groupReminders(due, today());
  const tagOf = (id: string) => d.animals.find((a) => a.animal.id === id)?.animal.tag;
  const payIds = new Set(d.customerPayments.map((p) => p.id));
  const cashSalesNotSynced = d.deliveries
    .filter((x) => !x.deletedAt && x.saleType === 'CASH' && x.cashPaymentId && !payIds.has(x.cashPaymentId))
    .map((x) => ({ id: x.cashPaymentId!, customerId: x.customerId, date: x.date, amountPaisa: x.amountPaisa }));
  const cash = cashBook({ ...d }, { cashSalesNotSynced }).balance;
  const urgent = [...reminders.overdue, ...reminders.today];

  return (
    <Screen>
      <Title>{t('hello', { name: me?.name ?? '' })}</Title>
      {d.settings?.farmName ? <Muted>{d.settings.farmName}</Muted> : null}

      {can('health', 'view') && urgent.length ? (
        <>
          <Section>{t('remindersDue', { count: urgent.length })}</Section>
          <ReminderList list={urgent.slice(0, 4)} tagOf={tagOf} tone={reminders.overdue.length ? 'bad' : 'warn'} />
          {urgent.length > 4 ? <Tile label={t('reminders')} onPress={go('/health')} /> : null}
        </>
      ) : null}

      {can('milk', 'view') ? (
        <Card onPress={go('/milk')}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Section>{t('todayMilk')}</Section>
            <Badge text={t('recordedOf', { recorded: day.recorded, expected: day.expected })} tone={day.complete ? 'good' : 'warn'} />
          </Row>
          <Body style={{ fontSize: 30, fontWeight: '800', color: colors.primaryDark }}>{litres(day.producedMl)} {t('L')}</Body>
          <Muted>{t('morning')} {litres(day.morningMl)} · {t('evening')} {litres(day.eveningMl)}{can('sales', 'view') ? ` · ${t('sold')} ${litres(day.soldMl)}` : ''}</Muted>
        </Card>
      ) : null}

      <Section>{t('quickActions')}</Section>
      <Grid>
        {can('milk', 'add') ? <Tile primary label={`${t('recordMilk')}: ${t('morning')}`} onPress={go({ pathname: '/milk/entry', params: { date: today(), session: 'MORNING' } })} /> : null}
        {can('milk', 'add') ? <Tile primary label={`${t('recordMilk')}: ${t('evening')}`} onPress={go({ pathname: '/milk/entry', params: { date: today(), session: 'EVENING' } })} /> : null}
        {can('sales', 'add') ? <Tile label={t('deliveryRound')} onPress={go({ pathname: '/sales/round', params: { date: today(), session: 'MORNING' } })} /> : null}
        {can('sales', 'add') ? <Tile label={t('receivePayment')} onPress={go('/sales/payment')} /> : null}
        {can('feed', 'add') ? <Tile label={t('recordFeeding')} onPress={go('/feed/feeding')} /> : null}
        {can('feed', 'add') ? <Tile label={t('addPurchase')} onPress={go('/feed/purchase')} /> : null}
        {can('expenses', 'add') ? <Tile label={t('addExpense')} onPress={go('/money/expense')} /> : null}
        {can('health', 'add') ? <Tile label={t('addHealth')} onPress={go('/health/event')} /> : null}
      </Grid>

      {can('reports', 'view') ? (
        <Card onPress={go('/reports')}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Section>{t('thisMonthSoFar')}</Section>
            <Badge text={t('estimateLabel')} tone="warn" />
          </Row>
          <InfoLine label={t('operatingProfit')} value={formatPKR(month.operatingProfitPaisa)} />
          <InfoLine label={t('milkSales')} value={formatPKR(month.sales.revenuePaisa)} />
          <InfoLine label={t('feedUsed')} value={formatPKR(month.feed.costPaisa)} />
          <InfoLine label={t('otherExpenses')} value={formatPKR(month.expenses.totalPaisa)} />
          {month.warnings.some((w) => w !== 'IN_PROGRESS' && w !== 'NO_OPENING_CASH') ? <Badge text={t('incomplete')} tone="warn" /> : null}
        </Card>
      ) : null}

      {can('finance', 'view') || can('sales', 'view') || can('feed', 'view') ? (
        <Card>
          {can('finance', 'view') ? <InfoLine label={t('cashInHand')} value={formatPKR(cash)} /> : null}
          {can('sales', 'view') ? <InfoLine label={t('totalOwed')} value={formatPKR(month.sales.customersOweAtEndPaisa)} /> : null}
          {can('feed', 'view') ? <InfoLine label={t('supplierTotalOwed')} value={formatPKR(month.suppliersOwedAtEndPaisa)} /> : null}
        </Card>
      ) : null}

      <Section>{t('sections')}</Section>
      <Grid>
        {can('animals', 'view') ? <Tile label={t('animals')} onPress={go('/animals')} /> : null}
        {can('milk', 'view') ? <Tile label={t('milk')} onPress={go('/milk')} /> : null}
        {can('sales', 'view') ? <Tile label={t('sales')} onPress={go('/sales')} /> : null}
        {can('feed', 'view') ? <Tile label={t('feed')} onPress={go('/feed')} /> : null}
        {can('expenses', 'view') || can('finance', 'view') ? <Tile label={t('money')} onPress={go('/money')} /> : null}
        {can('health', 'view') ? <Tile label={t('health')} onPress={go('/health')} /> : null}
        {can('reports', 'view') ? <Tile label={t('reports')} onPress={go('/reports')} /> : null}
        <Tile label={t('settings')} onPress={go('/settings')} />
      </Grid>
    </Screen>
  );
}
