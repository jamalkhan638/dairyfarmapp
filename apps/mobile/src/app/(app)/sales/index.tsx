import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../lib/session';
import { useSalesData } from '../../../lib/use-sales';
import { balances, rateOn } from '../../../domain/sales';
import { formatPKR, today } from '../../../lib/format';
import { Badge, Body, Button, Card, InfoLine, Muted, Notice, Row, Screen, Toggle } from '../../../components/ui';
import { BalanceText } from '../../../components/BalanceText';

/** Customers with what each owes, and quick buttons for the daily delivery round. */
export default function Sales() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = useSession();
  const [showInactive, setShowInactive] = useState(false);
  const data = useSalesData();
  if (!can('sales', 'view')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!data) return <Screen>{null}</Screen>;

  const bal = balances(data.deliveries.map((d) => d.data), data.payments.map((p) => p.data));
  const totalOwed = [...bal.values()].reduce((s, b) => s + Math.max(0, b.balancePaisa), 0);
  const list = data.customers.filter((c) => showInactive || c.data.active);

  return (
    <Screen footer={can('sales', 'add') ? <Button title={t('addCustomer')} variant="secondary" onPress={() => router.push('/sales/customer')} /> : undefined}>
      <Card>
        <InfoLine label={t('totalOwed')} value={formatPKR(totalOwed)} />
      </Card>
      {can('sales', 'add') ? (
        <>
          <Row>
            <Button title={`${t('deliveryRound')}: ${t('morning')}`} onPress={() => router.push({ pathname: '/sales/round', params: { date: today(), session: 'MORNING' } })} style={{ flex: 1 }} />
            <Button title={`${t('deliveryRound')}: ${t('evening')}`} onPress={() => router.push({ pathname: '/sales/round', params: { date: today(), session: 'EVENING' } })} style={{ flex: 1 }} />
          </Row>
          <Button title={t('receivePayment')} variant="secondary" onPress={() => router.push('/sales/payment')} />
        </>
      ) : null}
      {data.customers.length === 0 ? (
        <Card>
          <Body style={{ fontSize: 20, fontWeight: '700' }}>👥 {t('addCustomerFirst')}</Body>
          {can('sales', 'add') ? <Button title={t('addCustomer')} onPress={() => router.push('/sales/customer')} /> : null}
        </Card>
      ) : null}
      {list.map((c) => {
        const r = rateOn(data.rates.map((x) => x.data), c.id, today());
        const b = bal.get(c.id)?.balancePaisa ?? 0;
        return (
          <Card key={c.id} onPress={() => router.push(`/sales/${c.id}`)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body style={{ fontWeight: '800', fontSize: 19, flexShrink: 1 }}>{c.data.name}</Body>
              <BalanceText paisa={b} />
            </Row>
            <Row>
              <Muted>{r ? `${formatPKR(r.ratePaisaPerLitre)}${t('perLitre')}` : t('noRate')} · {t(`st_${c.data.defaultSaleType}`)}</Muted>
              {!c.data.active ? <Badge text={t('inactive')} /> : null}
              {c.syncState !== 'synced' ? <Badge text={t('statePending')} tone="warn" /> : null}
            </Row>
          </Card>
        );
      })}
      <Toggle label={t('showInactive')} value={showInactive} onChange={setShowInactive} />
    </Screen>
  );
}
