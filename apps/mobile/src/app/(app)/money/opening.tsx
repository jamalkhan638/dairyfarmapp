import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FARM_SETTINGS_ID } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useFinanceData } from '../../../lib/use-finance';
import { local } from '../../../lib/db';
import { parseRupees } from '../../../domain/sales';
import { Button, DateField, Field, Muted, Notice, Screen, Section } from '../../../components/ui';
import { HistoryList } from '../../../components/HistoryList';

/** Money the farm had when it started using the app, and the farm name. */
export default function OpeningBalance() {
  const { t } = useTranslation();
  const router = useRouter();
  const { me, can } = useSession();
  const d = useFinanceData();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [farmName, setFarmName] = useState('');
  const [filled, setFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!d?.settings || filled) return;
    setAmount(String(d.settings.openingCashPaisa / 100));
    setDate(d.settings.openingCashDate);
    setFarmName(d.settings.farmName ?? '');
    setFilled(true);
  }, [d, filled]);
  if (!can('finance', 'edit')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!d) return <Screen>{null}</Screen>;
  if (!d.settings) return <Screen><Notice tone="warn" text={t('neverSynced')} /></Screen>;
  const save = async () => {
    const neg = amount.trim().startsWith('-');
    const p = parseRupees(amount.replace('-', ''));
    if (p === null || p === 'invalid') return setError(t('invalidAmount'));
    await local().repo.update('FarmSettings', me!.id, FARM_SETTINGS_ID, { openingCashPaisa: neg ? -p : p, openingCashDate: date, farmName: farmName.trim() || null });
    router.back();
  };
  return (
    <Screen>
      <Muted>{t('openingHelp')}</Muted>
      <Field label={t('openingCash')} value={amount} onChangeText={setAmount} keyboardType="numbers-and-punctuation" />
      <DateField label={t('openingCashDate')} value={date} onChange={setDate} />
      <Field label={`${t('farmName')} (${t('optional')})`} value={farmName} onChangeText={setFarmName} />
      {error ? <Notice tone="bad" text={error} /> : null}
      <Button title={t('save')} onPress={save} disabled={!date} />
      <Section>{t('history')}</Section>
      <HistoryList entity="FarmSettings" id={FARM_SETTINGS_ID} />
    </Screen>
  );
}
