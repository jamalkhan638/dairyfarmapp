import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PAYMENT_METHODS, type PaymentMethod } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useSalesData } from '../../../lib/use-sales';
import { local, newId } from '../../../lib/db';
import { balances, parseRupees } from '../../../domain/sales';
import { formatPKR, today } from '../../../lib/format';
import { RecordMeta } from '../../../components/RecordMeta';
import { HistoryList } from '../../../components/HistoryList';
import { Button, Choice, DateField, Field, InfoLine, Card, Notice, Screen, Section } from '../../../components/ui';

/** Money received from a customer. Any amount: partial payments and advances are fine. */
export default function PaymentForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const nav = useNavigation();
  const params = useLocalSearchParams<{ id?: string; customerId?: string }>();
  const { me, can } = useSession();
  const data = useSalesData();
  const rec = params.id ? data?.payments.find((p) => p.id === params.id) : undefined;
  const [customerId, setCustomerId] = useState<string | null>(params.customerId ?? null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [date, setDate] = useState<string | null>(today());
  const [note, setNote] = useState('');
  const [filled, setFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => nav.setOptions({ title: params.id ? t('editPayment') : t('receivePayment') }), [nav, params.id, t]);
  useEffect(() => {
    if (!rec || filled) return;
    setCustomerId(rec.data.customerId);
    setAmount(String(rec.data.amountPaisa / 100));
    setMethod(rec.data.method);
    setDate(rec.data.date);
    setNote(rec.data.note ?? '');
    setFilled(true);
  }, [rec, filled]);

  if (!can('sales', params.id ? 'view' : 'add')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!data) return <Screen>{null}</Screen>;
  const linked = !!rec?.data.deliveryId;
  const readOnly = linked || (!!params.id && !can('sales', 'edit'));
  const bal = customerId ? balances(data.deliveries.map((d) => d.data), data.payments.map((p) => p.data)).get(customerId)?.balancePaisa ?? 0 : null;

  const save = async () => {
    setError(null);
    const p = parseRupees(amount);
    if (!customerId) return setError(t('chooseCustomer'));
    if (p === null || p === 'invalid' || p <= 0) return setError(t('invalidAmount'));
    const values = { customerId, date: date!, amountPaisa: p, method, note: note.trim() || null };
    if (params.id) await local().repo.update('CustomerPayment', me!.id, params.id, values);
    else await local().repo.create('CustomerPayment', me!.id, newId(), values);
    router.back();
  };
  const remove = () =>
    Alert.alert(t('delete'), t('deleteEntryQ'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => { await local().repo.remove('CustomerPayment', me!.id, params.id!); router.back(); } },
    ]);

  const customers = data.customers.filter((c) => c.data.active || c.id === customerId);
  return (
    <Screen>
      {linked ? <Notice text={t('cashPaymentLinked')} /> : null}
      <Choice label={t('customer')} value={customerId} onChange={(v) => !params.id && setCustomerId(v)} options={customers.map((c) => ({ value: c.id, label: c.data.name }))} />
      {bal !== null && !params.id ? (
        <Card>
          <InfoLine label={t('balance')} value={bal >= 0 ? formatPKR(bal) : `${t('advance')} ${formatPKR(-bal)}`} />
        </Card>
      ) : null}
      <Field label={t('amount')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!readOnly} />
      {bal !== null && bal > 0 && !params.id ? <Button title={`${t('balance')}: ${formatPKR(bal)}`} variant="ghost" onPress={() => setAmount(String(bal / 100))} /> : null}
      <Choice label={t('method')} value={method} onChange={(m) => !readOnly && setMethod(m)} options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`pm_${m}`) }))} />
      <DateField label={t('date')} value={date} onChange={(d) => !readOnly && setDate(d)} />
      <Field label={`${t('notes')} (${t('optional')})`} value={note} onChangeText={setNote} editable={!readOnly} multiline />
      {error ? <Notice tone="bad" text={error} /> : null}
      {!readOnly ? <Button title={t('save')} onPress={save} disabled={!amount || !customerId || !date} /> : null}
      {rec ? (
        <>
          <RecordMeta data={rec.data} syncState={rec.syncState} />
          {!linked && can('sales', 'delete') ? <Button title={t('delete')} variant="danger" onPress={remove} /> : null}
          <Section>{t('history')}</Section>
          <HistoryList entity="CustomerPayment" id={rec.id} />
        </>
      ) : null}
    </Screen>
  );
}
