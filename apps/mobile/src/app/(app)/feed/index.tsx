import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../lib/session';
import { useFeedData } from '../../../lib/use-feed';
import { averageCostPerKg, bagsText, feedExpense, kg, stockByItem, supplierBalances } from '../../../domain/feed';
import { formatPKR, today } from '../../../lib/format';
import { monthRange } from '../../../lib/months';
import { Badge, Body, Button, Card, InfoLine, Muted, Notice, Row, Screen, Section } from '../../../components/ui';

/** Feed overview: what is in store, this month's feed expense, and shortcuts. */
export default function FeedHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = useSession();
  const data = useFeedData();
  if (!can('feed', 'view')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!data) return <Screen>{null}</Screen>;
  const P = data.purchases.map((x) => x.data);
  const stock = stockByItem(P, data.consumptions.map((x) => x.data), data.adjustments.map((x) => x.data));
  const { from, to } = monthRange(today().slice(0, 7));
  const exp = feedExpense(data.consumptions.map((x) => x.data), P, from, to);
  const owed = [...supplierBalances(P, data.payments.map((x) => x.data)).values()].reduce((s, b) => s + Math.max(0, b.balancePaisa), 0);

  return (
    <Screen>
      {can('feed', 'add') ? (
        <>
          <Button title={t('recordFeeding')} onPress={() => router.push('/feed/feeding')} />
          <Row>
            <Button title={t('addPurchase')} variant="secondary" onPress={() => router.push('/feed/purchase')} style={{ flex: 1 }} />
            <Button title={t('paySupplier')} variant="secondary" onPress={() => router.push('/feed/supplier-payment')} style={{ flex: 1 }} />
          </Row>
        </>
      ) : null}

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Section>{t('feedExpense')} · {t('thisMonth')}</Section>
          <Badge text={t('inProgress')} tone="info" />
        </Row>
        <Body style={{ fontSize: 26, fontWeight: '800' }}>{formatPKR(exp.costPaisa)}</Body>
        <Muted>{t('kgFed')}: {kg(exp.fedGrams)} · {t('kgWasted')}: {kg(exp.wastedGrams)}</Muted>
        {exp.unpricedGrams ? <Notice tone="warn" text={t('unpricedFeed', { kg: kg(exp.unpricedGrams) })} /> : null}
        <Muted>{t('feedExpenseNote')}</Muted>
      </Card>

      <Section>{t('stock')}</Section>
      {data.items.length === 0 ? <Muted>{t('noFeedItems')}</Muted> : null}
      {data.items.filter((i) => i.data.active).map((i) => {
        const g = stock.get(i.id) ?? 0;
        const bags = bagsText(g, i.data.bagWeightGrams);
        const avg = averageCostPerKg(P, i.id, today());
        return (
          <Card key={i.id} onPress={() => router.push({ pathname: '/feed/item', params: { id: i.id } })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body style={{ fontWeight: '800', fontSize: 18, flexShrink: 1 }}>{i.data.name}</Body>
              <Body style={{ fontWeight: '800' }}>{kg(g)} {t('kgUnit')}</Body>
            </Row>
            <Muted>
              {t(`fc_${i.data.category}`)}
              {bags ? ` · ${bags.bags} ${t('bags')}${bags.restGrams ? ` + ${kg(bags.restGrams)} ${t('kgUnit')}` : ''}` : ''}
              {avg !== null ? ` · ${t('avgPrice')} ${formatPKR(avg)}/${t('kgUnit')}` : ''}
            </Muted>
            {g < 0 ? <Notice tone="warn" text={t('stockNegative')} /> : null}
          </Card>
        );
      })}
      <Card>
        <InfoLine label={t('supplierTotalOwed')} value={formatPKR(owed)} />
      </Card>
      <Button title={t('feedingLog')} variant="secondary" onPress={() => router.push('/feed/log')} />
      <Button title={t('suppliers')} variant="secondary" onPress={() => router.push('/feed/suppliers')} />
      <Row>
        <Button title={t('feedItems')} variant="secondary" onPress={() => router.push('/feed/items')} style={{ flex: 1 }} />
        {can('feed', 'edit') ? <Button title={t('stockCount')} variant="secondary" onPress={() => router.push('/feed/stock-count')} style={{ flex: 1 }} /> : null}
      </Row>
    </Screen>
  );
}
