import React, { useEffect, useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { MilkSession } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useMilkData } from '../../../lib/use-milk';
import { local, newId } from '../../../lib/db';
import { isActive } from '../../../domain/animals';
import { litres, milkingOn, parseLitres, saveMilkSession, statusOn } from '../../../domain/milk';
import { formatDate } from '../../../lib/format';
import { AnimalPhoto } from '../../../components/AnimalPhoto';
import { Badge, Body, Button, Muted, Notice, Row, Screen, Toggle, s as ui } from '../../../components/ui';
import { colors } from '../../../lib/theme';

/** Enter one milking (morning or evening) for all cows on one screen. */
export default function MilkEntry() {
  const { t } = useTranslation();
  const router = useRouter();
  const nav = useNavigation();
  const { date, session } = useLocalSearchParams<{ date: string; session: MilkSession }>();
  const { me, can } = useSession();
  const data = useMilkData();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    nav.setOptions({ title: `${session === 'MORNING' ? t('morning') : t('evening')} · ${formatDate(date)}` });
  }, [nav, session, date, t]);

  const existing = useMemo(() => (data?.records ?? []).filter((r) => r.data.date === date && r.data.session === session), [data, date, session]);

  // Fill in what was already saved, once.
  useEffect(() => {
    if (!data || loaded) return;
    setValues(Object.fromEntries(existing.map((r) => [r.data.animalId, litres(r.data.quantityMl).replace(/,/g, '')])));
    setLoaded(true);
  }, [data, existing, loaded]);

  if (!can('milk', 'add')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!data) return <Screen>{null}</Screen>;

  const milking = milkingOn(data.animals, date);
  const withEntry = new Set(existing.map((r) => r.data.animalId));
  const others = data.animals.filter((a) => a.animal.sex === 'FEMALE' && isActive(a.status) && !milking.includes(a));
  const shown = [...milking, ...others.filter((a) => withEntry.has(a.animal.id) || showOthers)];

  const save = async () => {
    setError(null);
    const changes: { animalId: string; ml: number | null }[] = [];
    for (const a of shown) {
      const parsed = parseLitres(values[a.animal.id] ?? '');
      if (parsed === 'invalid') return setError(`#${a.animal.tag}: ${t('invalidLitres')}`);
      if (parsed !== null && parsed > 60_000) return setError(`#${a.animal.tag}: ${t('invalidLitres')}`);
      const had = withEntry.has(a.animal.id);
      if (parsed === null && had && !can('milk', 'delete')) return setError(t('cannotDeleteEntries'));
      if (parsed !== null || had) changes.push({ animalId: a.animal.id, ml: parsed });
    }
    setSaving(true);
    try {
      await saveMilkSession(local().repo, me!.id, newId, date, session, changes, existing);
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  const total = shown.reduce((sum, a) => {
    const p = parseLitres(values[a.animal.id] ?? '');
    return typeof p === 'number' ? sum + p : sum;
  }, 0);

  return (
    <Screen footer={<Button title={`${t('save')} · ${t('total')} ${litres(total)} ${t('L')}`} onPress={save} busy={saving} />}>
      <Muted>{t('emptyMeansNotRecorded')}</Muted>
      {shown.length === 0 ? <Muted>{t('noMilkingCows')}</Muted> : null}
      {shown.map((a) => {
        const rec = existing.find((r) => r.data.animalId === a.animal.id);
        const notMilking = statusOn(a, date) !== 'MILKING';
        return (
          <View key={a.animal.id} style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 }}>
            <Row>
              <AnimalPhoto photoId={a.animal.photoId} tag={a.animal.tag} size={48} />
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '800', fontSize: 19 }}>#{a.animal.tag}{a.animal.name ? ` ${a.animal.name}` : ''}</Body>
                {notMilking ? <Muted>{t('notMilkingNow')}</Muted> : null}
                {rec && rec.syncState !== 'synced' ? <Badge text={t(rec.syncState === 'pending' ? 'statePending' : 'stateConflict')} tone={rec.syncState === 'pending' ? 'warn' : 'bad'} /> : null}
              </View>
              <TextInput
                value={values[a.animal.id] ?? ''}
                onChangeText={(v) => setValues((p) => ({ ...p, [a.animal.id]: v }))}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={colors.muted}
                style={[ui.input, { width: 110, fontSize: 22, textAlign: 'center', fontWeight: '700' }]}
                accessibilityLabel={`#${a.animal.tag} ${t('litres')}`}
              />
              <Body>{t('L')}</Body>
            </Row>
          </View>
        );
      })}
      {others.length ? <Toggle label={t('showOtherAnimals')} value={showOthers} onChange={setShowOthers} /> : null}
      {error ? <Notice tone="bad" text={error} /> : null}
    </Screen>
  );
}
