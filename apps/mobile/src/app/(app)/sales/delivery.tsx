import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { saleAmountPaisa } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useSalesData } from '../../../lib/use-sales';
import { local } from '../../../lib/db';
import { parseRupees } from '../../../domain/sales';
import { litres, parseLitres } from '../../../domain/milk';
import { formatDate, formatPKR } from '../../../lib/format';
import { RecordMeta } from '../../../components/RecordMeta';
import { HistoryList } from '../../../components/HistoryList';
import { Button, Card, Field, InfoLine, Muted, Notice, Screen, Section } from '../../../components/ui';

/** Change the litres, rate or note of one delivery, or delete it (its cash payment goes with it). */
export default function DeliveryEdit() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, can } = useSession();
  const data = useSalesData();
  const rec = data?.deliveries.find((d) => d.id === id);
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState('');
  const [note, setNote] = useState('');
  const [filled, setFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rec || filled) return;
    setQty(litres(rec.data.quantityMl).replace(/,/g, ''));
    setRate(String(rec.data.ratePaisaPerLitre / 100));
    setNote(rec.data.note ?? '');
    setFilled(true);
  }, [rec, filled]);

  if (!data) return <Screen>{null}</Screen>;
  if (!rec) return <Screen><Muted>—</Muted></Screen>;
  const d = rec.data;
  const customer = data.customers.find((c) => c.id === d.customerId)?.data.name ?? '';
  const canEdit = can('sales', 'edit');
  const ml = parseLitres(qty);
  const r = parseRupees(rate);
  const preview = typeof ml === 'number' && typeof r === 'number' ? saleAmountPaisa(ml, r) : null;

  const save = async () => {
    if (typeof ml !== 'number' || ml <= 0) return setError(t('invalidLitres'));
    if (typeof r !== 'number') return setError(t('invalidRate'));
    await local().repo.update('MilkDelivery', me!.id, id, { quantityMl: ml, ratePaisaPerLitre: r, note: note.trim() || null, amountPaisa: saleAmountPaisa(ml, r) });
    router.back();
  };
  const remove = () =>
    Alert.alert(t('delete'), t('deleteEntryQ'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => { await local().repo.remove('MilkDelivery', me!.id, id); router.back(); } },
    ]);

  return (
    <Screen>
      <Card>
        <InfoLine label={t('customer')} value={customer} />
        <InfoLine label={t('date')} value={`${formatDate(d.date)} · ${d.session === 'MORNING' ? t('morning') : t('evening')}`} />
        <InfoLine label={t('saleType')} value={t(`st_${d.saleType}`)} />
        <InfoLine label={t('amountShort')} value={formatPKR(preview ?? d.amountPaisa)} />
        {d.saleType === 'CASH' ? <Muted>{t('cashSaleNote')}</Muted> : null}
      </Card>
      <Field label={t('quantity')} value={qty} onChangeText={setQty} keyboardType="decimal-pad" editable={canEdit} />
      <Field label={t('rate')} value={rate} onChangeText={setRate} keyboardType="decimal-pad" editable={canEdit} />
      <Field label={`${t('notes')} (${t('optional')})`} value={note} onChangeText={setNote} editable={canEdit} multiline />
      <Muted>{t('deliveryFixedFields')}</Muted>
      {error ? <Notice tone="bad" text={error} /> : null}
      {canEdit ? <Button title={t('save')} onPress={save} /> : null}
      <RecordMeta data={d} syncState={rec.syncState} />
      {can('sales', 'delete') ? <Button title={t('delete')} variant="danger" onPress={remove} /> : null}
      <Section>{t('history')}</Section>
      <HistoryList entity="MilkDelivery" id={id} />
    </Screen>
  );
}
