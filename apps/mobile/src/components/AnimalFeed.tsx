import React from 'react';
import { useTranslation } from 'react-i18next';
import { useFeedData } from '../lib/use-feed';
import { feedByAnimal, kg } from '../domain/feed';
import { daysAgo, formatPKR, today } from '../lib/format';
import { Badge, Card, InfoLine, Muted, Notice } from './ui';

/** One animal's feed and feed cost for the last 30 days. Shared feeding makes it an estimate. */
export function AnimalFeed({ animalId }: { animalId: string }) {
  const { t } = useTranslation();
  const data = useFeedData();
  if (!data) return null;
  const m = feedByAnimal(data.consumptions.map((c) => c.data), data.purchases.map((p) => p.data), daysAgo(29), today()).get(animalId);
  if (!m) return <Muted>{t('noEntries')}</Muted>;
  return (
    <Card>
      <InfoLine label={t('feedLast30')} value={`${kg(m.grams)} ${t('kgUnit')}`} />
      <InfoLine label={t('costEstimate')} value={formatPKR(m.costPaisa)} />
      {m.estimated ? <Badge text={t('estimateLabel')} tone="warn" /> : null}
      {m.estimated ? <Muted>{t('sharedEstimate')}</Muted> : null}
      {m.unpricedGrams ? <Notice tone="warn" text={t('unpricedFeed', { kg: kg(m.unpricedGrams) })} /> : null}
    </Card>
  );
}
