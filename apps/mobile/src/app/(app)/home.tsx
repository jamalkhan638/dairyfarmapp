import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ANIMAL_STATUSES } from '@dairy/shared';
import { useSession } from '../../lib/session';
import { useLocalQuery } from '../../lib/hooks';
import { local } from '../../lib/db';
import { loadAnimals } from '../../domain/animals';
import { litres, loadMilk, summarizeDay } from '../../domain/milk';
import { today } from '../../lib/format';
import { Body, Button, Card, Muted, Row, Screen, Section, Title } from '../../components/ui';
import { colors } from '../../lib/theme';

export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const { me, can } = useSession();
  const { data } = useLocalQuery(async () => ({ animals: await loadAnimals(local().repo), milk: await loadMilk(local().repo) }));
  const animals = data?.animals;
  const day = data ? summarizeDay(today(), data.animals, data.milk.records.map((r) => r.data), data.milk.usages.map((u) => u.data)) : null;
  const counts = Object.fromEntries(ANIMAL_STATUSES.map((st) => [st, (animals ?? []).filter((a) => a.status === st).length]));

  return (
    <Screen>
      <Title>{t('hello', { name: me?.name ?? '' })}</Title>
      {can('animals', 'view') ? (
        <Card onPress={() => router.push('/animals')}>
          <Section>{t('herd')}</Section>
          <Row style={{ flexWrap: 'wrap', gap: 16 }}>
            {(['MILKING', 'DRY', 'YOUNG'] as const).map((st) => (
              <View key={st} style={{ minWidth: 90 }}>
                <Body style={{ fontSize: 28, fontWeight: '800', color: colors.primaryDark }}>{counts[st]}</Body>
                <Muted>{t(`s_${st}`)}</Muted>
              </View>
            ))}
          </Row>
        </Card>
      ) : null}
      {can('milk', 'view') && day ? (
        <Card onPress={() => router.push('/milk')}>
          <Section>{t('todayMilk')}</Section>
          <Body style={{ fontSize: 28, fontWeight: '800', color: colors.primaryDark }}>{litres(day.producedMl)} {t('L')}</Body>
          <Muted>{t('morning')} {litres(day.morningMl)} · {t('evening')} {litres(day.eveningMl)}</Muted>
          <Muted>{t('recordedOf', { recorded: day.recorded, expected: day.expected })}</Muted>
        </Card>
      ) : null}
      {can('milk', 'add') ? (
        <Row>
          <Button title={t('morning')} onPress={() => router.push({ pathname: '/milk/entry', params: { date: today(), session: 'MORNING' } })} style={{ flex: 1 }} />
          <Button title={t('evening')} onPress={() => router.push({ pathname: '/milk/entry', params: { date: today(), session: 'EVENING' } })} style={{ flex: 1 }} />
        </Row>
      ) : null}
      {can('milk', 'view') ? <Button title={t('milk')} variant="secondary" onPress={() => router.push('/milk')} /> : null}
      {can('animals', 'view') ? <Button title={t('animals')} onPress={() => router.push('/animals')} /> : null}
      {can('animals', 'add') ? <Button title={t('addAnimal')} variant="secondary" onPress={() => router.push('/animals/new')} /> : null}
      <Button title={t('settings')} variant="secondary" onPress={() => router.push('/settings')} />
      <Muted>{t('comingSoon')}</Muted>
    </Screen>
  );
}
