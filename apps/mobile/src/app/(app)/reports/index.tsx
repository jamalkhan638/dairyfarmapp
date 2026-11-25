import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CAPITAL_TYPES, EXPENSE_CATEGORIES, MILK_USAGE_TYPES } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useReportData } from '../../../lib/use-reports';
import { monthReport, perCow, trend } from '../../../domain/reports';
import { litres } from '../../../domain/milk';
import { kg } from '../../../domain/feed';
import { formatPKR, today } from '../../../lib/format';
import { monthName, shiftMonth } from '../../../lib/months';
import { ReportWarnings } from '../../../components/ReportWarnings';
import { Badge, Body, Button, Card, Choice, InfoLine, Muted, Notice, Row, Screen, Section } from '../../../components/ui';
import { colors } from '../../../lib/theme';

type Tab = 'summary' | 'cows' | 'trend';

/** Monthly report: operating profit (estimate) kept separate from cash, with every warning shown. */
export default function Reports() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = useSession();
  const d = useReportData();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [tab, setTab] = useState<Tab>('summary');
  const r = useMemo(() => (d ? monthReport(d, month) : null), [d, month]);
  const rows = useMemo(() => (d && r ? perCow(d, month, r.sales.avgPricePerLitrePaisa) : []), [d, r, month]);
  const tr = useMemo(() => (d && tab === 'trend' ? trend(d, month, 6) : []), [d, month, tab]);
  if (!can('reports', 'view')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!d || !r) return <Screen>{null}</Screen>;
  const L = (ml: number) => `${litres(ml)} ${t('L')}`;
  const profitColor = r.operatingProfitPaisa >= 0 ? colors.primaryDark : colors.danger;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Button title={t('prevMonth')} variant="ghost" onPress={() => setMonth(shiftMonth(month, -1))} />
        <Section>{monthName(month)}</Section>
        <Button title={t('nextMonth')} variant="ghost" onPress={() => setMonth(shiftMonth(month, 1))} disabled={month >= today().slice(0, 7)} />
      </Row>
      <Choice value={tab} onChange={setTab} options={[{ value: 'summary', label: t('summary') }, { value: 'cows', label: t('perCow') }, { value: 'trend', label: t('trendTab') }]} />

      {tab === 'summary' ? (
        <>
          <ReportWarnings r={r} />
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <Section>{t('operatingProfit')}</Section>
              <Badge text={t('estimateLabel')} tone="warn" />
            </Row>
            <Body style={{ fontSize: 30, fontWeight: '800', color: profitColor }}>{formatPKR(r.operatingProfitPaisa)}</Body>
            <InfoLine label={t('milkSales')} value={formatPKR(r.sales.revenuePaisa)} />
            <InfoLine label={`− ${t('feedUsed')}`} value={formatPKR(r.feed.costPaisa)} />
            <InfoLine label={`− ${t('otherExpenses')}`} value={formatPKR(r.expenses.totalPaisa)} />
            <Muted>{t('profitFormula')}</Muted>
            <Muted>{t('estimateFeed')}</Muted>
          </Card>

          <Card onPress={() => router.push({ pathname: '/milk/month', params: { month } })}>
            <Section>{t('milk')}</Section>
            <InfoLine label={t('produced')} value={L(r.milk.producedMl)} />
            <InfoLine label={t('sold')} value={L(r.milk.soldMl)} />
            {MILK_USAGE_TYPES.map((u) => <InfoLine key={u} label={t(`u_${u}`)} value={L(r.milk.usedMl[u])} />)}
            <InfoLine label={r.milk.unaccountedMl >= 0 ? t('notAccounted') : t('overAccounted')} value={L(Math.abs(r.milk.unaccountedMl))} />
            <Muted>{t('recordedOf', { recorded: r.milk.recorded, expected: r.milk.expected })}</Muted>
          </Card>

          <Card onPress={() => router.push('/sales')}>
            <Section>{t('sales')}</Section>
            <InfoLine label={t('milkSales')} value={formatPKR(r.sales.revenuePaisa)} />
            {r.sales.avgPricePerLitrePaisa !== null ? <InfoLine label={t('avgSalePrice')} value={`${formatPKR(r.sales.avgPricePerLitrePaisa)}${t('perLitre')}`} /> : null}
            <InfoLine label={t('paymentsReceived')} value={formatPKR(r.sales.paymentsReceivedPaisa)} />
            <InfoLine label={t('customersOweEnd')} value={formatPKR(r.sales.customersOweAtEndPaisa)} />
            {r.sales.advancesAtEndPaisa ? <InfoLine label={t('advancesEnd')} value={formatPKR(r.sales.advancesAtEndPaisa)} /> : null}
          </Card>

          <Card onPress={() => router.push('/feed')}>
            <Section>{t('feed')}</Section>
            <InfoLine label={t('feedUsed')} value={formatPKR(r.feed.costPaisa)} />
            <InfoLine label={t('kgFed')} value={kg(r.feed.fedGrams)} />
            <InfoLine label={t('kgWasted')} value={kg(r.feed.wastedGrams)} />
            <InfoLine label={t('feedPurchasesInfo')} value={formatPKR(r.feed.purchasesPaisa)} />
            <InfoLine label={t('suppliersOweEnd')} value={formatPKR(r.suppliersOwedAtEndPaisa)} />
          </Card>

          <Card onPress={() => router.push('/money/expenses')}>
            <Section>{t('otherExpenses')}</Section>
            {EXPENSE_CATEGORIES.filter((c) => r.expenses.byCategory[c]).map((c) => <InfoLine key={c} label={t(`ec_${c}`)} value={formatPKR(r.expenses.byCategory[c])} />)}
            <InfoLine label={t('total')} value={formatPKR(r.expenses.totalPaisa)} />
          </Card>

          {can('finance', 'view') ? (
            <Card onPress={() => router.push('/money/cashbook')}>
              <Section>{t('cashSeparate')}</Section>
              <InfoLine label={t('balanceStart')} value={formatPKR(r.cash.startPaisa)} />
              <InfoLine label={t('moneyIn')} value={formatPKR(r.cash.inPaisa)} />
              <InfoLine label={t('moneyOut')} value={formatPKR(r.cash.outPaisa)} />
              <InfoLine label={t('balanceEnd')} value={formatPKR(r.cash.endPaisa)} />
              <Muted>{t('cashNotProfit')}</Muted>
            </Card>
          ) : null}

          {Object.keys(r.capital).length ? (
            <Card>
              <Section>{t('capitalThisMonth')}</Section>
              {CAPITAL_TYPES.filter((c) => r.capital[c]).map((c) => <InfoLine key={c} label={t(`ct_${c}`)} value={formatPKR(r.capital[c]!)} />)}
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'cows' ? (
        <>
          <Muted>{t('perCowNote')}</Muted>
          {rows.length === 0 ? <Muted>{t('noEntries')}</Muted> : null}
          {rows.map((x) => (
            <Card key={x.animal.animal.id} onPress={() => router.push(`/animals/${x.animal.animal.id}`)}>
              <Body style={{ fontWeight: '800', fontSize: 18 }}>#{x.animal.animal.tag}{x.animal.animal.name ? ` ${x.animal.animal.name}` : ''}</Body>
              <InfoLine label={t('produced')} value={`${L(x.milkMl)} (${x.milkings})`} />
              {x.milkValuePaisa !== null ? <InfoLine label={t('milkValueEst')} value={formatPKR(x.milkValuePaisa)} /> : null}
              <InfoLine label={t('feedCostEst')} value={formatPKR(x.feedCostPaisa)} />
              <Row>
                {x.feedEstimated ? <Badge text={t('estimateLabel')} tone="warn" /> : null}
                {x.feedUnpricedGrams ? <Badge text={`${kg(x.feedUnpricedGrams)} ${t('kgUnit')} —`} tone="warn" /> : null}
              </Row>
            </Card>
          ))}
        </>
      ) : null}

      {tab === 'trend' ? (
        <>
          {tr.map((m) => (
            <Card key={m.month} onPress={() => { setMonth(m.month); setTab('summary'); }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Body style={{ fontWeight: '800' }}>{monthName(m.month)}</Body>
                <Body style={{ fontWeight: '800', color: m.operatingProfitPaisa >= 0 ? colors.primaryDark : colors.danger }}>{formatPKR(m.operatingProfitPaisa)}</Body>
              </Row>
              <Muted>{t('produced')} {L(m.milk.producedMl)} · {t('milkSales')} {formatPKR(m.sales.revenuePaisa)}</Muted>
              <Muted>{t('feedUsed')} {formatPKR(m.feed.costPaisa)} · {t('otherExpenses')} {formatPKR(m.expenses.totalPaisa)}</Muted>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {m.inProgress ? <Badge text={t('inProgress')} tone="info" /> : null}
                {m.warnings.some((w) => w !== 'IN_PROGRESS' && w !== 'NO_OPENING_CASH') ? <Badge text={t('incomplete')} tone="warn" /> : null}
                <Badge text={t('estimateLabel')} tone="neutral" />
              </View>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
