import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../lib/session';
import { useFeedData } from '../../../lib/use-feed';
import { local, newId } from '../../../lib/db';
import { isActive } from '../../../domain/animals';
import { kg, parseKg, saveMonthlyFeeding, stockByItem } from '../../../domain/feed';
import { today } from '../../../lib/format';
import { monthName, monthRange, shiftMonth } from '../../../lib/months';
import { Body, Button, Card, InfoLine, Muted, Notice, Row, Screen, Section, s as ui } from '../../../components/ui';
import { colors } from '../../../lib/theme';

/**
 * Month end: how much of each feed was used this month. Profit counts this feed
 * (at the average price it was bought for). "Used all" fills in everything in the store.
 */
export default function MonthlyFeeding() {
  const { t } = useTranslation();
  const router = useRouter();
  const { me, can } = useSession();
  const data = useFeedData();
  const [month, setMonth] = useState(today().slice(0, 7));
  const [values, setValues] = useState<Record<string, string>>({});
  const [loadedFor, setLoadedFor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const monthly = (data?.consumptions ?? []).filter((c) => c.data.period === 'MONTH' && c.data.date.slice(0, 7) === month);
  useEffect(() => {
    if (!data || loadedFor === month) return;
    setValues(Object.fromEntries(monthly.map((c) => [c.data.feedItemId, kg(c.data.quantityGrams).replace(/,/g, '')])));
    setLoadedFor(month);
  }, [data, month, monthly, loadedFor]);

  if (!can('feed', 'add')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!data) return <Screen>{null}</Screen>;
  const items = data.items.filter((i) => i.data.active);
  if (items.length === 0) {
    return (
      <Screen>
        <Card>
          <Body style={{ fontSize: 18, fontWeight: '700' }}>🌾 {t('noFeedTypesHelp')}</Body>
          <Button title={t('addFeedType')} onPress={() => router.replace('/feed/item')} />
        </Card>
      </Screen>
    );
  }

  const { from, to } = monthRange(month);
  const P = data.purchases.map((p) => p.data);
  // Stock without this month's monthly totals = what was available to use.
  const otherUse = data.consumptions.map((c) => c.data).filter((c) => !(c.period === 'MONTH' && c.date.slice(0, 7) === month));
  const available = stockByItem(P, otherUse, data.adjustments.map((a) => a.data), to);
  const animalIds = data.animals.filter((a) => isActive(a.status)).map((a) => a.animal.id);

  const save = async () => {
    setError(null);
    if (!animalIds.length) return setError(t('addAnimalFirst'));
    const entries: { feedItemId: string; grams: number | null }[] = [];
    for (const i of items) {
      const g = parseKg(values[i.id] ?? '');
      if (g === 'invalid') return setError(`${i.data.name}: ${t('invalidKg')}`);
      entries.push({ feedItemId: i.id, grams: g });
    }
    setSaving(true);
    await saveMonthlyFeeding(local().repo, me!.id, newId, month, today(), entries, data.consumptions, animalIds);
    router.back();
  };

  return (
    <Screen footer={<Button title={t('save')} onPress={save} busy={saving} />}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Button title={t('prevMonth')} variant="ghost" onPress={() => setMonth(shiftMonth(month, -1))} />
        <Section>{monthName(month)}</Section>
        <Button title={t('nextMonth')} variant="ghost" onPress={() => setMonth(shiftMonth(month, 1))} disabled={month >= today().slice(0, 7)} />
      </Row>
      <Muted>{t('monthlyFeedingHelp')}</Muted>
      {items.map((i) => {
        const bought = P.filter((p) => !p.deletedAt && p.feedItemId === i.id && p.date >= from && p.date <= to).reduce((s, p) => s + p.quantityGrams, 0);
        const inStore = Math.max(0, available.get(i.id) ?? 0);
        return (
          <View key={i.id} style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 }}>
            <Body style={{ fontWeight: '800', fontSize: 18 }}>{i.data.name}</Body>
            <InfoLine label={t('boughtThisMonth')} value={`${kg(bought)} ${t('kgUnit')}`} />
            <InfoLine label={t('inStore')} value={`${kg(inStore)} ${t('kgUnit')}`} />
            <Row>
              <Body style={{ flex: 1 }}>{t('kgUsed')}</Body>
              <TextInput
                value={values[i.id] ?? ''}
                onChangeText={(v) => setValues((p) => ({ ...p, [i.id]: v }))}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={colors.muted}
                style={[ui.input, { width: 120, fontSize: 20, textAlign: 'center', fontWeight: '700' }]}
                accessibilityLabel={`${i.data.name} ${t('kgUsed')}`}
              />
            </Row>
            {inStore > 0 ? <Button title={`${t('useAll')} (${kg(inStore)} ${t('kgUnit')})`} variant="secondary" onPress={() => setValues((p) => ({ ...p, [i.id]: kg(inStore).replace(/,/g, '') }))} /> : null}
          </View>
        );
      })}
      {error ? <Notice tone="bad" text={error} /> : null}
    </Screen>
  );
}
