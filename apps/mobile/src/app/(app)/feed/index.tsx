import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../lib/session';
import { useFeedData } from '../../../lib/use-feed';
import { bagsText, feedExpense, kg, stockByItem } from '../../../domain/feed';
import { formatPKR, today } from '../../../lib/format';
import { monthRange } from '../../../lib/months';
import { Body, Button, Card, InfoLine, Muted, Notice, Row, Screen, Section } from '../../../components/ui';

/** Feed: buy feed, record feeding (monthly or daily), and what is in the store. */
export default function FeedHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = useSession();
  const data = useFeedData();
  if (!can('feed', 'view')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!data) return <Screen>{null}</Screen>;
  const P = data.purchases.map((x) => x.data);
  const C = data.consumptions.map((x) => x.data);
  const stock = stockByItem(P, C, data.adjustments.map((x) => x.data));
  const { from, to } = monthRange(today().slice(0, 7));
  const exp = feedExpense(C, P, from, to);
  const boughtPaisa = P.filter((p) => !p.deletedAt && p.date >= from && p.date <= to).reduce((s, p) => s + p.totalPaisa, 0);
  const monthlyDone = C.some((c) => !c.deletedAt && c.period === 'MONTH' && c.date.slice(0, 7) === today().slice(0, 7));
  const items = data.items.filter((i) => i.data.active);

  return (
    <Screen>
      {items.length === 0 ? (
        <Card>
          <Body style={{ fontSize: 18, fontWeight: '700' }}>🌾 {t('noFeedTypesHelp')}</Body>
          {can('feed', 'add') ? <Button title={t('addFeedType')} onPress={() => router.push('/feed/item')} /> : null}
        </Card>
      ) : null}

      {can('feed', 'add') ? (
        <Row>
          <Button title={`🛒 ${t('addPurchase')}`} onPress={() => router.push({ pathname: '/money/expense', params: { category: 'FEED' } })} style={{ flex: 1, minHeight: 64 }} />
          <Button title={`🐄 ${t('recordFeeding')}`} onPress={() => router.push('/feed/record')} style={{ flex: 1, minHeight: 64 }} />
        </Row>
      ) : null}

      <Card>
        <Section>{t('thisMonth')}</Section>
        <InfoLine label={t('feedBoughtThisMonth')} value={formatPKR(boughtPaisa)} />
        <InfoLine label={t('feedUsed')} value={formatPKR(exp.costPaisa)} />
        {!monthlyDone && exp.costPaisa === 0 ? <Muted>{t('monthlyNotEntered')}</Muted> : null}
      </Card>

      {items.length ? <Section>{t('stock')}</Section> : null}
      {items.map((i) => {
        const g = stock.get(i.id) ?? 0;
        const bags = bagsText(g, i.data.bagWeightGrams);
        return (
          <Card key={i.id} onPress={() => router.push({ pathname: '/feed/item', params: { id: i.id } })}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Body style={{ fontWeight: '800', fontSize: 18, flexShrink: 1 }}>{i.data.name}</Body>
              <Body style={{ fontWeight: '800' }}>{kg(g)} {t('kgUnit')}</Body>
            </Row>
            {bags ? <Muted>{bags.bags} {t('bags')}{bags.restGrams ? ` + ${kg(bags.restGrams)} ${t('kgUnit')}` : ''}</Muted> : null}
            {g < 0 ? <Notice tone="warn" text={t('stockNegative')} /> : null}
          </Card>
        );
      })}

      <Row>
        <Button title={t('feedTypes')} variant="secondary" onPress={() => router.push('/feed/items')} style={{ flex: 1 }} />
        <Button title={t('suppliers')} variant="secondary" onPress={() => router.push('/feed/suppliers')} style={{ flex: 1 }} />
      </Row>
      <Button title={t('feedingLog')} variant="ghost" onPress={() => router.push('/feed/log')} />
    </Screen>
  );
}
