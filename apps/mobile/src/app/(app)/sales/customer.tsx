import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { SaleType } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useSalesData } from '../../../lib/use-sales';
import { local, newId } from '../../../lib/db';
import { parseRupees } from '../../../domain/sales';
import { today } from '../../../lib/format';
import { Button, Choice, DateField, Field, Notice, Screen, Toggle } from '../../../components/ui';

/** Add a customer (with their first rate) or edit one. */
export default function CustomerForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const nav = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { me, can } = useSession();
  const data = useSalesData();
  const rec = id ? data?.customers.find((c) => c.id === id) : undefined;
  const [f, setF] = useState({ name: '', phone: '', address: '', notes: '' });
  const [saleType, setSaleType] = useState<SaleType>('CREDIT');
  const [active, setActive] = useState(true);
  const [rate, setRate] = useState('');
  const [rateFrom, setRateFrom] = useState<string | null>(today());
  const [filled, setFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => nav.setOptions({ title: id ? t('editCustomer') : t('addCustomer') }), [nav, id, t]);
  useEffect(() => {
    if (!rec || filled) return;
    setF({ name: rec.data.name, phone: rec.data.phone ?? '', address: rec.data.address ?? '', notes: rec.data.notes ?? '' });
    setSaleType(rec.data.defaultSaleType);
    setActive(rec.data.active);
    setFilled(true);
  }, [rec, filled]);

  if (!can('sales', id ? 'edit' : 'add')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setError(null);
    const name = f.name.trim();
    if (!name) return setError(t('required'));
    const taken = (data?.customers ?? []).some((c) => c.id !== id && c.data.name.trim().toLowerCase() === name.toLowerCase());
    if (taken) return setError(t('nameTaken'));
    const values = { name, phone: f.phone.trim() || null, address: f.address.trim() || null, notes: f.notes.trim() || null, defaultSaleType: saleType, active };
    if (id) {
      await local().repo.update('Customer', me!.id, id, values);
      router.back();
      return;
    }
    const r = parseRupees(rate);
    if (r !== null && (r === 'invalid' || r <= 0)) return setError(t('invalidRate'));
    const cid = newId();
    await local().repo.create('Customer', me!.id, cid, values);
    if (typeof r === 'number') {
      await local().repo.create('CustomerRate', me!.id, newId(), { customerId: cid, ratePaisaPerLitre: r, effectiveFrom: rateFrom ?? today(), note: null });
    }
    router.replace(`/sales/${cid}`);
  };

  const remove = () =>
    Alert.alert(t('delete'), t('deleteCustomerQ'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => { await local().repo.remove('Customer', me!.id, id!); router.replace('/sales'); } },
    ]);

  const hasSales = !!id && !!data && (data.deliveries.some((d) => d.data.customerId === id) || data.payments.some((p) => p.data.customerId === id));
  return (
    <Screen>
      <Field label={t('name')} value={f.name} onChangeText={set('name')} />
      <Field label={`${t('phone')} (${t('optional')})`} value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <Field label={`${t('address')} (${t('optional')})`} value={f.address} onChangeText={set('address')} />
      <Choice label={t('defaultSaleType')} value={saleType} onChange={setSaleType} options={[{ value: 'CREDIT', label: t('st_CREDIT') }, { value: 'CASH', label: t('st_CASH') }]} />
      {!id && can('sales', 'edit') ? (
        <>
          <Field label={t('rate')} value={rate} onChangeText={setRate} keyboardType="decimal-pad" />
          <DateField label={t('rateFrom')} value={rateFrom} onChange={setRateFrom} />
        </>
      ) : id ? (
        <Toggle label={t('activeCustomer')} value={active} onChange={setActive} />
      ) : null}
      <Field label={`${t('notes')} (${t('optional')})`} value={f.notes} onChangeText={set('notes')} multiline />
      {error ? <Notice tone="bad" text={error} /> : null}
      <Button title={t('save')} onPress={save} />
      {id && can('sales', 'delete') ? (hasSales ? <Notice text={t('inUseUseInactive')} /> : <Button title={t('delete')} variant="danger" onPress={remove} />) : null}
    </Screen>
  );
}
