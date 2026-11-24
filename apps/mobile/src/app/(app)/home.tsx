import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ANIMAL_STATUSES } from '@dairy/shared';
import { useSession } from '../../lib/session';
import { useLocalQuery } from '../../lib/hooks';
import { local } from '../../lib/db';
import { loadAnimals } from '../../domain/animals';
import { Body, Button, Card, Muted, Row, Screen, Section, Title } from '../../components/ui';
import { colors } from '../../lib/theme';

export default function Home() {
  const { t } = useTranslation();
  const router = useRouter();
  const { me, can } = useSession();
  const { data: animals } = useLocalQuery(() => loadAnimals(local().repo));
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
      {can('animals', 'view') ? <Button title={t('animals')} onPress={() => router.push('/animals')} /> : null}
      {can('animals', 'add') ? <Button title={t('addAnimal')} variant="secondary" onPress={() => router.push('/animals/new')} /> : null}
      <Button title={t('settings')} variant="secondary" onPress={() => router.push('/settings')} />
      <Muted>{t('comingSoon')}</Muted>
    </Screen>
  );
}
