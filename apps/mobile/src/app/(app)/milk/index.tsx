import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MILK_USAGE_TYPES } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useMilkData } from '../../../lib/use-milk';
import { withdrawalUntil } from '../../../domain/health';
import { local, newId } from '../../../lib/db';
import { litres, summarizeDay } from '../../../domain/milk';
import { formatDate, today } from '../../../lib/format';
import { Badge, Body, Button, Card, DateField, InfoLine, Muted, Notice, Row, Screen, Section } from '../../../components/ui';
import { colors } from '../../../lib/theme';

/** Milk: one big "Record milk" button, then the day's summary. */
export default function MilkDay() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const { me, can } = useSession();
  const [date, setDate] = useState<string>(params.date ?? today());
  const data = useMilkData();

  if (!can('milk', 'view')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!data) return <Screen>{null}</Screen>;
  const s = summarizeDay(date, data.animals, data.records.map((r) => r.data), data.usages.map((u) => u.data), data.soldByDate?.[date] ?? 0);
  const L = (ml: number) => `${litres(ml)} ${t('L')}`;
  const dayUsages = data.usages.filter((u) => u.data.date === date);
  // Every milk entry of the day, morning first, then by cow tag.
  const tagOf = (id: string) => data.animals.find((x) => x.animal.id === id)?.animal.tag ?? '';
  const dayRecords = data.records
    .filter((r) => r.data.date === date)
    .sort((a, b) => (a.data.session === b.data.session ? tagOf(a.data.animalId).localeCompare(tagOf(b.data.animalId), undefined, { numeric: true }) : a.data.session === 'MORNING' ? -1 : 1));
  // Milk from cows under withdrawal that day, minus what was already recorded as discarded for them.
  const withdrawalMilk = data.animals
    .map((a) => {
      if (!withdrawalUntil(data.health, a.animal.id, date)) return null;
      const produced = data.records.filter((r) => r.data.animalId === a.animal.id && r.data.date === date && !r.data.deletedAt).reduce((x, r) => x + r.data.quantityMl, 0);
      const discarded = dayUsages.filter((u) => u.data.type === 'DISCARDED' && u.data.animalId === a.animal.id).reduce((x, u) => x + u.data.quantityMl, 0);
      return produced - discarded > 0 ? { a, ml: produced - discarded } : null;
    })
    .filter(Boolean) as { a: (typeof data.animals)[number]; ml: number }[];

  return (
    <Screen>
      {can('milk', 'add') ? (
        <Button title={`🥛 ${t('recordMilk')}`} onPress={() => router.push({ pathname: '/milk/entry', params: { date } })} style={{ minHeight: 64 }} />
      ) : null}

      {data.animals.length === 0 ? (
        <Card>
          <Body style={{ fontWeight: '700' }}>🐄 {t('addAnimalFirst')}</Body>
          {can('animals', 'add') ? <Button title={t('addAnimal')} variant="secondary" onPress={() => router.push('/animals/new')} /> : null}
        </Card>
      ) : null}

      <DateField label={t('date')} value={date} onChange={(d) => d && setDate(d)} />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Section>{formatDate(date)}</Section>
          {s.isToday ? <Badge text={t('dayInProgress')} tone="info" /> : s.complete ? <Badge text={t('complete')} tone="good" /> : <Badge text={t('incomplete')} tone="warn" />}
        </Row>
        <InfoLine label={`☀️ ${t('morning')}`} value={L(s.morningMl)} />
        <InfoLine label={`🌙 ${t('evening')}`} value={L(s.eveningMl)} />
        <InfoLine label={t('produced')} value={L(s.producedMl)} />
        {data.soldByDate ? <InfoLine label={t('sold')} value={L(s.soldMl)} /> : null}
        {MILK_USAGE_TYPES.map((u) => (s.usedMl[u] ? <InfoLine key={u} label={t(`u_${u}`)} value={L(s.usedMl[u])} /> : null))}
        {data.soldByDate ? <InfoLine label={t('remaining')} value={L(s.remainingMl)} /> : null}
        {s.expected > 0 ? <Muted>{t('recordedOf', { recorded: s.recorded, expected: s.expected })}</Muted> : null}
      </Card>
      {data.soldByDate && s.remainingMl < 0 ? <Notice tone="warn" text={t('remainingNegative')} /> : null}

      <Section>{t('dayEntries')}</Section>
      {dayRecords.length === 0 && dayUsages.length === 0 ? <Muted>{t('noMilkEntries')}</Muted> : null}
      {dayRecords.length ? (
        <Card>
          {dayRecords.map((r) => {
            const a = data.animals.find((x) => x.animal.id === r.data.animalId)?.animal;
            const label = `${r.data.session === 'MORNING' ? '☀️' : '🌙'} #${a?.tag ?? '?'}${a?.name ? ` ${a.name}` : ''}`;
            return (
              <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: '700' }}>{label}</Body>
                  {r.syncState !== 'synced' ? <Badge text={t(r.syncState === 'pending' ? 'statePending' : 'stateConflict')} tone={r.syncState === 'pending' ? 'warn' : 'bad'} /> : null}
                </View>
                <Body style={{ fontWeight: '800' }}>{L(r.data.quantityMl)}</Body>
                {can('milk', 'edit') ? (
                  <IconButton icon="✏️" label={t('edit')} onPress={() => router.push({ pathname: '/milk/entry', params: { date, session: r.data.session } })} />
                ) : null}
                {can('milk', 'delete') ? (
                  <IconButton
                    icon="🗑"
                    label={t('delete')}
                    onPress={() =>
                      Alert.alert(t('deleteMilkQ'), `${label} · ${L(r.data.quantityMl)} · ${formatDate(date)}`, [
                        { text: t('cancel'), style: 'cancel' },
                        { text: t('delete'), style: 'destructive', onPress: () => local().repo.remove('MilkRecord', me!.id, r.id) },
                      ])
                    }
                  />
                ) : null}
              </View>
            );
          })}
        </Card>
      ) : null}
      {dayUsages.length ? (
        <Card>
          {dayUsages.map((u) => {
            const tag = u.data.animalId ? data.animals.find((x) => x.animal.id === u.data.animalId)?.animal.tag : null;
            const label = `${u.data.session === 'MORNING' ? '☀️ ' : u.data.session === 'EVENING' ? '🌙 ' : ''}${t(`u_${u.data.type}`)}${tag ? ` · #${tag}` : ''}`;
            return (
              <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Body style={{ flex: 1 }}>{label}</Body>
                <Body style={{ fontWeight: '800' }}>{L(u.data.quantityMl)}</Body>
                {can('milk', 'delete') ? (
                  <IconButton
                    icon="🗑"
                    label={t('delete')}
                    onPress={() =>
                      Alert.alert(t('deleteUsageQ'), `${label} · ${L(u.data.quantityMl)} · ${formatDate(date)}`, [
                        { text: t('cancel'), style: 'cancel' },
                        { text: t('delete'), style: 'destructive', onPress: () => local().repo.remove('MilkUsage', me!.id, u.id) },
                      ])
                    }
                  />
                ) : null}
              </View>
            );
          })}
        </Card>
      ) : null}

      {withdrawalMilk.length ? (
        <Card>
          <Body style={{ fontWeight: '700' }}>{t('withdrawalToday')}</Body>
          {withdrawalMilk.map(({ a, ml }) => (
            <Row key={a.animal.id} style={{ justifyContent: 'space-between' }}>
              <Body style={{ flexShrink: 1 }}>{t('withdrawalMilk', { tag: a.animal.tag, litres: litres(ml) })}</Body>
              {can('milk', 'add') ? (
                <Button title={t('recordDiscarded')} variant="danger" onPress={() => local().repo.create('MilkUsage', me!.id, newId(), { date, type: 'DISCARDED', quantityMl: ml, animalId: a.animal.id, session: null, note: t('withdrawalToday') })} />
              ) : null}
            </Row>
          ))}
        </Card>
      ) : null}

      {s.missing.length ? (
        <Card>
          <Body style={{ fontWeight: '700' }}>{t('missingEntries')}</Body>
          {s.missing.map((m) => (
            <Muted key={`${m.animal.animal.id}${m.session}`}>
              #{m.animal.animal.tag}{m.animal.animal.name ? ` ${m.animal.animal.name}` : ''} · {m.session === 'MORNING' ? t('morning') : t('evening')}
            </Muted>
          ))}
          <Muted>{t('missingNote')}</Muted>
        </Card>
      ) : null}

      <Button title={t('monthly')} variant="secondary" onPress={() => router.push({ pathname: '/milk/month', params: { month: date.slice(0, 7) } })} />
      {can('milk', 'add') ? <Button title={`+ ${t('addUsage')}`} variant="ghost" onPress={() => router.push({ pathname: '/milk/usage', params: { date } })} /> : null}
    </Screen>
  );
}

/** Small square button with an icon (edit / delete). */
function IconButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [{ width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }, pressed && { opacity: 0.7 }]}
    >
      <Text style={{ fontSize: 20 }}>{icon}</Text>
    </Pressable>
  );
}
