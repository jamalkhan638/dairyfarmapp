import React, { useEffect, useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { MilkSession, MilkUsageType } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useMilkData } from '../../../lib/use-milk';
import { withdrawalUntil } from '../../../domain/health';
import { local, newId } from '../../../lib/db';
import { isActive } from '../../../domain/animals';
import { litres, milkingOn, parseLitres, saveMilkSession, saveSessionUsage, statusOn } from '../../../domain/milk';
import { formatDate, today } from '../../../lib/format';
import { AnimalPhoto } from '../../../components/AnimalPhoto';
import { Badge, Body, Button, Card, Choice, DateField, InfoLine, Muted, Notice, Row, Screen, Section, Toggle, s as ui } from '../../../components/ui';
import { colors } from '../../../lib/theme';

const USAGE_TYPES: MilkUsageType[] = ['CALF_FED', 'HOME', 'DISCARDED'];

/** Litres box used for cows and for "milk not sold". */
function LitresBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType="decimal-pad"
      placeholder="—"
      placeholderTextColor={colors.muted}
      style={[ui.input, { width: 110, fontSize: 22, textAlign: 'center', fontWeight: '700' }]}
      accessibilityLabel={label}
    />
  );
}

/**
 * Record one milking for all cows on one screen, plus (optionally) how much of it went to
 * calves, home use or was thrown away. Sold milk is recorded per customer (each has a rate).
 */
export default function MilkEntry() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; session?: MilkSession }>();
  const { me, can } = useSession();
  const data = useMilkData();
  const [date, setDate] = useState<string>(params.date ?? today());
  const [session, setSession] = useState<MilkSession>(params.session ?? (Number(new Date().getUTCHours()) + 5 >= 14 ? 'EVENING' : 'MORNING'));
  const [values, setValues] = useState<Record<string, string>>({});
  const [usage, setUsage] = useState<Record<string, string>>({});
  const [loadedFor, setLoadedFor] = useState('');
  const [showOthers, setShowOthers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const existing = useMemo(() => (data?.records ?? []).filter((r) => r.data.date === date && r.data.session === session), [data, date, session]);
  const existingUsage = useMemo(() => (data?.usages ?? []).filter((u) => u.data.date === date && u.data.session === session && !u.data.animalId), [data, date, session]);

  // Fill in what was already saved for this date and milking.
  useEffect(() => {
    const key = `${date}:${session}`;
    if (!data || loadedFor === key) return;
    setValues(Object.fromEntries(existing.map((r) => [r.data.animalId, litres(r.data.quantityMl).replace(/,/g, '')])));
    setUsage(Object.fromEntries(existingUsage.map((u) => [u.data.type, litres(u.data.quantityMl).replace(/,/g, '')])));
    setLoadedFor(key);
  }, [data, existing, existingUsage, date, session, loadedFor]);

  if (!can('milk', 'add')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!data) return <Screen>{null}</Screen>;

  // No animals at all: say so, and offer to add one (no Save button).
  if (data.animals.length === 0) {
    return (
      <Screen>
        <Card>
          <Body style={{ fontSize: 20, fontWeight: '700' }}>🐄 {t('addAnimalFirst')}</Body>
          {can('animals', 'add') ? <Button title={t('addAnimal')} onPress={() => router.push('/animals/new')} /> : null}
        </Card>
      </Screen>
    );
  }

  const milking = milkingOn(data.animals, date);
  const withEntry = new Set(existing.map((r) => r.data.animalId));
  const others = data.animals.filter((a) => a.animal.sex === 'FEMALE' && isActive(a.status) && !milking.includes(a));
  const shown = [...milking, ...others.filter((a) => withEntry.has(a.animal.id) || showOthers)];
  const soldMl = (data.soldByDate ? data.deliveriesForSession?.(date, session) : 0) ?? 0;

  const save = async () => {
    setError(null);
    const changes: { animalId: string; ml: number | null }[] = [];
    for (const a of shown) {
      const parsed = parseLitres(values[a.animal.id] ?? '');
      if (parsed === 'invalid' || (typeof parsed === 'number' && parsed > 60_000)) return setError(`#${a.animal.tag}: ${t('invalidLitres')}`);
      const had = withEntry.has(a.animal.id);
      if (parsed === null && had && !can('milk', 'delete')) return setError(t('cannotDeleteEntries'));
      if (parsed !== null || had) changes.push({ animalId: a.animal.id, ml: parsed });
    }
    const amounts: Partial<Record<MilkUsageType, number | null>> = {};
    for (const type of USAGE_TYPES) {
      const p = parseLitres(usage[type] ?? '');
      if (p === 'invalid') return setError(`${t(`u_${type}`)}: ${t('invalidLitres')}`);
      const had = existingUsage.some((u) => u.data.type === type);
      if (p !== null || had) amounts[type] = p;
    }
    setSaving(true);
    try {
      await saveMilkSession(local().repo, me!.id, newId, date, session, changes, existing);
      await saveSessionUsage(local().repo, me!.id, newId, date, session, amounts, existingUsage);
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
    <Screen footer={shown.length ? <Button title={`${t('save')} · ${t('total')} ${litres(total)} ${t('L')}`} onPress={save} busy={saving} /> : undefined}>
      <Choice label={t('whichMilking')} value={session} onChange={setSession} options={[{ value: 'MORNING', label: `☀️ ${t('morning')}` }, { value: 'EVENING', label: `🌙 ${t('evening')}` }]} />
      <DateField label={t('date')} value={date} onChange={(d) => d && setDate(d)} />

      {shown.length === 0 ? (
        <Card>
          <Body style={{ fontWeight: '700' }}>{t('noMilkingCows')}</Body>
          <Muted>{t('noMilkingCowsHelp')}</Muted>
          {others.length ? <Toggle label={t('showOtherAnimals')} value={showOthers} onChange={setShowOthers} /> : null}
          <Button title={t('animals')} variant="secondary" onPress={() => router.push('/animals')} />
        </Card>
      ) : (
        <>
          <Muted>{t('emptyMeansNotRecorded')}</Muted>
          {shown.map((a) => {
            const rec = existing.find((r) => r.data.animalId === a.animal.id);
            const notMilking = statusOn(a, date) !== 'MILKING';
            const wd = withdrawalUntil(data.health, a.animal.id, date);
            return (
              <View key={a.animal.id} style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 }}>
                <Row>
                  <AnimalPhoto photoId={a.animal.photoId} tag={a.animal.tag} size={48} />
                  <View style={{ flex: 1 }}>
                    <Body style={{ fontWeight: '800', fontSize: 19 }}>#{a.animal.tag}{a.animal.name ? ` ${a.animal.name}` : ''}</Body>
                    {notMilking ? <Muted>{t('notMilkingNow')}</Muted> : null}
                    {wd ? <Badge text={t('underWithdrawal', { date: formatDate(wd.until) })} tone="bad" /> : null}
                    {rec && rec.syncState !== 'synced' ? <Badge text={t(rec.syncState === 'pending' ? 'statePending' : 'stateConflict')} tone={rec.syncState === 'pending' ? 'warn' : 'bad'} /> : null}
                  </View>
                  <LitresBox value={values[a.animal.id] ?? ''} onChange={(v) => setValues((p) => ({ ...p, [a.animal.id]: v }))} label={`#${a.animal.tag} ${t('litres')}`} />
                  <Body>{t('L')}</Body>
                </Row>
              </View>
            );
          })}
          {others.length && milking.length ? <Toggle label={t('showOtherAnimals')} value={showOthers} onChange={setShowOthers} /> : null}

          <Section>{t('whereMilkWent')}</Section>
          <Card>
            {USAGE_TYPES.map((type) => (
              <Row key={type} style={{ justifyContent: 'space-between' }}>
                <Body style={{ flex: 1 }}>{t(`u_${type}`)}</Body>
                <LitresBox value={usage[type] ?? ''} onChange={(v) => setUsage((p) => ({ ...p, [type]: v }))} label={t(`u_${type}`)} />
                <Body>{t('L')}</Body>
              </Row>
            ))}
          </Card>

          {can('sales', 'view') ? (
            <Card>
              <InfoLine label={t('soldThisMilking')} value={`${litres(soldMl)} ${t('L')}`} />
              {can('sales', 'add') ? (
                <Button title={t('recordSales')} variant="secondary" onPress={() => router.push({ pathname: '/sales/round', params: { date, session } })} />
              ) : null}
            </Card>
          ) : null}
        </>
      )}
      {error ? <Notice tone="bad" text={error} /> : null}
    </Screen>
  );
}
