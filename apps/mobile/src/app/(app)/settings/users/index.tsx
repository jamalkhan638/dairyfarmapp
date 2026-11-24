import React, { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { UserSummary } from '@dairy/shared';
import { api } from '../../../../lib/api';
import { Badge, Body, Button, Card, Muted, Notice, Row, Screen } from '../../../../components/ui';

/** Owner only. Needs internet: access changes are made on the server. */
export default function Users() {
  const { t } = useTranslation();
  const router = useRouter();
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [error, setError] = useState(false);
  useFocusEffect(
    useCallback(() => {
      api.users().then((u) => { setUsers(u); setError(false); }).catch(() => setError(true));
    }, []),
  );
  return (
    <Screen footer={<Button title={t('addUser')} onPress={() => router.push('/settings/users/new')} disabled={error} />}>
      {error ? <Notice tone="warn" text={t('onlineOnly')} /> : null}
      {(users ?? []).map((u) => (
        <Card key={u.id} onPress={() => router.push(`/settings/users/${u.id}`)}>
          <Body style={{ fontWeight: '700' }}>{u.name}</Body>
          <Muted>@{u.username}</Muted>
          <Row>
            <Badge text={u.role === 'OWNER' ? t('owner') : t('worker')} tone={u.role === 'OWNER' ? 'info' : 'neutral'} />
            {!u.active ? <Badge text={t('disabled')} tone="bad" /> : null}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
