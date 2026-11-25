import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../lib/session';
import { useFeedData } from '../../../lib/use-feed';
import { kg } from '../../../domain/feed';
import { Badge, Body, Button, Card, Muted, Row, Screen } from '../../../components/ui';

export default function FeedItems() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = useSession();
  const data = useFeedData();
  return (
    <Screen footer={can('feed', 'add') ? <Button title={t('addFeedItem')} onPress={() => router.push('/feed/item')} /> : undefined}>
      {data?.items.length === 0 ? <Muted>{t('noFeedItems')}</Muted> : null}
      {data?.items.map((i) => (
        <Card key={i.id} onPress={() => router.push({ pathname: '/feed/item', params: { id: i.id } })}>
          <Body style={{ fontWeight: '700' }}>{i.data.name}</Body>
          <Row>
            <Muted>{t(`fc_${i.data.category}`)}{i.data.bagWeightGrams ? ` · ${t('bagWeight')}: ${kg(i.data.bagWeightGrams)}` : ''}</Muted>
            {!i.data.active ? <Badge text={t('inactive')} /> : null}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
