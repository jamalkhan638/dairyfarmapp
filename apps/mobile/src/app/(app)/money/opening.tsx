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
  const [gest, setGest] = useState('');
  const [check, setCheck] = useState('');
  const [heat, setHeat] = useState('');
  const [filled, setFilled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!d?.settings || filled) return;
    setAmount(String(d.settings.openingCashPaisa / 100));
    setDate(d.settings.openingCashDate);
    setFarmName(d.settings.farmName ?? '');
    const st = d.settings as any;
    setGest(String(st.gestationDays ?? 283));
    setCheck(String(st.pregnancyCheckDays ?? 60));
    setHeat(String(st.heatRepeatDays ?? 21));
    setFilled(true);
  }, [d, filled]);
  if (!can('finance', 'edit')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!d) return <Screen>{null}</Screen>;
  if (!d.settings) return <Screen><Notice tone="warn" text={t('neverSynced')} /></Screen>;
  const save = async () => {
    const neg = amount.trim().startsWith('-');
    const p = parseRupees(amount.replace('-', ''));
    if (p === null || p === 'invalid') return setError(t('invalidAmount'));
    const days = (v: string, min: number, max: number) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= min && n <= max ? n : null;
    };
    const g = days(gest, 200, 400), c = days(check, 20, 150), h = days(heat, 15, 30);
    if (g === null || c === null || h === null) return setError(`${t('gestationDays')} 200–400 · ${t('pregnancyCheckDays')} 20–150 · ${t('heatRepeatDays')} 15–30`);
    await local().repo.update('FarmSettings', me!.id, FARM_SETTINGS_ID, { openingCashPaisa: neg ? -p : p, openingCashDate: date, farmName: farmName.trim() || null, gestationDays: g, pregnancyCheckDays: c, heatRepeatDays: h });
    router.back();
  };
  return (
    <Screen>
      <Field label={`${t('farmName')} (${t('optional')})`} value={farmName} onChangeText={setFarmName} />
      <Section>{t('breeding')}</Section>
      <Field label={t('gestationDays')} value={gest} onChangeText={setGest} keyboardType="number-pad" hint={t('gestationHint')} />
      <Field label={t('pregnancyCheckDays')} value={check} onChangeText={setCheck} keyboardType="number-pad" />
      <Field label={t('heatRepeatDays')} value={heat} onChangeText={setHeat} keyboardType="number-pad" />
      {error ? <Notice tone="bad" text={error} /> : null}
      <Button title={t('save')} onPress={save} />
      <Section>{t('history')}</Section>
      <HistoryList entity="FarmSettings" id={FARM_SETTINGS_ID} />
    </Screen>
  );
}
