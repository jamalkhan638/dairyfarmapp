import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../lib/session';
import { useFeedData } from '../../../lib/use-feed';
import { local, newId } from '../../../lib/db';
import { kg, parseKg, stockByItem } from '../../../domain/feed';
import { today } from '../../../lib/format';
import { Button, Card, Choice, Field, InfoLine, Notice, Screen } from '../../../components/ui';

/** After counting the store: record the difference so the app's stock matches what is really there. */
export default function StockCount() {
  const { t } = useTranslation();
  const router = useRouter();
  const { me, can } = useSession();
  const data = useFeedData();
  const [itemId, setItemId] = useState<string | null>(null);
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!can('feed', 'edit')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!data) return <Screen>{null}</Screen>;
  const stock = stockByItem(data.purchases.map((p) => p.data), data.consumptions.map((c) => c.data), data.adjustments.map((a) => a.data));
  const shows = itemId ? stock.get(itemId) ?? 0 : null;
  const c = parseKg(counted);
  const change = typeof c === 'number' && shows !== null ? c - shows : null;

  const save = async () => {
    if (!itemId) return setError(t('chooseItem'));
    if (typeof c !== 'number') return setError(t('invalidKg'));
    if (!change) return router.back();
    await local().repo.create('StockAdjustment', me!.id, newId(), { feedItemId: itemId, date: today(), changeGrams: change, reason: reason.trim() || null });
    router.back();
  };
  return (
    <Screen>
      <Choice label={t('feedItem')} value={itemId} onChange={setItemId} options={data.items.filter((i) => i.data.active).map((i) => ({ value: i.id, label: i.data.name }))} />
      {shows !== null ? <Card><InfoLine label={t('appShows')} value={`${kg(shows)} ${t('kgUnit')}`} /></Card> : null}
      <Field label={t('countedKg')} value={counted} onChangeText={setCounted} keyboardType="decimal-pad" />
      {change !== null ? <Card><InfoLine label={t('adjustmentWillBe')} value={change === 0 ? t('noChange') : `${change > 0 ? '+' : ''}${kg(change)} ${t('kgUnit')}`} /></Card> : null}
      <Field label={`${t('reason')} (${t('optional')})`} value={reason} onChangeText={setReason} />
      {error ? <Notice tone="bad" text={error} /> : null}
      <Button title={t('save')} onPress={save} disabled={!itemId || !counted} />
    </Screen>
  );
}
