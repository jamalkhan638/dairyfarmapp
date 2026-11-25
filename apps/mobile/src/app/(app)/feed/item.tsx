import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FEED_CATEGORIES, type FeedCategory } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useFeedData } from '../../../lib/use-feed';
import { local, newId } from '../../../lib/db';
import { kg, parseKg } from '../../../domain/feed';
import { RecordMeta } from '../../../components/RecordMeta';
import { HistoryList } from '../../../components/HistoryList';
import { Button, Choice, Field, Notice, Screen, Section, Toggle } from '../../../components/ui';

/** Add or edit a feed item (wanda, green fodder, silage, minerals…) and its bag weight. */
export default function FeedItemForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const nav = useNavigation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { me, can } = useSession();
  const data = useFeedData();
  const rec = id ? data?.items.find((i) => i.id === id) : undefined;
  const [name, setName] = useState('');
  const [category, setCategory] = useState<FeedCategory>('CONCENTRATE');
  const [bag, setBag] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);
  const [filled, setFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => nav.setOptions({ title: id ? t('editFeedItem') : t('addFeedItem') }), [nav, id, t]);
  useEffect(() => {
    if (!rec || filled) return;
    setName(rec.data.name);
    setCategory(rec.data.category);
    setBag(rec.data.bagWeightGrams ? kg(rec.data.bagWeightGrams).replace(/,/g, '') : '');
    setNotes(rec.data.notes ?? '');
    setActive(rec.data.active);
    setFilled(true);
  }, [rec, filled]);

  if (!can('feed', id ? 'edit' : 'add')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  const used = !!id && !!data && (data.purchases.some((p) => p.data.feedItemId === id) || data.consumptions.some((c) => c.data.feedItemId === id) || data.adjustments.some((a) => a.data.feedItemId === id));

  const save = async () => {
    setError(null);
    const n = name.trim();
    if (!n) return setError(t('required'));
    if (data?.items.some((i) => i.id !== id && i.data.name.trim().toLowerCase() === n.toLowerCase())) return setError(t('itemNameTaken'));
    const g = parseKg(bag);
    if (g === 'invalid' || g === 0) return setError(t('invalidKg'));
    const values = { name: n, category, bagWeightGrams: g, notes: notes.trim() || null, active };
    if (id) await local().repo.update('FeedItem', me!.id, id, values);
    else await local().repo.create('FeedItem', me!.id, newId(), values);
    router.back();
  };
  const remove = () =>
    Alert.alert(t('delete'), t('deleteEntryQ'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => { await local().repo.remove('FeedItem', me!.id, id!); router.back(); } },
    ]);

  return (
    <Screen>
      <Field label={t('name')} value={name} onChangeText={setName} />
      <Choice label={t('category')} value={category} onChange={setCategory} options={FEED_CATEGORIES.map((c) => ({ value: c, label: t(`fc_${c}`) }))} />
      <Field label={`${t('bagWeight')} (${t('optional')})`} value={bag} onChangeText={setBag} keyboardType="decimal-pad" hint={t('bagWeightHint')} />
      <Field label={`${t('notes')} (${t('optional')})`} value={notes} onChangeText={setNotes} multiline />
      {id ? <Toggle label={t('active')} value={active} onChange={setActive} /> : null}
      {error ? <Notice tone="bad" text={error} /> : null}
      <Button title={t('save')} onPress={save} />
      {rec ? (
        <>
          <RecordMeta data={rec.data as any} syncState={rec.syncState} />
          {can('feed', 'delete') ? (used ? <Notice text={t('inUseUseInactive')} /> : <Button title={t('delete')} variant="danger" onPress={remove} />) : null}
          <Section>{t('history')}</Section>
          <HistoryList entity="FeedItem" id={rec.id} />
        </>
      ) : null}
    </Screen>
  );
}
