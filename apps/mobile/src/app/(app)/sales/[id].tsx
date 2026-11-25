import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../lib/session';
import { useSalesData } from '../../../lib/use-sales';
import { balances, ledger, rateOn } from '../../../domain/sales';
import { litres } from '../../../domain/milk';
import { formatDate, formatPKR, today } from '../../../lib/format';
import { monthName, monthRange, shiftMonth } from '../../../lib/months';
import { RecordMeta } from '../../../components/RecordMeta';
import { HistoryList } from '../../../components/HistoryList';
import { Badge, Body, Button, Card, Choice, InfoLine, Muted, Notice, Row, Screen, Section, Title } from '../../../components/ui';
import { BalanceText } from '../../../components/BalanceText';
import { colors } from '../../../lib/theme';

type Tab = 'statement' | 'rates' | 'history';

/** One customer: what they owe, their rate, and a month-by-month statement. */
export default function CustomerDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useSession();
  const data = useSalesData();
  const [tab, setTab] = useState<Tab>('statement');
  const [month, setMonth] = useState(today().slice(0, 7));
  if (!can('sales', 'view')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!data) return <Screen>{null}</Screen>;
  const rec = data.customers.find((c) => c.id === id);
  if (!rec) return <Screen><Muted>—</Muted></Screen>;
  const c = rec.data;

  const deliveries = data.deliveries.map((d) => d.data);
  const payments = data.payments.map((p) => p.data);
  const total = balances(deliveries, payments).get(id)?.balancePaisa ?? 0;
  const { from, to } = monthRange(month);
  const inMonth = balances(deliveries, payments, { from, to }).get(id) ?? { deliveredMl: 0, billedPaisa: 0, paidPaisa: 0, balancePaisa: 0 };
  const lines = ledger(id, deliveries, payments);
  const before = lines.filter((l) => l.date < from);
  const opening = before.length ? before[before.length - 1].balanceAfter : 0;
  const monthLines = lines.filter((l) => l.date >= from && l.date <= to);
  const closing = monthLines.length ? monthLines[monthLines.length - 1].balanceAfter : opening;
  const rates = data.rates.filter((r) => r.data.customerId === id).sort((a, b) => b.data.effectiveFrom.localeCompare(a.data.effectiveFrom));
  const current = rateOn(data.rates.map((r) => r.data), id, today());
  const syncOf = (rid: string) => data.deliveries.find((d) => d.id === rid)?.syncState ?? data.payments.find((p) => p.id === rid)?.syncState;

  return (
    <Screen>
      <Title>{c.name}</Title>
      {c.phone ? <Muted>{c.phone}</Muted> : null}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body>{t('balance')}</Body>
          <BalanceText paisa={total} />
        </Row>
        <InfoLine label={t('currentRate')} value={current ? `${formatPKR(current.ratePaisaPerLitre)}${t('perLitre')}` : t('noRate')} />
        <InfoLine label={t('defaultSaleType')} value={t(`st_${c.defaultSaleType}`)} />
        {!c.active ? <Badge text={t('inactive')} /> : null}
      </Card>
      <Row>
        {can('sales', 'add') ? <Button title={t('receivePayment')} onPress={() => router.push({ pathname: '/sales/payment', params: { customerId: id } })} style={{ flex: 1 }} /> : null}
        {can('sales', 'edit') ? <Button title={t('changeRate')} variant="secondary" onPress={() => router.push({ pathname: '/sales/rate', params: { customerId: id } })} style={{ flex: 1 }} /> : null}
      </Row>

      <Choice value={tab} onChange={setTab} options={[{ value: 'statement', label: t('statement') }, { value: 'rates', label: t('rateHistory') }, { value: 'history', label: t('history') }]} />

      {tab === 'statement' ? (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <Button title={t('prevMonth')} variant="ghost" onPress={() => setMonth(shiftMonth(month, -1))} />
            <Section>{monthName(month)}</Section>
            <Button title={t('nextMonth')} variant="ghost" onPress={() => setMonth(shiftMonth(month, 1))} disabled={month >= today().slice(0, 7)} />
          </Row>
          <Card>
            {month === today().slice(0, 7) ? <Badge text={t('inProgress')} tone="info" /> : null}
            <InfoLine label={t('openingBalance')} value={formatPKR(opening)} />
            <InfoLine label={t('billed')} value={`${litres(inMonth.deliveredMl)} ${t('L')} · ${formatPKR(inMonth.billedPaisa)}`} />
            <InfoLine label={t('paid')} value={formatPKR(inMonth.paidPaisa)} />
            <InfoLine label={t('closingBalance')} value={formatPKR(closing)} />
          </Card>
          {monthLines.length === 0 ? <Muted>{t('noEntries')}</Muted> : null}
          {monthLines.slice().reverse().map((l) => {
            const state = syncOf(l.id);
            return (
              <Card
                key={`${l.kind}${l.id}`}
                onPress={() => (l.kind === 'delivery' ? router.push({ pathname: '/sales/delivery', params: { id: l.id } }) : router.push({ pathname: '/sales/payment', params: { id: l.id } }))}
              >
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flexShrink: 1 }}>
                    <Body style={{ fontWeight: '700' }}>
                      {l.kind === 'delivery'
                        ? `${formatDate(l.date)} · ${l.delivery.session === 'MORNING' ? t('morning') : t('evening')} · ${litres(l.delivery.quantityMl)} ${t('L')}`
                        : `${formatDate(l.date)} · ${t('payment')} · ${t(`pm_${l.payment.method}`)}`}
                    </Body>
                    {l.kind === 'delivery' ? <Muted>{formatPKR(l.delivery.ratePaisaPerLitre)}{t('perLitre')} · {t(`st_${l.delivery.saleType}`)}</Muted> : null}
                  </View>
                  <Body style={{ fontWeight: '800', color: l.kind === 'delivery' ? colors.text : colors.primaryDark }}>
                    {l.kind === 'delivery' ? `+${formatPKR(l.delivery.amountPaisa)}` : `−${formatPKR(l.payment.amountPaisa)}`}
                  </Body>
                </Row>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Muted>{t('balance')}: {formatPKR(l.balanceAfter)}</Muted>
                  {state && state !== 'synced' ? <Badge text={t('statePending')} tone="warn" /> : null}
                </Row>
              </Card>
            );
          })}
        </>
      ) : null}

      {tab === 'rates' ? (
        <>
          <Muted>{t('rateNote')}</Muted>
          {rates.length === 0 ? <Muted>{t('noRate')}</Muted> : null}
          {rates.map((r) => (
            <Card key={r.id} onPress={() => router.push(`/history/CustomerRate/${r.id}`)}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Body style={{ fontWeight: '700' }}>{formatPKR(r.data.ratePaisaPerLitre)}{t('perLitre')}</Body>
                <Muted>{t('rateFrom')} {formatDate(r.data.effectiveFrom)}</Muted>
              </Row>
            </Card>
          ))}
        </>
      ) : null}

      {tab === 'history' ? (
        <>
          <RecordMeta data={c} syncState={rec.syncState} />
          {can('sales', 'edit') ? <Button title={t('editCustomer')} variant="secondary" onPress={() => router.push({ pathname: '/sales/customer', params: { id } })} /> : null}
          <HistoryList entity="Customer" id={id} />
        </>
      ) : null}
    </Screen>
  );
}
