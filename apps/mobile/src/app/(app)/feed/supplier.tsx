import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../lib/session';
import { useFeedData } from '../../../lib/use-feed';
import { local, newId } from '../../../lib/db';
import { Button, Field, Notice, Screen, Toggle } from '../../../components/ui';

export default function SupplierForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const nav = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { me, can } = useSession();
  const data = useFeedData();
  const rec = id ? data?.suppliers.find((s) => s.id === id) : undefined;
  const [f, setF] = useState({ name: '', phone: '', address: '', notes: '' });
  const [active, setActive] = useState(true);
  const [filled, setFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => nav.setOptions({ title: id ? t('editSupplier') : t('addSupplier') }), [nav, id, t]);
  useEffect(() => {
    if (!rec || filled) return;
    setF({ name: rec.data.name, phone: rec.data.phone ?? '', address: rec.data.address ?? '', notes: rec.data.notes ?? '' });
    setActive(rec.data.active);
    setFilled(true);
  }, [rec, filled]);
  if (!can('feed', id ? 'edit' : 'add')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const used = !!id && !!data && (data.purchases.some((p) => p.data.supplierId === id) || data.payments.some((p) => p.data.supplierId === id));

  const save = async () => {
    const name = f.name.trim();
    if (!name) return setError(t('required'));
    if (data?.suppliers.some((s) => s.id !== id && s.data.name.trim().toLowerCase() === name.toLowerCase())) return setError(t('supplierNameTaken'));
    const values = { name, phone: f.phone.trim() || null, address: f.address.trim() || null, notes: f.notes.trim() || null, active };
    if (id) await local().repo.update('Supplier', me!.id, id, values);
    else await local().repo.create('Supplier', me!.id, newId(), values);
    router.back();
  };
  const remove = () =>
    Alert.alert(t('delete'), t('deleteEntryQ'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => { await local().repo.remove('Supplier', me!.id, id!); router.replace('/feed/suppliers'); } },
    ]);
  return (
    <Screen>
      <Field label={t('name')} value={f.name} onChangeText={set('name')} />
      <Field label={`${t('phone')} (${t('optional')})`} value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <Field label={`${t('address')} (${t('optional')})`} value={f.address} onChangeText={set('address')} />
      <Field label={`${t('notes')} (${t('optional')})`} value={f.notes} onChangeText={set('notes')} multiline />
      {id ? <Toggle label={t('activeSupplier')} value={active} onChange={setActive} /> : null}
      {error ? <Notice tone="bad" text={error} /> : null}
      <Button title={t('save')} onPress={save} />
      {id && can('feed', 'delete') ? (used ? <Notice text={t('inUseUseInactive')} /> : <Button title={t('delete')} variant="danger" onPress={remove} />) : null}
    </Screen>
  );
}
