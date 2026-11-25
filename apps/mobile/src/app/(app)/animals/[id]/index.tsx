import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLocalQuery } from '../../../../lib/hooks';
import { local } from '../../../../lib/db';
import { useSession } from '../../../../lib/session';
import { loadAnimals } from '../../../../domain/animals';
import { formatAge, formatDate, formatPKR } from '../../../../lib/format';
import { AnimalPhoto } from '../../../../components/AnimalPhoto';
import { RecordMeta } from '../../../../components/RecordMeta';
import { HistoryList } from '../../../../components/HistoryList';
import { AnimalMilk } from '../../../../components/AnimalMilk';
import { AnimalFeed } from '../../../../components/AnimalFeed';
import { Badge, Body, Button, Card, Choice, InfoLine, Muted, Notice, Row, Screen, Title } from '../../../../components/ui';

type Tab = 'info' | 'milk' | 'feed' | 'status' | 'history';

export default function AnimalDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, can } = useSession();
  const [tab, setTab] = useState<Tab>('info');
  const { data } = useLocalQuery(async () => (await loadAnimals(local().repo)).find((a) => a.animal.id === id) ?? null, [id]);

  if (data === undefined) return <Screen>{null}</Screen>;
  if (data === null) return <Screen><Muted>—</Muted></Screen>;
  const { animal: a, record, status, statusDate, history } = data;

  const remove = () =>
    Alert.alert(t('delete'), t('deleteAnimalQ'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => { await local().repo.remove('Animal', me!.id, a.id); router.back(); } },
    ]);

  return (
    <Screen>
      <Row style={{ alignItems: 'flex-start' }}>
        <AnimalPhoto photoId={a.photoId} tag={a.tag} size={96} />
        <View style={{ flex: 1, gap: 4 }}>
          <Title>#{a.tag}</Title>
          {a.name ? <Body style={{ fontSize: 19 }}>{a.name}</Body> : null}
          <Badge text={`${t(`s_${status}`)} · ${t('statusDate')} ${formatDate(statusDate)}`} tone={status === 'MILKING' ? 'good' : 'info'} />
        </View>
      </Row>
      {record.syncState === 'conflict' ? <Notice tone="bad" text={t('conflictsCount', { count: 1 })} /> : null}
      {record.syncState === 'rejected' ? <Notice tone="bad" text={t('rejectedCount', { count: 1 })} /> : null}
      {record.syncState !== 'synced' && record.syncState !== 'pending' ? <Button title={t('syncDetails')} variant="secondary" onPress={() => router.push('/sync')} /> : null}

      <Choice value={tab} onChange={setTab} options={[{ value: 'info', label: t('details') }, ...(can('milk', 'view') && a.sex === 'FEMALE' ? [{ value: 'milk' as Tab, label: t('milk') }] : []), ...(can('feed', 'view') ? [{ value: 'feed' as Tab, label: t('feed') }] : []), { value: 'status', label: t('statusHistory') }, { value: 'history', label: t('history') }]} />

      {tab === 'info' ? (
        <>
          <Card>
            <InfoLine label={t('breed')} value={a.breed ?? '—'} />
            <InfoLine label={t('sex')} value={a.sex === 'FEMALE' ? t('female') : t('male')} />
            <InfoLine label={t('birthDate')} value={a.birthDate ? `${formatDate(a.birthDate)}${a.birthDateEstimated ? ` (${t('estimated')})` : ''}` : '—'} />
            <InfoLine label={t('age')} value={formatAge(a.birthDate) ?? '—'} />
            <InfoLine label={t('purchaseDate')} value={formatDate(a.purchaseDate)} />
            <InfoLine label={t('purchasePrice')} value={formatPKR(a.purchasePricePaisa)} />
            {a.notes ? <Body>{a.notes}</Body> : null}
          </Card>
          <RecordMeta data={a} syncState={record.syncState} />
          {can('animals', 'edit') ? <Button title={t('edit')} onPress={() => router.push(`/animals/${a.id}/edit`)} /> : null}
          {can('animals', 'edit') ? <Button title={t('changeStatus')} variant="secondary" onPress={() => router.push(`/animals/${a.id}/status`)} /> : null}
          {can('expenses', 'add') ? <Button title={t('addExpense')} variant="secondary" onPress={() => router.push({ pathname: '/money/expense', params: { animalId: a.id } })} /> : null}
          {can('animals', 'delete') ? <Button title={t('delete')} variant="danger" onPress={remove} /> : null}
        </>
      ) : null}

      {tab === 'status' ? (
        <View style={{ gap: 8 }}>
          {can('animals', 'edit') ? <Button title={t('changeStatus')} onPress={() => router.push(`/animals/${a.id}/status`)} /> : null}
          {history.length === 0 ? (
            <Card><Body>{t(`s_${a.status}`)} · {formatDate(a.statusDate)}</Body><Muted>{t('statePending')}</Muted></Card>
          ) : (
            history.map((h) => (
              <Card key={h.id}>
                <Body style={{ fontWeight: '700' }}>{t(`s_${h.status}`)} · {formatDate(h.effectiveDate)}</Body>
                {h.reason ? <Muted>{h.reason}</Muted> : null}
              </Card>
            ))
          )}
        </View>
      ) : null}

      {tab === 'milk' ? <AnimalMilk animalId={a.id} /> : null}
      {tab === 'feed' ? <AnimalFeed animalId={a.id} /> : null}

      {tab === 'history' ? <HistoryList entity="Animal" id={a.id} /> : null}
    </Screen>
  );
}
