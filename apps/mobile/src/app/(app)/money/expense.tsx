import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, type ExpenseCategory, type PaymentMethod, type SaleType } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useFinanceData } from '../../../lib/use-finance';
import { local, newId } from '../../../lib/db';
import { attachPhoto } from '../../../lib/photos';
import { isActive } from '../../../domain/animals';
import { parseRupees } from '../../../domain/sales';
import { today } from '../../../lib/format';
import { PhotoPicker, type PhotoState } from '../../../components/PhotoPicker';
import { RecordMeta } from '../../../components/RecordMeta';
import { HistoryList } from '../../../components/HistoryList';
import { Button, Choice, DateField, Field, Muted, Notice, Screen, Section } from '../../../components/ui';

/** A daily running cost: vet, medicines, labour, electricity, transport, repairs, other. */
export default function ExpenseForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const nav = useNavigation();
  const params = useLocalSearchParams<{ id?: string; animalId?: string }>();
  const { me, can } = useSession();
  const d = useFinanceData();
  const rec = params.id ? d?.expenses.find((e) => e.id === params.id) : undefined;
  const [category, setCategory] = useState<ExpenseCategory>('VET');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<string | null>(today());
  const [desc, setDesc] = useState('');
  const [supplierId, setSupplierId] = useState('none');
  const [payType, setPayType] = useState<SaleType>('CASH');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [animalId, setAnimalId] = useState(params.animalId ?? 'none');
  const [photo, setPhoto] = useState<PhotoState>({ newPhoto: null, remove: false });
  const [filled, setFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => nav.setOptions({ title: params.id ? t('editExpense') : t('addExpense') }), [nav, params.id, t]);
  useEffect(() => {
    if (!rec || filled) return;
    const e = rec.data;
    setCategory(e.category);
    setAmount(String(e.amountPaisa / 100));
    setDate(e.date);
    setDesc(e.description ?? '');
    setSupplierId(e.supplierId ?? 'none');
    setPayType(e.paymentType);
    setMethod(e.method);
    setAnimalId(e.animalId ?? 'none');
    setFilled(true);
  }, [rec, filled]);

  if (!can('expenses', params.id ? 'view' : 'add')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!d) return <Screen>{null}</Screen>;
  const editable = !params.id || can('expenses', 'edit');
  const fixed = !!params.id;

  const save = async () => {
    setError(null);
    const p = parseRupees(amount);
    if (p === null || p === 'invalid' || p <= 0) return setError(t('invalidAmount'));
    const sup = supplierId === 'none' ? null : supplierId;
    if (payType === 'CREDIT' && !sup) return setError(t('expenseCreditNeedsSupplier'));
    setSaving(true);
    const common = { date: date!, category, amountPaisa: p, description: desc.trim() || null, method, animalId: animalId === 'none' ? null : animalId };
    let id = params.id;
    if (id) {
      await local().repo.update('Expense', me!.id, id, { ...common, ...(photo.remove ? { receiptPhotoId: null } : {}) });
    } else {
      id = newId();
      const cashPaymentId = payType === 'CASH' && sup ? newId() : null;
      await local().repo.create('Expense', me!.id, id, { ...common, supplierId: sup, paymentType: payType, cashPaymentId, receiptPhotoId: null });
    }
    if (photo.newPhoto) await attachPhoto(me!.id, 'Expense', id, 'receiptPhotoId', photo.newPhoto);
    router.back();
  };
  const remove = () =>
    Alert.alert(t('delete'), t('deleteEntryQ'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => { await local().repo.remove('Expense', me!.id, params.id!); router.back(); } },
    ]);

  return (
    <Screen>
      <Choice label={t('category')} value={category} onChange={(c) => editable && setCategory(c)} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: t(`ec_${c}`) }))} />
      <Field label={t('amount')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={editable} />
      <DateField label={t('date')} value={date} onChange={(x) => editable && setDate(x)} />
      <Field label={`${t('description')} (${t('optional')})`} value={desc} onChangeText={setDesc} editable={editable} />
      <Choice label={t('supplierOptional')} value={supplierId} onChange={(v) => !fixed && setSupplierId(v)} options={[{ value: 'none', label: t('none') }, ...d.suppliers.filter((s) => s.data.active || s.id === supplierId).map((s) => ({ value: s.id, label: s.data.name }))]} />
      <Choice label={t('paymentType')} value={payType} onChange={(v) => !fixed && setPayType(v)} options={[{ value: 'CASH', label: t('paidNow') }, { value: 'CREDIT', label: t('onCredit') }]} />
      {payType === 'CASH' ? <Choice label={t('method')} value={method} onChange={(m) => editable && setMethod(m)} options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`pm_${m}`) }))} /> : null}
      <Choice label={t('forAnimal')} value={animalId} onChange={(v) => editable && setAnimalId(v)} options={[{ value: 'none', label: t('none') }, ...d.animals.filter((a) => isActive(a.status) || a.animal.id === animalId).map((a) => ({ value: a.animal.id, label: `#${a.animal.tag}` }))]} />
      {editable ? <PhotoPicker label={t('receipt')} savedId={rec?.data.receiptPhotoId ?? null} state={photo} onChange={setPhoto} /> : null}
      {fixed ? <Muted>{t('expenseFixedFields')}</Muted> : null}
      {error ? <Notice tone="bad" text={error} /> : null}
      {editable ? <Button title={t('save')} onPress={save} busy={saving} /> : null}
      {rec ? (
        <>
          <RecordMeta data={rec.data as any} syncState={rec.syncState} />
          {can('expenses', 'delete') ? <Button title={t('delete')} variant="danger" onPress={remove} /> : null}
          <Section>{t('history')}</Section>
          <HistoryList entity="Expense" id={rec.id} />
        </>
      ) : null}
    </Screen>
  );
}
