import React, { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../lib/session';
import { useFeedData } from '../../../lib/use-feed';
import { local, newId } from '../../../lib/db';
import { consumptionCost, kg, parseKg } from '../../../domain/feed';
import { isActive } from '../../../domain/animals';
import { milkingOn } from '../../../domain/milk';
import { formatPKR, today } from '../../../lib/format';
import { RecordMeta } from '../../../components/RecordMeta';
import { HistoryList } from '../../../components/HistoryList';
import { Badge, Button, Card, Choice, DateField, Field, InfoLine, Muted, Notice, Screen, Section, s as ui } from '../../../components/ui';

type Target = 'one' | 'milking' | 'all' | 'pick';

/** Feed given on a day, to one animal or shared by a group, and how much was wasted. */
export default function FeedingForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const nav = useNavigation();
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const { me, can } = useSession();
  const data = useFeedData();
  const rec = params.id ? data?.consumptions.find((c) => c.id === params.id) : undefined;
  const [itemId, setItemId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(params.date ?? today());
  const [target, setTarget] = useState<Target>('milking');
  const [one, setOne] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [fed, setFed] = useState('');
  const [wasted, setWasted] = useState('');
  const [note, setNote] = useState('');
  const [filled, setFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => nav.setOptions({ title: params.id ? t('editFeeding') : t('recordFeeding') }), [nav, params.id, t]);
  useEffect(() => {
    if (!rec || filled) return;
    const c = rec.data;
    setItemId(c.feedItemId);
    setDate(c.date);
    setFed(kg(c.quantityGrams).replace(/,/g, ''));
    setWasted(c.wastedGrams ? kg(c.wastedGrams).replace(/,/g, '') : '');
    setNote(c.note ?? '');
    setFilled(true);
  }, [rec, filled]);

  if (!can('feed', params.id ? 'view' : 'add')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!data) return <Screen>{null}</Screen>;
  const onFarm = data.animals.filter((a) => isActive(a.status));
  const editable = !params.id || can('feed', 'edit');

  const animalIds = rec
    ? rec.data.animalIds
    : target === 'one' ? (one ? [one] : [])
    : target === 'milking' ? milkingOn(data.animals, date ?? today()).map((a) => a.animal.id)
    : target === 'all' ? onFarm.map((a) => a.animal.id)
    : picked;

  const g = parseKg(fed);
  const w = parseKg(wasted);
  const preview = itemId && typeof g !== 'string' && typeof w !== 'string'
    ? consumptionCost({ id: '', feedItemId: itemId, date: date ?? today(), quantityGrams: g ?? 0, wastedGrams: w ?? 0, animalIds, note: null, createdById: '', deletedAt: null }, data.purchases.map((p) => p.data))
    : null;

  const save = async () => {
    setError(null);
    if (!itemId) return setError(t('chooseItem'));
    if (g === 'invalid' || w === 'invalid' || ((g ?? 0) + (w ?? 0)) <= 0) return setError(t('invalidKg'));
    if (!animalIds.length) return setError(t('chooseAnimals'));
    if (params.id) {
      await local().repo.update('FeedConsumption', me!.id, params.id, { date: date!, quantityGrams: g ?? 0, wastedGrams: w ?? 0, note: note.trim() || null });
    } else {
      await local().repo.create('FeedConsumption', me!.id, newId(), { feedItemId: itemId, date: date!, quantityGrams: g ?? 0, wastedGrams: w ?? 0, animalIds, note: note.trim() || null });
    }
    router.back();
  };
  const remove = () =>
    Alert.alert(t('delete'), t('deleteEntryQ'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => { await local().repo.remove('FeedConsumption', me!.id, params.id!); router.back(); } },
    ]);
  const tagOf = (id: string) => data.animals.find((a) => a.animal.id === id)?.animal.tag ?? '?';

  return (
    <Screen>
      <Choice label={t('feedItem')} value={itemId} onChange={(v) => !params.id && setItemId(v)} options={data.items.filter((i) => i.data.active || i.id === itemId).map((i) => ({ value: i.id, label: i.data.name }))} />
      {data.items.length === 0 ? <Button title={t('addFeedItem')} variant="ghost" onPress={() => router.push('/feed/item')} /> : null}
      <DateField label={t('date')} value={date} onChange={(d) => editable && setDate(d)} />
      {!params.id ? (
        <>
          <Choice label={t('fedTo')} value={target} onChange={setTarget} options={(['milking', 'all', 'one', 'pick'] as Target[]).map((x) => ({ value: x, label: t(`ft_${x}`) }))} />
          {target === 'one' ? <Choice value={one} onChange={setOne} options={onFarm.map((a) => ({ value: a.animal.id, label: `#${a.animal.tag}` }))} /> : null}
          {target === 'pick' ? (
            <View style={ui.chips}>
              {onFarm.map((a) => {
                const on = picked.includes(a.animal.id);
                return (
                  <Pressable key={a.animal.id} onPress={() => setPicked((p) => (on ? p.filter((x) => x !== a.animal.id) : [...p, a.animal.id]))} style={[ui.chip, on && ui.chipOn]}>
                    <Text style={[ui.chipText, on && ui.chipTextOn]}>#{a.animal.tag}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </>
      ) : null}
      <Muted>{animalIds.length === 1 ? `#${tagOf(animalIds[0])}` : t('animalsCount', { count: animalIds.length })}{animalIds.length > 1 && animalIds.length <= 12 ? `: ${animalIds.map((i) => `#${tagOf(i)}`).join(', ')}` : ''}</Muted>
      <Field label={t('kgFed')} value={fed} onChangeText={setFed} keyboardType="decimal-pad" editable={editable} />
      <Field label={`${t('kgWasted')} (${t('optional')})`} value={wasted} onChangeText={setWasted} keyboardType="decimal-pad" editable={editable} />
      <Card>
        <InfoLine label={t('costEstimate')} value={preview === null ? '—' : formatPKR(preview)} />
        {animalIds.length > 1 && preview !== null ? <InfoLine label={t('perAnimal')} value={formatPKR(Math.round(preview / animalIds.length))} /> : null}
        {animalIds.length > 1 ? <Badge text={t('estimateLabel')} tone="warn" /> : null}
        {animalIds.length > 1 ? <Muted>{t('sharedEstimate')}</Muted> : null}
      </Card>
      <Field label={`${t('notes')} (${t('optional')})`} value={note} onChangeText={setNote} multiline editable={editable} />
      {error ? <Notice tone="bad" text={error} /> : null}
      {editable ? <Button title={t('save')} onPress={save} /> : null}
      {rec ? (
        <>
          <RecordMeta data={rec.data as any} syncState={rec.syncState} />
          {can('feed', 'delete') ? <Button title={t('delete')} variant="danger" onPress={remove} /> : null}
          <Section>{t('history')}</Section>
          <HistoryList entity="FeedConsumption" id={rec.id} />
        </>
      ) : null}
    </Screen>
  );
}
