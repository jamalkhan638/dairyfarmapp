import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { HEALTH_TYPES, type HealthType } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useHealthData } from '../../../lib/use-health';
import { local, newId } from '../../../lib/db';
import { isActive } from '../../../domain/animals';
import { addHealthEvent } from '../../../domain/health-actions';
import { parseRupees } from '../../../domain/sales';
import { today } from '../../../lib/format';
import { RecordMeta } from '../../../components/RecordMeta';
import { HistoryList } from '../../../components/HistoryList';
import { Button, Choice, DateField, Field, Muted, Notice, Screen, Section } from '../../../components/ui';

/** Illness, treatment, vaccination, deworming: with withdrawal end and next due date. */
export default function HealthEventForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const nav = useNavigation();
  const params = useLocalSearchParams<{ id?: string; animalId?: string }>();
  const { me, can } = useSession();
  const d = useHealthData();
  const rec = params.id ? d?.health.find((h) => h.id === params.id) : undefined;
  const [animalId, setAnimalId] = useState<string | null>(params.animalId ?? null);
  const [type, setType] = useState<HealthType>('TREATMENT');
  const [date, setDate] = useState<string | null>(today());
  const [title, setTitle] = useState('');
  const [medicine, setMedicine] = useState('');
  const [dose, setDose] = useState('');
  const [vet, setVet] = useState('');
  const [wd, setWd] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [cost, setCost] = useState('');
  const [costCat, setCostCat] = useState<'VET' | 'MEDICINE'>('VET');
  const [filled, setFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => nav.setOptions({ title: params.id ? t('editHealth') : t('addHealth') }), [nav, params.id, t]);
  useEffect(() => {
    if (!rec || filled) return;
    const h = rec.data;
    setAnimalId(h.animalId); setType(h.type); setDate(h.date); setTitle(h.title); setMedicine(h.medicine ?? ''); setDose(h.dose ?? '');
    setVet(h.vetName ?? ''); setWd(h.withdrawalEndDate); setNext(h.nextDueDate); setNotes(h.notes ?? '');
    setFilled(true);
  }, [rec, filled]);

  if (!can('health', params.id ? 'view' : 'add')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!d) return <Screen>{null}</Screen>;
  const editable = !params.id || can('health', 'edit');

  const save = async () => {
    setError(null);
    if (!animalId) return setError(t('chooseAnimals'));
    if (!title.trim()) return setError(t('required'));
    if (wd && date && wd < date) return setError(t('withdrawalHint'));
    const c = parseRupees(cost);
    if (c === 'invalid') return setError(t('invalidAmount'));
    const form = { animalId, date: date!, type, title: title.trim(), medicine: medicine.trim() || null, dose: dose.trim() || null, vetName: vet.trim() || null, withdrawalEndDate: wd, nextDueDate: next, notes: notes.trim() || null };
    if (params.id) {
      const { animalId: _a, ...changes } = form;
      await local().repo.update('HealthEvent', me!.id, params.id, changes);
    } else {
      await addHealthEvent(local().repo, me!.id, newId, form, c && can('expenses', 'add') ? { amountPaisa: c, category: costCat } : null);
    }
    router.back();
  };
  const remove = () =>
    Alert.alert(t('delete'), t('deleteEntryQ'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => { await local().repo.remove('HealthEvent', me!.id, params.id!); router.back(); } },
    ]);

  return (
    <Screen>
      <Choice label={t('animal')} value={animalId} onChange={(v) => !params.id && setAnimalId(v)} options={d.animals.filter((a) => isActive(a.status) || a.animal.id === animalId).map((a) => ({ value: a.animal.id, label: `#${a.animal.tag}` }))} />
      <Choice label={t('type')} value={type} onChange={(v) => editable && setType(v)} options={HEALTH_TYPES.map((x) => ({ value: x, label: t(`ht_${x}`) }))} />
      <DateField label={t('date')} value={date} onChange={(x) => editable && setDate(x)} />
      <Field label={t('healthTitle')} value={title} onChangeText={setTitle} editable={editable} />
      <Field label={`${t('medicine')} (${t('optional')})`} value={medicine} onChangeText={setMedicine} editable={editable} />
      <Field label={`${t('dose')} (${t('optional')})`} value={dose} onChangeText={setDose} editable={editable} />
      <Field label={`${t('vetName')} (${t('optional')})`} value={vet} onChangeText={setVet} editable={editable} />
      <DateField label={`${t('withdrawalEnd')} (${t('optional')})`} value={wd} onChange={(x) => editable && setWd(x)} allowEmpty />
      <Muted>{t('withdrawalHint')}</Muted>
      <DateField label={`${t('nextDue')} (${t('optional')})`} value={next} onChange={(x) => editable && setNext(x)} allowEmpty />
      <Field label={`${t('notes')} (${t('optional')})`} value={notes} onChangeText={setNotes} editable={editable} multiline />
      {!params.id && can('expenses', 'add') ? (
        <>
          <Field label={t('costOptional')} value={cost} onChangeText={setCost} keyboardType="decimal-pad" />
          {cost ? <Choice label={t('costCategory')} value={costCat} onChange={setCostCat} options={[{ value: 'VET', label: t('ec_VET') }, { value: 'MEDICINE', label: t('ec_MEDICINE') }]} /> : null}
        </>
      ) : null}
      {rec?.data.expenseId ? <Button title={t('expense')} variant="ghost" onPress={() => router.push({ pathname: '/money/expense', params: { id: rec.data.expenseId! } })} /> : null}
      {error ? <Notice tone="bad" text={error} /> : null}
      {editable ? <Button title={t('save')} onPress={save} /> : null}
      {rec ? (
        <>
          <RecordMeta data={rec.data as any} syncState={rec.syncState} />
          {can('health', 'delete') ? <Button title={t('delete')} variant="danger" onPress={remove} /> : null}
          <Section>{t('history')}</Section>
          <HistoryList entity="HealthEvent" id={rec.id} />
        </>
      ) : null}
    </Screen>
  );
}
