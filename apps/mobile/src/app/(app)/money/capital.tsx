import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CAPITAL_TYPES, PAYMENT_METHODS, type CapitalType, type PaymentMethod } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useFinanceData } from '../../../lib/use-finance';
import { local, newId } from '../../../lib/db';
import { attachPhoto } from '../../../lib/photos';
import { parseRupees } from '../../../domain/sales';
import { today } from '../../../lib/format';
import { PhotoPicker, type PhotoState } from '../../../components/PhotoPicker';
import { RecordMeta } from '../../../components/RecordMeta';
import { HistoryList } from '../../../components/HistoryList';
import { Button, Choice, DateField, Field, Muted, Notice, Screen, Section } from '../../../components/ui';

/** Money that is not a daily expense: cows bought/sold, equipment, owner money in/out. */
export default function CapitalForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const nav = useNavigation();
  const params = useLocalSearchParams<{ id?: string; animalId?: string; type?: CapitalType }>();
  const { me, can } = useSession();
  const d = useFinanceData();
  const rec = params.id ? d?.capital.find((c) => c.id === params.id) : undefined;
  const [type, setType] = useState<CapitalType>(params.type ?? 'EQUIPMENT');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<string | null>(today());
  const [desc, setDesc] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [animalId, setAnimalId] = useState(params.animalId ?? 'none');
  const [photo, setPhoto] = useState<PhotoState>({ newPhoto: null, remove: false });
  const [filled, setFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => nav.setOptions({ title: params.id ? t('editCapital') : t('addCapital') }), [nav, params.id, t]);
  useEffect(() => {
    if (!rec || filled) return;
    const c = rec.data;
    setType(c.type);
    setAmount(String(c.amountPaisa / 100));
    setDate(c.date);
    setDesc(c.description ?? '');
    setMethod(c.method);
    setAnimalId(c.animalId ?? 'none');
    setFilled(true);
  }, [rec, filled]);

  if (!can('finance', params.id ? 'view' : 'add')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!d) return <Screen>{null}</Screen>;
  const editable = !params.id || can('finance', 'edit');
  const aboutAnimal = type === 'ANIMAL_PURCHASE' || type === 'ANIMAL_SALE';

  const save = async () => {
    const p = parseRupees(amount);
    if (p === null || p === 'invalid' || p <= 0) return setError(t('invalidAmount'));
    const values = { date: date!, type, amountPaisa: p, description: desc.trim() || null, method, animalId: aboutAnimal && animalId !== 'none' ? animalId : null };
    let id = params.id;
    if (id) await local().repo.update('CapitalEntry', me!.id, id, { ...values, ...(photo.remove ? { receiptPhotoId: null } : {}) });
    else {
      id = newId();
      await local().repo.create('CapitalEntry', me!.id, id, { ...values, receiptPhotoId: null });
    }
    if (photo.newPhoto) await attachPhoto(me!.id, 'CapitalEntry', id, 'receiptPhotoId', photo.newPhoto);
    router.back();
  };
  const remove = () =>
    Alert.alert(t('delete'), t('deleteEntryQ'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => { await local().repo.remove('CapitalEntry', me!.id, params.id!); router.back(); } },
    ]);

  return (
    <Screen>
      <Choice label={t('type')} value={type} onChange={(v) => editable && setType(v)} options={CAPITAL_TYPES.map((c) => ({ value: c, label: t(`ct_${c}`) }))} />
      <Field label={t('amount')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={editable} />
      <DateField label={t('date')} value={date} onChange={(x) => editable && setDate(x)} />
      <Field label={`${t('description')} (${t('optional')})`} value={desc} onChangeText={setDesc} editable={editable} />
      <Choice label={t('method')} value={method} onChange={(m) => editable && setMethod(m)} options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`pm_${m}`) }))} />
      {aboutAnimal ? <Choice label={t('animal')} value={animalId} onChange={(v) => editable && setAnimalId(v)} options={[{ value: 'none', label: t('none') }, ...d.animals.map((a) => ({ value: a.animal.id, label: `#${a.animal.tag}` }))]} /> : null}
      {editable ? <PhotoPicker label={t('receipt')} savedId={rec?.data.receiptPhotoId ?? null} state={photo} onChange={setPhoto} /> : null}
      <Muted>{t('capitalNote')}</Muted>
      {error ? <Notice tone="bad" text={error} /> : null}
      {editable ? <Button title={t('save')} onPress={save} /> : null}
      {rec ? (
        <>
          <RecordMeta data={rec.data as any} syncState={rec.syncState} />
          {can('finance', 'delete') ? <Button title={t('delete')} variant="danger" onPress={remove} /> : null}
          <Section>{t('history')}</Section>
          <HistoryList entity="CapitalEntry" id={rec.id} />
        </>
      ) : null}
    </Screen>
  );
}
