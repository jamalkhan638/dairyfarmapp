import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../lib/session';
import { useSalesData } from '../../../lib/use-sales';
import { local, newId } from '../../../lib/db';
import { parseRupees } from '../../../domain/sales';
import { today } from '../../../lib/format';
import { Button, DateField, Field, Muted, Notice, Screen, Title } from '../../../components/ui';

/** New price per litre for a customer from a date. Old deliveries keep their price. */
export default function RateForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const { me, can } = useSession();
  const data = useSalesData();
  const [rate, setRate] = useState('');
  const [from, setFrom] = useState<string | null>(today());
  const [error, setError] = useState<string | null>(null);
  if (!can('sales', 'edit')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  const customer = data?.customers.find((c) => c.id === customerId);

  const save = async () => {
    const r = parseRupees(rate);
    if (r === null || r === 'invalid' || r <= 0) return setError(t('invalidRate'));
    const same = data?.rates.find((x) => x.data.customerId === customerId && x.data.effectiveFrom === from);
    // One rate per start date: if one exists for this date, change it instead of adding another.
    if (same) await local().repo.update('CustomerRate', me!.id, same.id, { ratePaisaPerLitre: r });
    else await local().repo.create('CustomerRate', me!.id, newId(), { customerId, ratePaisaPerLitre: r, effectiveFrom: from!, note: null });
    router.back();
  };

  return (
    <Screen>
      <Title>{customer?.data.name ?? ''}</Title>
      <Field label={t('rate')} value={rate} onChangeText={setRate} keyboardType="decimal-pad" />
      <DateField label={t('rateFrom')} value={from} onChange={setFrom} />
      <Muted>{t('rateNote')}</Muted>
      {error ? <Notice tone="bad" text={error} /> : null}
      <Button title={t('save')} onPress={save} disabled={!rate || !from} />
    </Screen>
  );
}
