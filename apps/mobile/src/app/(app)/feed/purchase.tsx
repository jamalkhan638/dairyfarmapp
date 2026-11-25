import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { SaleType } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useFeedData } from '../../../lib/use-feed';
import { local, newId } from '../../../lib/db';
import { kg, parseKg } from '../../../domain/feed';
import { parseRupees } from '../../../domain/sales';
import { formatPKR, today } from '../../../lib/format';
import { RecordMeta } from '../../../components/RecordMeta';
import { HistoryList } from '../../../components/HistoryList';
import { Button, Card, Choice, DateField, Field, InfoLine, Muted, Notice, Screen, Section } from '../../../components/ui';

type Mode = 'bag' | 'kg';

/** Feed bought: by bags (with the item's bag weight) or by kg. Cash or credit. */
export default function PurchaseForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const nav = useNavigation();
  const params = useLocalSearchParams<{ id?: string; supplierId?: string }>();
  const { me, can } = useSession();
  const data = useFeedData();
  const rec = params.id ? data?.purchases.find((p) => p.id === params.id) : undefined;
  const [itemId, setItemId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<string>(params.supplierId ?? 'none');
  const [date, setDate] = useState<string | null>(today());
  const [mode, setMode] = useState<Mode>('bag');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [payType, setPayType] = useState<SaleType>('CASH');
  const [note, setNote] = useState('');
  const [filled, setFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => nav.setOptions({ title: params.id ? t('editPurchase') : t('addPurchase') }), [nav, params.id, t]);
  useEffect(() => {
    if (!rec || filled) return;
    const p = rec.data;
    setItemId(p.feedItemId);
    setSupplierId(p.supplierId ?? 'none');
    setDate(p.date);
    setPayType(p.paymentType);
    setNote(p.note ?? '');
    if (p.bags) {
      setMode('bag');
      setQty(String(p.bags));
      setPrice(String(Math.round(p.totalPaisa / p.bags) / 100));
    } else {
      setMode('kg');
      setQty(kg(p.quantityGrams).replace(/,/g, ''));
      setPrice(String(p.costPerKgPaisa / 100));
    }
    setFilled(true);
  }, [rec, filled]);

  if (!can('feed', params.id ? 'view' : 'add')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!data) return <Screen>{null}</Screen>;
  const item = data.items.find((i) => i.id === itemId)?.data;
  const canBag = !!item?.bagWeightGrams;
  const useMode: Mode = canBag ? mode : 'kg';
  const editable = !params.id || can('feed', 'edit');

  // Work out kg and total from what was typed.
  const qn = useMode === 'bag' ? Number(qty.replace(',', '.')) : null;
  const grams = useMode === 'bag' ? (qn && qn > 0 && item?.bagWeightGrams ? Math.round(qn * item.bagWeightGrams) : null) : (() => { const g = parseKg(qty); return typeof g === 'number' && g > 0 ? g : null; })();
  const unit = parseRupees(price);
  const total = grams !== null && typeof unit === 'number' ? (useMode === 'bag' ? Math.round((qn ?? 0) * unit) : Math.round((grams * unit) / 1000)) : null;

  const save = async () => {
    setError(null);
    if (!itemId) return setError(t('chooseItem'));
    if (grams === null) return setError(t('invalidKg'));
    if (total === null || total <= 0) return setError(t('invalidAmount'));
    const sup = supplierId === 'none' ? null : supplierId;
    if (payType === 'CREDIT' && !sup) return setError(t('creditNeedsSupplier'));
    const bags = useMode === 'bag' ? qn : null;
    if (params.id) {
      await local().repo.update('FeedPurchase', me!.id, params.id, { date: date!, quantityGrams: grams, bags, totalPaisa: total, note: note.trim() || null, costPerKgPaisa: Math.round((total * 1000) / grams) });
    } else {
      const cashPaymentId = payType === 'CASH' && sup ? newId() : null;
      const send = { feedItemId: itemId, supplierId: sup, date: date!, quantityGrams: grams, bags, totalPaisa: total, paymentType: payType, cashPaymentId, note: note.trim() || null };
      await local().repo.create('FeedPurchase', me!.id, newId(), send, { ...send, costPerKgPaisa: Math.round((total * 1000) / grams) });
    }
    router.back();
  };
  const remove = () =>
    Alert.alert(t('delete'), t('deleteEntryQ'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => { await local().repo.remove('FeedPurchase', me!.id, params.id!); router.back(); } },
    ]);

  const fixed = !!params.id;
  return (
    <Screen>
      <Choice label={t('feedItem')} value={itemId} onChange={(v) => !fixed && setItemId(v)} options={data.items.filter((i) => i.data.active || i.id === itemId).map((i) => ({ value: i.id, label: i.data.name }))} />
      {data.items.length === 0 ? <Button title={t('addFeedItem')} variant="ghost" onPress={() => router.push('/feed/item')} /> : null}
      <Choice label={t('supplier')} value={supplierId} onChange={(v) => !fixed && setSupplierId(v)} options={[{ value: 'none', label: t('noSupplier') }, ...data.suppliers.filter((s) => s.data.active || s.id === supplierId).map((s) => ({ value: s.id, label: s.data.name }))]} />
      <Choice label={t('paymentType')} value={payType} onChange={(v) => !fixed && setPayType(v)} options={[{ value: 'CASH', label: t('st_CASH') }, { value: 'CREDIT', label: t('st_CREDIT') }]} />
      <DateField label={t('date')} value={date} onChange={(d) => editable && setDate(d)} />
      {canBag ? <Choice label={t('buyBy')} value={useMode} onChange={(m) => editable && setMode(m)} options={[{ value: 'bag', label: `${t('byBag')} (${kg(item!.bagWeightGrams!)} ${t('kgUnit')})` }, { value: 'kg', label: t('byKg') }]} /> : null}
      <Field label={useMode === 'bag' ? t('bagsCount') : `${t('quantity').split('(')[0].trim()} (${t('kgUnit')})`} value={qty} onChangeText={setQty} keyboardType="decimal-pad" editable={editable} />
      <Field label={useMode === 'bag' ? t('pricePerBag') : t('pricePerKg')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" editable={editable} />
      <Card>
        <InfoLine label={t('totalAmount')} value={total !== null ? formatPKR(total) : '—'} />
        {grams !== null ? <InfoLine label={t('kgUnit')} value={kg(grams)} /> : null}
        {grams && total ? <InfoLine label={t('avgPrice')} value={`${formatPKR(Math.round((total * 1000) / grams))}/${t('kgUnit')}`} /> : null}
      </Card>
      <Field label={`${t('notes')} (${t('optional')})`} value={note} onChangeText={setNote} multiline editable={editable} />
      <Muted>{t('purchaseNotExpense')}</Muted>
      {fixed ? <Muted>{t('purchaseFixedFields')}</Muted> : null}
      {error ? <Notice tone="bad" text={error} /> : null}
      {editable ? <Button title={t('save')} onPress={save} /> : null}
      {rec ? (
        <>
          {rec.data.cashPaymentId ? <Muted>{t('cashPurchaseNote')}</Muted> : null}
          <RecordMeta data={rec.data as any} syncState={rec.syncState} />
          {can('feed', 'delete') ? <Button title={t('delete')} variant="danger" onPress={remove} /> : null}
          <Section>{t('history')}</Section>
          <HistoryList entity="FeedPurchase" id={rec.id} />
        </>
      ) : null}
    </Screen>
  );
}
