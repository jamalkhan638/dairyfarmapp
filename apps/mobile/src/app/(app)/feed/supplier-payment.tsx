import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PAYMENT_METHODS, type PaymentMethod } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useFeedData } from '../../../lib/use-feed';
import { local, newId } from '../../../lib/db';
import { supplierBalances } from '../../../domain/feed';
import { parseRupees } from '../../../domain/sales';
import { formatPKR, today } from '../../../lib/format';
import { RecordMeta } from '../../../components/RecordMeta';
import { HistoryList } from '../../../components/HistoryList';
import { Button, Card, Choice, DateField, Field, InfoLine, Notice, Screen, Section } from '../../../components/ui';

/** Money paid to a supplier. Any amount: partial payments are fine. */
export default function SupplierPaymentForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const nav = useNavigation();
  const params = useLocalSearchParams<{ id?: string; supplierId?: string }>();
  const { me, can } = useSession();
  const data = useFeedData();
  const rec = params.id ? data?.payments.find((p) => p.id === params.id) : undefined;
  const [supplierId, setSupplierId] = useState<string | null>(params.supplierId ?? null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [date, setDate] = useState<string | null>(today());
  const [note, setNote] = useState('');
  const [filled, setFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => nav.setOptions({ title: params.id ? t('editSupplierPayment') : t('paySupplier') }), [nav, params.id, t]);
  useEffect(() => {
    if (!rec || filled) return;
    setSupplierId(rec.data.supplierId);
    setAmount(String(rec.data.amountPaisa / 100));
    setMethod(rec.data.method);
    setDate(rec.data.date);
    setNote(rec.data.note ?? '');
    setFilled(true);
  }, [rec, filled]);
  if (!can('feed', params.id ? 'view' : 'add')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!data) return <Screen>{null}</Screen>;
  const linked = !!rec?.data.purchaseId;
  const readOnly = linked || (!!params.id && !can('feed', 'edit'));
  const bal = supplierId ? supplierBalances(data.purchases.map((p) => p.data), data.payments.map((p) => p.data)).get(supplierId)?.balancePaisa ?? 0 : null;

  const save = async () => {
    const p = parseRupees(amount);
    if (!supplierId) return setError(t('supplier'));
    if (p === null || p === 'invalid' || p <= 0) return setError(t('invalidAmount'));
    const values = { supplierId, date: date!, amountPaisa: p, method, note: note.trim() || null };
    if (params.id) await local().repo.update('SupplierPayment', me!.id, params.id, values);
    else await local().repo.create('SupplierPayment', me!.id, newId(), values);
    router.back();
  };
  const remove = () =>
    Alert.alert(t('delete'), t('deleteEntryQ'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => { await local().repo.remove('SupplierPayment', me!.id, params.id!); router.back(); } },
    ]);
  return (
    <Screen>
      {linked ? <Notice text={t('cashPurchaseLinked')} /> : null}
      <Choice label={t('supplier')} value={supplierId} onChange={(v) => !params.id && setSupplierId(v)} options={data.suppliers.filter((s) => s.data.active || s.id === supplierId).map((s) => ({ value: s.id, label: s.data.name }))} />
      {bal !== null && !params.id ? <Card><InfoLine label={t('weOwe')} value={formatPKR(Math.max(0, bal))} /></Card> : null}
      <Field label={t('amount')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!readOnly} />
      {bal !== null && bal > 0 && !params.id ? <Button title={`${t('weOwe')}: ${formatPKR(bal)}`} variant="ghost" onPress={() => setAmount(String(bal / 100))} /> : null}
      <Choice label={t('method')} value={method} onChange={(m) => !readOnly && setMethod(m)} options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`pm_${m}`) }))} />
      <DateField label={t('date')} value={date} onChange={(d) => !readOnly && setDate(d)} />
      <Field label={`${t('notes')} (${t('optional')})`} value={note} onChangeText={setNote} editable={!readOnly} multiline />
      {error ? <Notice tone="bad" text={error} /> : null}
      {!readOnly ? <Button title={t('save')} onPress={save} disabled={!amount || !supplierId || !date} /> : null}
      {rec ? (
        <>
          <RecordMeta data={rec.data as any} syncState={rec.syncState} />
          {!linked && can('feed', 'delete') ? <Button title={t('delete')} variant="danger" onPress={remove} /> : null}
          <Section>{t('history')}</Section>
          <HistoryList entity="SupplierPayment" id={rec.id} />
        </>
      ) : null}
    </Screen>
  );
}
