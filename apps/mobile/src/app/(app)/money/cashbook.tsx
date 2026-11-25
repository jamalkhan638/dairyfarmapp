import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../lib/session';
import { useFinanceData } from '../../../lib/use-finance';
import { cashBook, cashForPeriod, type CashLine } from '../../../domain/finance';
import { formatDate, formatPKR, today } from '../../../lib/format';
import { monthName, monthRange, shiftMonth } from '../../../lib/months';
import { Badge, Body, Button, Card, InfoLine, Muted, Notice, Row, Screen, Section } from '../../../components/ui';
import { colors } from '../../../lib/theme';

/** Every rupee in and out for a month, with the running balance. */
export default function CashBookScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = useSession();
  const d = useFinanceData();
  const [month, setMonth] = useState(today().slice(0, 7));
  if (!can('finance', 'view')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!d) return <Screen>{null}</Screen>;
  const book = cashBook({ ...d, expenses: d.expenses.map((e) => e.data), capital: d.capital.map((c) => c.data) }, { cashSalesNotSynced: d.cashSalesNotSynced });
  const { from, to } = monthRange(month);
  const p = cashForPeriod(book, from, to);
  const name = (l: CashLine) => {
    if (l.kind === 'customer_payment') return d.customers.find((c) => c.id === l.ref.customerId)?.data.name ?? '';
    if (l.kind === 'supplier_payment') return d.suppliers.find((s) => s.id === l.ref.supplierId)?.data.name ?? '';
    if (l.kind === 'market_purchase') return d.items.find((i) => i.id === l.ref.feedItemId)?.data.name ?? '';
    if (l.kind === 'expense') return [t(`ec_${l.ref.category}`), l.ref.description].filter(Boolean).join(' · ');
    return [t(`ct_${l.ref.capitalType}`), l.ref.description].filter(Boolean).join(' · ');
  };
  const open = (l: CashLine) => {
    if (l.kind === 'customer_payment') router.push({ pathname: '/sales/payment', params: { id: l.id } });
    else if (l.kind === 'supplier_payment') router.push({ pathname: '/feed/supplier-payment', params: { id: l.id } });
    else if (l.kind === 'market_purchase') router.push({ pathname: '/feed/purchase', params: { id: l.id } });
    else if (l.kind === 'expense') router.push({ pathname: '/money/expense', params: { id: l.id } });
    else router.push({ pathname: '/money/capital', params: { id: l.id } });
  };
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Button title={t('prevMonth')} variant="ghost" onPress={() => setMonth(shiftMonth(month, -1))} />
        <Section>{monthName(month)}</Section>
        <Button title={t('nextMonth')} variant="ghost" onPress={() => setMonth(shiftMonth(month, 1))} disabled={month >= today().slice(0, 7)} />
      </Row>
      <Card>
        {month === today().slice(0, 7) ? <Badge text={t('inProgress')} tone="info" /> : null}
        <InfoLine label={t('balanceStart')} value={formatPKR(p.start)} />
        <InfoLine label={t('moneyIn')} value={formatPKR(p.inPaisa)} />
        <InfoLine label={t('moneyOut')} value={formatPKR(p.outPaisa)} />
        <InfoLine label={t('balanceEnd')} value={formatPKR(p.end)} />
        {!book.openingDate ? <Notice tone="warn" text={t('noOpeningSet')} /> : <Muted>{t('setOpening')}: {formatPKR(book.opening)} · {formatDate(book.openingDate)}</Muted>}
      </Card>
      {p.lines.length === 0 ? <Muted>{t('noEntries')}</Muted> : null}
      {p.lines.slice().reverse().map((l) => (
        <Card key={`${l.kind}${l.id}`} onPress={() => open(l)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body style={{ fontWeight: '700', flexShrink: 1 }}>{formatDate(l.date)} · {t(`cl_${l.kind}`)}</Body>
            <Body style={{ fontWeight: '800', color: l.amountPaisa > 0 ? colors.primaryDark : colors.danger }}>{l.amountPaisa > 0 ? '+' : '−'}{formatPKR(Math.abs(l.amountPaisa))}</Body>
          </Row>
          <Muted>{name(l)} · {t(`pm_${l.method}`)}</Muted>
          <Muted>{t('balance')}: {formatPKR(l.balanceAfter)}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
