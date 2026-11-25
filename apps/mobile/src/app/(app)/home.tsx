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
import { formatPKR, today } from '../../lib/format';
import { ReminderList } from '../../components/ReminderList';
import { Badge, Body, Card, InfoLine, Muted, Row, Screen, Section, Title } from '../../components/ui';
import { colors, font, space } from '../../lib/theme';

/** One big button for a main section. */
function BigTile({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        { flexBasis: '47%', flexGrow: 1, minHeight: 110, borderRadius: 16, padding: space(3), alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, gap: space(1) },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text style={{ fontSize: 40 }}>{icon}</Text>
      <Text style={{ fontSize: font.large, fontWeight: '800', color: '#fff', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

/** Small link-style button for less-used sections. */
function SmallLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [{ flexGrow: 1, minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space(3) }, pressed && { opacity: 0.8 }]}>
      <Text style={{ fontSize: font.body, fontWeight: '700', color: colors.primaryDark }}>{label}</Text>
    </Pressable>
  );
}

/** Home: today's milk, reminders, this month's profit, and 4 big buttons for daily work. */
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
  const soldToday = d.deliveries.filter((x) => !x.deletedAt && x.date === today()).reduce((s, x) => s + x.quantityMl, 0);
  const day = summarizeDay(today(), d.animals, d.milkRecords, d.milkUsages, soldToday);
  const month = monthReport(d, today().slice(0, 7));
  const reminders = groupReminders(due, today());
  const urgent = [...reminders.overdue, ...reminders.today];
  const tagOf = (id: string) => d.animals.find((a) => a.animal.id === id)?.animal.tag;

  return (
    <Screen>
      {d.settings?.farmName ? (
        <Text style={{ fontSize: 22, fontWeight: '700', color: colors.primaryDark, textAlign: 'left' }}>🐄 {d.settings.farmName}</Text>
      ) : null}
      <Title>{t('hello', { name: me?.name ?? '' })}</Title>

      {can('milk', 'view') ? (
        <Card onPress={go('/milk')}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Section>{t('todayMilk')}</Section>
            {day.expected > 0 ? <Badge text={t('recordedOf', { recorded: day.recorded, expected: day.expected })} tone={day.complete ? 'good' : 'warn'} /> : null}
          </Row>
          <Body style={{ fontSize: 30, fontWeight: '800', color: colors.primaryDark }}>{litres(day.producedMl)} {t('L')}</Body>
          <Muted>{t('morning')} {litres(day.morningMl)} · {t('evening')} {litres(day.eveningMl)}{can('sales', 'view') ? ` · ${t('sold')} ${litres(day.soldMl)}` : ''}</Muted>
        </Card>
      ) : null}

      {can('health', 'view') && urgent.length ? (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <Section>{t('remindersDue', { count: urgent.length })}</Section>
            <Pressable onPress={go('/health')}><Text style={{ color: colors.primary, fontWeight: '700', fontSize: font.body }}>{t('seeAll')}</Text></Pressable>
          </Row>
          <ReminderList list={urgent.slice(0, 3)} tagOf={tagOf} tone={reminders.overdue.length ? 'bad' : 'warn'} />
        </>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
        {can('milk', 'view') ? <BigTile icon="🥛" label={t('milk')} onPress={go('/milk')} /> : null}
        {can('animals', 'view') ? <BigTile icon="🐄" label={t('animals')} onPress={go('/animals')} /> : null}
        {can('feed', 'view') ? <BigTile icon="🌾" label={t('feed')} onPress={go('/feed')} /> : null}
        {can('sales', 'view') ? <BigTile icon="👥" label={t('customers')} onPress={go('/sales')} /> : null}
      </View>

      {can('reports', 'view') ? (
        <Card onPress={go('/reports')}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Section>{t('profitThisMonth')}</Section>
            <Badge text={t('estimateLabel')} tone="warn" />
          </Row>
          <Body style={{ fontSize: 26, fontWeight: '800', color: month.operatingProfitPaisa >= 0 ? colors.primaryDark : colors.danger }}>{formatPKR(month.operatingProfitPaisa)}</Body>
          <InfoLine label={t('milkSales')} value={formatPKR(month.sales.revenuePaisa)} />
          <InfoLine label={t('feedUsed')} value={formatPKR(month.feed.costPaisa)} />
          <InfoLine label={t('otherExpenses')} value={formatPKR(month.expenses.totalPaisa)} />
          {month.feed.daysWithoutFeeding > 0 ? <Muted>{t('monthlyNotEntered')}</Muted> : null}
        </Card>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
        {can('expenses', 'view') ? <SmallLink label={t('expenses')} onPress={go('/money')} /> : null}
        {can('reports', 'view') ? <SmallLink label={t('reports')} onPress={go('/reports')} /> : null}
        <SmallLink label={t('settings')} onPress={go('/settings')} />
      </View>
    </Screen>
  );
}
