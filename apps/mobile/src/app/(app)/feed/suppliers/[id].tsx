import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../../lib/session';
import { useFeedData } from '../../../../lib/use-feed';
import { kg, supplierBalances, supplierLedger } from '../../../../domain/feed';
import { formatDate, formatPKR } from '../../../../lib/format';
import { RecordMeta } from '../../../../components/RecordMeta';
import { HistoryList } from '../../../../components/HistoryList';
import { Body, Button, Card, Muted, Row, Screen, Section, Title } from '../../../../components/ui';
import { OwedText } from '../../../../components/BalanceText';

/** One supplier: what the farm owes, and every purchase and payment with the running balance. */
export default function SupplierDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useSession();
  const data = useFeedData();
  if (!data) return <Screen>{null}</Screen>;
  const rec = data.suppliers.find((s) => s.id === id);
  if (!rec) return <Screen><Muted>—</Muted></Screen>;
  const P = data.purchases.map((p) => p.data);
  const Y = data.payments.map((p) => p.data);
  const bal = supplierBalances(P, Y).get(id)?.balancePaisa ?? 0;
  const lines = supplierLedger(id, P, Y).reverse();
  const item = (fid: string) => data.items.find((i) => i.id === fid)?.data.name ?? '';
  return (
    <Screen>
      <Title>{rec.data.name}</Title>
      {rec.data.phone ? <Muted>{rec.data.phone}</Muted> : null}
      <Card><Row style={{ justifyContent: 'space-between' }}><Body>{t('balance')}</Body><OwedText paisa={bal} /></Row></Card>
      {can('feed', 'add') ? (
        <Row>
          <Button title={t('paySupplier')} onPress={() => router.push({ pathname: '/feed/supplier-payment', params: { supplierId: id } })} style={{ flex: 1 }} />
          <Button title={t('addPurchase')} variant="secondary" onPress={() => router.push({ pathname: '/feed/purchase', params: { supplierId: id } })} style={{ flex: 1 }} />
        </Row>
      ) : null}
      <Section>{t('statement')}</Section>
      {lines.length === 0 ? <Muted>{t('noEntries')}</Muted> : null}
      {lines.map((l) => (
        <Card key={`${l.kind}${l.id}`} onPress={() => router.push(l.kind === 'purchase' ? { pathname: '/feed/purchase', params: { id: l.id } } : { pathname: '/feed/supplier-payment', params: { id: l.id } })}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body style={{ fontWeight: '700', flexShrink: 1 }}>
              {formatDate(l.date)} · {l.kind === 'purchase' ? `${item(l.purchase.feedItemId)} ${kg(l.purchase.quantityGrams)} ${t('kgUnit')}` : `${t('payment')} · ${t(`pm_${l.payment.method}`)}`}
            </Body>
            <Body style={{ fontWeight: '800' }}>{l.kind === 'purchase' ? `+${formatPKR(l.purchase.totalPaisa)}` : `−${formatPKR(l.payment.amountPaisa)}`}</Body>
          </Row>
          <Muted>{t('balance')}: {formatPKR(l.balanceAfter)}</Muted>
        </Card>
      ))}
      <Section>{t('history')}</Section>
      <RecordMeta data={rec.data as any} syncState={rec.syncState} />
      {can('feed', 'edit') ? <Button title={t('editSupplier')} variant="secondary" onPress={() => router.push({ pathname: '/feed/supplier', params: { id } })} /> : null}
      <HistoryList entity="Supplier" id={id} />
    </Screen>
  );
}
