import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MILK_USAGE_TYPES, type MilkUsageType } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { local, newId } from '../../../lib/db';
import { useLocalQuery } from '../../../lib/hooks';
import { isActive, loadAnimals } from '../../../domain/animals';
import { litres, parseLitres, type MilkUsage } from '../../../domain/milk';
import { today } from '../../../lib/format';
import { RecordMeta } from '../../../components/RecordMeta';
import { Button, Choice, DateField, Field, Notice, Screen, Section } from '../../../components/ui';
import { HistoryList } from '../../../components/HistoryList';

/** Add or edit milk that was fed to calves, used at home or discarded. */
export default function MilkUsageScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const nav = useNavigation();
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const { me, can } = useSession();
  const { data } = useLocalQuery(async () => ({
    animals: await loadAnimals(local().repo),
    rec: params.id ? await local().repo.get<MilkUsage>('MilkUsage', params.id) : null,
  }), [params.id]);
  const [date, setDate] = useState<string | null>(params.date ?? today());
  const [type, setType] = useState<MilkUsageType>('CALF_FED');
  const [qty, setQty] = useState('');
  const [animalId, setAnimalId] = useState<string>('none');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [filled, setFilled] = useState(false);

  useEffect(() => nav.setOptions({ title: params.id ? t('edit') : t('addUsage') }), [nav, params.id, t]);
  useEffect(() => {
    if (filled || !data?.rec) return;
    const u = data.rec.data;
    setDate(u.date);
    setType(u.type);
    setQty(litres(u.quantityMl).replace(/,/g, ''));
    setAnimalId(u.animalId ?? 'none');
    setNote(u.note ?? '');
    setFilled(true);
  }, [data, filled]);

  if (!can('milk', params.id ? 'edit' : 'add')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  const animals = (data?.animals ?? []).filter((a) => isActive(a.status) || a.animal.id === animalId);

  const save = async () => {
    const ml = parseLitres(qty);
    if (ml === null || ml === 'invalid' || ml <= 0) return setError(t('invalidLitres'));
    const values = { date: date!, type, quantityMl: ml, animalId: animalId === 'none' ? null : animalId, note: note.trim() || null };
    if (params.id) await local().repo.update('MilkUsage', me!.id, params.id, values);
    else await local().repo.create('MilkUsage', me!.id, newId(), values);
    router.back();
  };
  const remove = () =>
    Alert.alert(t('delete'), t('deleteEntryQ'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => { await local().repo.remove('MilkUsage', me!.id, params.id!); router.back(); } },
    ]);

  return (
    <Screen>
      <DateField label={t('date')} value={date} onChange={setDate} />
      <Choice label={t('type')} value={type} options={MILK_USAGE_TYPES.map((u) => ({ value: u, label: t(`u_${u}`) }))} onChange={setType} />
      <Field label={t('quantity')} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
      <Choice
        label={t('whichAnimal')}
        value={animalId}
        options={[{ value: 'none', label: t('none') }, ...animals.map((a) => ({ value: a.animal.id, label: `#${a.animal.tag}` }))]}
        onChange={setAnimalId}
      />
      <Field label={`${t('notes')} (${t('optional')})`} value={note} onChangeText={setNote} multiline />
      {error ? <Notice tone="bad" text={error} /> : null}
      <Button title={t('save')} onPress={save} disabled={!date || !qty} />
      {data?.rec ? (
        <>
          <RecordMeta data={data.rec.data} syncState={data.rec.syncState} />
          {can('milk', 'delete') ? <Button title={t('delete')} variant="danger" onPress={remove} /> : null}
          <Section>{t('history')}</Section>
          <HistoryList entity="MilkUsage" id={data.rec.id} />
        </>
      ) : null}
    </Screen>
  );
}
