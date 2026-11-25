import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BREEDING_TYPES, INSEMINATION_METHODS, PREGNANCY_RESULTS, type BreedingType, type InseminationMethod, type PregnancyResult, type Sex } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useHealthData } from '../../../lib/use-health';
import { local, newId } from '../../../lib/db';
import { isActive } from '../../../domain/animals';
import { recordCalving } from '../../../domain/health-actions';
import { today } from '../../../lib/format';
import { RecordMeta } from '../../../components/RecordMeta';
import { HistoryList } from '../../../components/HistoryList';
import { Button, Choice, DateField, Field, Notice, Screen, Section, Toggle } from '../../../components/ui';

/** Heat, insemination, pregnancy check, calving (with the calf), abortion. */
export default function BreedingForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const nav = useNavigation();
  const params = useLocalSearchParams<{ id?: string; animalId?: string; type?: BreedingType }>();
  const { me, can } = useSession();
  const d = useHealthData();
  const rec = params.id ? d?.breeding.find((b) => b.id === params.id) : undefined;
  const [animalId, setAnimalId] = useState<string | null>(params.animalId ?? null);
  const [type, setType] = useState<BreedingType>(params.type ?? 'INSEMINATION');
  const [date, setDate] = useState<string | null>(today());
  const [method, setMethod] = useState<InseminationMethod>('AI');
  const [sire, setSire] = useState('');
  const [tech, setTech] = useState('');
  const [result, setResult] = useState<PregnancyResult | null>(null);
  const [addCalf, setAddCalf] = useState(true);
  const [calfTag, setCalfTag] = useState('');
  const [calfSex, setCalfSex] = useState<Sex>('FEMALE');
  const [milking, setMilking] = useState(true);
  const [notes, setNotes] = useState('');
  const [filled, setFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => nav.setOptions({ title: params.id ? t('editBreeding') : t('addBreeding') }), [nav, params.id, t]);
  useEffect(() => {
    if (!rec || filled) return;
    const b = rec.data;
    setAnimalId(b.animalId); setType(b.type); setDate(b.date); setMethod(b.method ?? 'AI'); setSire(b.sire ?? ''); setTech(b.technician ?? '');
    setResult(b.result); setNotes(b.notes ?? ''); if (b.calfSex) setCalfSex(b.calfSex);
    setFilled(true);
  }, [rec, filled]);

  if (!can('health', params.id ? 'view' : 'add')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!d) return <Screen>{null}</Screen>;
  const editable = !params.id || can('health', 'edit');
  const females = d.animals.filter((a) => a.animal.sex === 'FEMALE' && (isActive(a.status) || a.animal.id === animalId));

  const save = async () => {
    setError(null);
    if (!animalId) return setError(t('chooseAnimals'));
    if (type === 'PREGNANCY_CHECK' && !result) return setError(t('result'));
    const repo = local().repo;
    if (params.id) {
      await repo.update('BreedingEvent', me!.id, params.id, { date: date!, method: type === 'INSEMINATION' ? method : null, sire: type === 'INSEMINATION' ? sire.trim() || null : null, technician: tech.trim() || null, result: type === 'PREGNANCY_CHECK' ? result : null, notes: notes.trim() || null });
    } else if (type === 'CALVING') {
      if (addCalf) {
        if (!calfTag.trim()) return setError(t('tagRequired'));
        if (d.animals.some((a) => a.animal.tag.trim().toLowerCase() === calfTag.trim().toLowerCase())) return setError(t('tagTaken'));
      }
      await recordCalving(repo, me!.id, newId, { motherId: animalId, date: date!, notes: notes.trim() || null, calf: addCalf && can('animals', 'add') ? { tag: calfTag.trim(), sex: calfSex } : null, calfSexOnly: calfSex, motherStartsMilking: milking && can('animals', 'edit') });
    } else {
      await repo.create('BreedingEvent', me!.id, newId(), {
        animalId, date: date!, type, method: type === 'INSEMINATION' ? method : null, sire: type === 'INSEMINATION' ? sire.trim() || null : null,
        technician: tech.trim() || null, result: type === 'PREGNANCY_CHECK' ? result : null, notes: notes.trim() || null,
      });
    }
    router.back();
  };
  const remove = () =>
    Alert.alert(t('delete'), t('deleteEntryQ'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => { await local().repo.remove('BreedingEvent', me!.id, params.id!); router.back(); } },
    ]);

  return (
    <Screen>
      <Choice label={t('animal')} value={animalId} onChange={(v) => !params.id && setAnimalId(v)} options={females.map((a) => ({ value: a.animal.id, label: `#${a.animal.tag}` }))} />
      <Choice label={t('type')} value={type} onChange={(v) => !params.id && setType(v)} options={BREEDING_TYPES.map((x) => ({ value: x, label: t(`bt_${x}`) }))} />
      <DateField label={t('date')} value={date} onChange={(x) => editable && setDate(x)} />
      {type === 'INSEMINATION' ? (
        <>
          <Choice label={t('inseminationMethod')} value={method} onChange={(v) => editable && setMethod(v)} options={INSEMINATION_METHODS.map((m) => ({ value: m, label: t(`im_${m}`) }))} />
          <Field label={`${t('sire')} (${t('optional')})`} value={sire} onChangeText={setSire} editable={editable} />
        </>
      ) : null}
      {type === 'INSEMINATION' || type === 'PREGNANCY_CHECK' ? <Field label={`${t('technician')} (${t('optional')})`} value={tech} onChangeText={setTech} editable={editable} /> : null}
      {type === 'PREGNANCY_CHECK' ? <Choice label={t('result')} value={result} onChange={(v) => editable && setResult(v)} options={PREGNANCY_RESULTS.map((r) => ({ value: r, label: t(`pr_${r}`) }))} /> : null}
      {type === 'CALVING' && !params.id ? (
        <>
          <Choice label={t('calfSex')} value={calfSex} onChange={setCalfSex} options={[{ value: 'FEMALE', label: t('female') }, { value: 'MALE', label: t('male') }]} />
          {can('animals', 'add') ? <Toggle label={t('addCalf')} value={addCalf} onChange={setAddCalf} /> : null}
          {addCalf && can('animals', 'add') ? <Field label={t('calfTag')} value={calfTag} onChangeText={setCalfTag} autoCapitalize="characters" /> : null}
          {can('animals', 'edit') ? <Toggle label={t('motherStartsMilking')} value={milking} onChange={setMilking} /> : null}
        </>
      ) : null}
      {rec?.data.calfId ? <Button title={`${t('calfTag')}: #${d.animals.find((a) => a.animal.id === rec.data.calfId)?.animal.tag ?? ''}`} variant="ghost" onPress={() => router.push(`/animals/${rec.data.calfId}`)} /> : null}
      <Field label={`${t('notes')} (${t('optional')})`} value={notes} onChangeText={setNotes} editable={editable} multiline />
      {error ? <Notice tone="bad" text={error} /> : null}
      {editable ? <Button title={t('save')} onPress={save} /> : null}
      {rec ? (
        <>
          <RecordMeta data={rec.data as any} syncState={rec.syncState} />
          {can('health', 'delete') ? <Button title={t('delete')} variant="danger" onPress={remove} /> : null}
          <Section>{t('history')}</Section>
          <HistoryList entity="BreedingEvent" id={rec.id} />
        </>
      ) : null}
    </Screen>
  );
}
