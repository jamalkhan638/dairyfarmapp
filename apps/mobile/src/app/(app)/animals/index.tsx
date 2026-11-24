import React, { useState } from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLocalQuery } from '../../../lib/hooks';
import { local } from '../../../lib/db';
import { useSession } from '../../../lib/session';
import { isActive, loadAnimals, type AnimalView } from '../../../domain/animals';
import { AnimalPhoto } from '../../../components/AnimalPhoto';
import { Badge, Body, Button, Card, Choice, Muted, Notice, Row, Screen } from '../../../components/ui';
import { formatAge } from '../../../lib/format';

type Filter = 'active' | 'MILKING' | 'DRY' | 'YOUNG' | 'gone';

export default function AnimalList() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = useSession();
  const [filter, setFilter] = useState<Filter>('active');
  const { data } = useLocalQuery(() => loadAnimals(local().repo));

  if (!can('animals', 'view')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;

  const match = (a: AnimalView) =>
    filter === 'active' ? isActive(a.status) : filter === 'gone' ? !isActive(a.status) : a.status === filter;
  const list = (data ?? []).filter(match);

  return (
    <Screen scroll={false} footer={can('animals', 'add') ? <Button title={t('addAnimal')} onPress={() => router.push('/animals/new')} /> : undefined}>
      <Choice
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'active', label: t('active') },
          { value: 'MILKING', label: t('s_MILKING') },
          { value: 'DRY', label: t('s_DRY') },
          { value: 'YOUNG', label: t('s_YOUNG') },
          { value: 'gone', label: `${t('s_SOLD')} / ${t('s_DECEASED')}` },
        ]}
      />
      <FlatList
        data={list}
        keyExtractor={(a) => a.animal.id}
        contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
        ListEmptyComponent={data ? <Muted>{t("noAnimals")}</Muted> : undefined}
        renderItem={({ item: a }) => (
          <Card onPress={() => router.push(`/animals/${a.animal.id}`)}>
            <Row>
              <AnimalPhoto photoId={a.animal.photoId} tag={a.animal.tag} size={56} />
              <View style={{ flex: 1, gap: 2 }}>
                <Body style={{ fontWeight: '800', fontSize: 19 }}>
                  #{a.animal.tag}
                  {a.animal.name ? ` · ${a.animal.name}` : ''}
                </Body>
                <Muted>{[a.animal.breed, formatAge(a.animal.birthDate)].filter(Boolean).join(' · ')}</Muted>
                <Row>
                  <Badge text={t(`s_${a.status}`)} tone={a.status === 'MILKING' ? 'good' : a.status === 'DRY' ? 'info' : 'neutral'} />
                  {a.record.syncState !== 'synced' ? (
                    <Badge text={t(a.record.syncState === 'pending' ? 'statePending' : a.record.syncState === 'conflict' ? 'stateConflict' : 'stateRejected')} tone={a.record.syncState === 'pending' ? 'warn' : 'bad'} />
                  ) : null}
                </Row>
              </View>
            </Row>
          </Card>
        )}
      />
    </Screen>
  );
}
