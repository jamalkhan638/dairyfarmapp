import React from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Card, Muted, Screen } from '../../../components/ui';

/** Record feeding: monthly total (used now) or daily (for later). */
export default function RecordFeedingChoice() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Screen>
      <Card>
        <Button title={`📅 ${t('feedMonthly')}`} onPress={() => router.replace('/feed/monthly')} style={{ minHeight: 72 }} />
        <Muted>{t('monthlyFeedingHelp')}</Muted>
      </Card>
      <Card>
        <Button title={`📝 ${t('feedDaily')}`} variant="secondary" onPress={() => router.replace('/feed/feeding')} style={{ minHeight: 64 }} />
        <Body>{t('fedTo')}: {t('ft_milking')} / {t('ft_one')} …</Body>
      </Card>
    </Screen>
  );
}
