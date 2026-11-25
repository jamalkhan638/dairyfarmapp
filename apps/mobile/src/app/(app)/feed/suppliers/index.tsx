import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../../lib/session';
import { useFeedData } from '../../../../lib/use-feed';
import { supplierBalances } from '../../../../domain/feed';
import { Badge, Body, Button, Card, Muted, Row, Screen } from '../../../../components/ui';
import { OwedText } from '../../../../components/BalanceText';

export default function Suppliers() {
  const { t } = useTranslation();
  const router = useRouter();
  const { can } = useSession();
  const data = useFeedData();
  if (!data) return <Screen>{null}</Screen>;
  const bal = supplierBalances(data.purchases.map((p) => p.data), data.payments.map((p) => p.data));
  return (
    <Screen footer={can('feed', 'add') ? <Button title={t('addSupplier')} onPress={() => router.push('/feed/supplier')} /> : undefined}>
      {data.suppliers.length === 0 ? <Muted>{t('noSuppliers')}</Muted> : null}
      {data.suppliers.map((s) => (
        <Card key={s.id} onPress={() => router.push(`/feed/suppliers/${s.id}`)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Body style={{ fontWeight: '800', fontSize: 18, flexShrink: 1 }}>{s.data.name}</Body>
            <OwedText paisa={bal.get(s.id)?.balancePaisa ?? 0} />
          </Row>
          {!s.data.active ? <Badge text={t('inactive')} /> : null}
        </Card>
      ))}
    </Screen>
  );
}
