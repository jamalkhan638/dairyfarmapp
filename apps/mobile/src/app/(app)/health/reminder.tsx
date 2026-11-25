import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../lib/session';
import { useHealthData } from '../../../lib/use-health';
import { local, newId } from '../../../lib/db';
import { isActive } from '../../../domain/animals';
import { today } from '../../../lib/format';
import { RecordMeta } from '../../../components/RecordMeta';
import { Button, Choice, DateField, Field, Notice, Screen, Toggle } from '../../../components/ui';

/** A reminder you add yourself (e.g. "Call vet about #3", "Buy minerals"). */
export default function ReminderForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const nav = useNavigation();
  const params = useLocalSearchParams<{ id?: string; animalId?: string }>();
  const { me, can } = useSession();
  const d = useHealthData();
  const rec = params.id ? d?.reminders.find((r) => r.id === params.id) : undefined;
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<string | null>(today());
  const [animalId, setAnimalId] = useState(params.animalId ?? 'none');
  const [done, setDone] = useState(false);
  const [notes, setNotes] = useState('');
  const [filled, setFilled] = useState(false);
  useEffect(() => nav.setOptions({ title: params.id ? t('editReminder') : t('addReminder') }), [nav, params.id, t]);
  useEffect(() => {
    if (!rec || filled) return;
    setTitle(rec.data.title); setDue(rec.data.dueDate); setAnimalId(rec.data.animalId ?? 'none'); setDone(rec.data.done); setNotes(rec.data.notes ?? '');
    setFilled(true);
  }, [rec, filled]);
  if (!can('health', params.id ? 'edit' : 'add')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!d) return <Screen>{null}</Screen>;
  const save = async () => {
    const values = { title: title.trim(), dueDate: due!, animalId: animalId === 'none' ? null : animalId, done, notes: notes.trim() || null };
    if (params.id) await local().repo.update('Reminder', me!.id, params.id, values);
    else await local().repo.create('Reminder', me!.id, newId(), { ...values, sourceKey: null });
    router.back();
  };
  const remove = () =>
    Alert.alert(t('delete'), t('deleteEntryQ'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => { await local().repo.remove('Reminder', me!.id, params.id!); router.back(); } },
    ]);
  return (
    <Screen>
      <Field label={t('reminderTitle')} value={title} onChangeText={setTitle} />
      <DateField label={t('dueDate')} value={due} onChange={setDue} />
      <Choice label={`${t('animal')} (${t('optional')})`} value={animalId} onChange={setAnimalId} options={[{ value: 'none', label: t('none') }, ...d.animals.filter((a) => isActive(a.status)).map((a) => ({ value: a.animal.id, label: `#${a.animal.tag}` }))]} />
      <Field label={`${t('notes')} (${t('optional')})`} value={notes} onChangeText={setNotes} multiline />
      {params.id ? <Toggle label={t('markDone')} value={done} onChange={setDone} /> : null}
      <Button title={t('save')} onPress={save} disabled={!title.trim() || !due} />
      {rec ? (
        <>
          <RecordMeta data={rec.data as any} syncState={rec.syncState} />
          {can('health', 'delete') ? <Button title={t('delete')} variant="danger" onPress={remove} /> : null}
        </>
      ) : null}
    </Screen>
  );
}
