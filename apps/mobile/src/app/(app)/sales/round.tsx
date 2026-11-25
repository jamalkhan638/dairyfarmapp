import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { saleAmountPaisa, type MilkSession, type SaleType } from '@dairy/shared';
import { useSession } from '../../../lib/session';
import { useSalesData } from '../../../lib/use-sales';
import { local, newId } from '../../../lib/db';
import { rateOn, saveRound, type RoundChange } from '../../../domain/sales';
import { litres, parseLitres } from '../../../domain/milk';
import { formatPKR, today } from '../../../lib/format';
import { Badge, Body, Button, Choice, DateField, Muted, Notice, Row, Screen, s as ui } from '../../../components/ui';
import { colors } from '../../../lib/theme';

/** One milking's deliveries for all customers on one screen (the daily "round"). */
export default function DeliveryRound() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; session?: MilkSession }>();
  const { me, can } = useSession();
  const data = useSalesData();
  const [date, setDate] = useState<string>(params.date ?? today());
  const [session, setSession] = useState<MilkSession>(params.session ?? 'MORNING');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [type, setType] = useState<Record<string, SaleType>>({});
  const [loadedFor, setLoadedFor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const existing = useMemo(() => (data?.deliveries ?? []).filter((d) => d.data.date === date && d.data.session === session), [data, date, session]);
  // Fill in what was already saved for this date and milking.
  useEffect(() => {
    const key = `${date}:${session}`;
    if (!data || loadedFor === key) return;
    setQty(Object.fromEntries(existing.map((d) => [d.data.customerId, litres(d.data.quantityMl).replace(/,/g, '')])));
    setType(Object.fromEntries(existing.map((d) => [d.data.customerId, d.data.saleType])));
    setLoadedFor(key);
  }, [data, existing, date, session, loadedFor]);

  if (!can('sales', 'add')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!data) return <Screen>{null}</Screen>;
  if (data.customers.filter((c) => c.data.active).length === 0) {
    return (
      <Screen>
        <View style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 12 }}>
          <Body style={{ fontSize: 20, fontWeight: '700' }}>👥 {t('addCustomerFirst')}</Body>
          <Button title={t('addCustomer')} onPress={() => router.replace('/sales/customer')} />
        </View>
      </Screen>
    );
  }
  const rates = data.rates.map((r) => r.data);
  const withEntry = new Set(existing.map((d) => d.data.customerId));
  const customers = data.customers.filter((c) => c.data.active || withEntry.has(c.id));

  const rows = customers.map((c) => {
    const saved = existing.find((d) => d.data.customerId === c.id);
    const rate = saved?.data.ratePaisaPerLitre ?? rateOn(rates, c.id, date)?.ratePaisaPerLitre ?? null;
    return { c, saved, rate, saleType: saved?.data.saleType ?? type[c.id] ?? c.data.defaultSaleType };
  });

  const save = async () => {
    setError(null);
    const changes: RoundChange[] = [];
    for (const r of rows) {
      const ml = parseLitres(qty[r.c.id] ?? '');
      if (ml === 'invalid' || (typeof ml === 'number' && ml <= 0 && !r.saved)) return setError(`${r.c.data.name}: ${t('invalidLitres')}`);
      if (ml === null && !r.saved) continue;
      if (ml === null && r.saved && !can('sales', 'delete')) return setError(t('cannotDeleteEntries'));
      if (typeof ml === 'number' && r.rate === null) return setError(`${r.c.data.name}: ${t('noRate')}`);
      if (r.saved && !can('sales', 'edit') && ml !== r.saved.data.quantityMl) return setError(t('noPermission'));
      changes.push({ customerId: r.c.id, ml: ml === 0 ? null : (ml as number | null), saleType: r.saleType, ratePaisaPerLitre: r.rate ?? 0 });
    }
    setSaving(true);
    await saveRound(local().repo, me!.id, newId, date, session, changes, existing);
    router.back();
  };

  let totalMl = 0;
  let totalPaisa = 0;
  for (const r of rows) {
    const ml = parseLitres(qty[r.c.id] ?? '');
    if (typeof ml === 'number' && r.rate !== null) {
      totalMl += ml;
      totalPaisa += saleAmountPaisa(ml, r.rate);
    }
  }

  return (
    <Screen footer={<Button title={`${t('save')} · ${litres(totalMl)} ${t('L')} · ${formatPKR(totalPaisa)}`} onPress={save} busy={saving} />}>
      <DateField label={t('date')} value={date} onChange={(d) => d && setDate(d)} />
      <Choice value={session} onChange={setSession} options={[{ value: 'MORNING', label: t('morning') }, { value: 'EVENING', label: t('evening') }]} />
      {rows.length === 0 ? <Muted>{t('noCustomers')}</Muted> : null}
      {rows.map(({ c, saved, rate, saleType }) => {
        const ml = parseLitres(qty[c.id] ?? '');
        const amount = typeof ml === 'number' && rate !== null ? saleAmountPaisa(ml, rate) : null;
        return (
          <View key={c.id} style={{ backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 8 }}>
            <Row>
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '800', fontSize: 18 }}>{c.data.name}</Body>
                <Muted>{rate !== null ? `${formatPKR(rate)}${t('perLitre')}` : t('noRate')}{amount !== null ? ` · ${formatPKR(amount)}` : ''}</Muted>
                {saved && saved.syncState !== 'synced' ? <Badge text={t('statePending')} tone="warn" /> : null}
              </View>
              <TextInput
                value={qty[c.id] ?? ''}
                onChangeText={(v) => setQty((p) => ({ ...p, [c.id]: v }))}
                keyboardType="decimal-pad"
                placeholder="—"
                placeholderTextColor={colors.muted}
                editable={rate !== null}
                style={[ui.input, { width: 100, fontSize: 22, textAlign: 'center', fontWeight: '700' }]}
                accessibilityLabel={`${c.data.name} ${t('litres')}`}
              />
              <Body>{t('L')}</Body>
            </Row>
            <Row>
              {(['CREDIT', 'CASH'] as const).map((st) => {
                const on = saleType === st;
                return (
                  <Pressable
                    key={st}
                    disabled={!!saved}
                    onPress={() => setType((p) => ({ ...p, [c.id]: st }))}
                    style={[ui.chip, { minHeight: 36 }, on && ui.chipOn, saved && !on && { opacity: 0.4 }]}
                  >
                    <Text style={[ui.chipText, on && ui.chipTextOn]}>{t(`st_${st}`)}</Text>
                  </Pressable>
                );
              })}
            </Row>
            {rate === null ? <Button title={t('setRate')} variant="ghost" onPress={() => router.push({ pathname: '/sales/rate', params: { customerId: c.id } })} /> : null}
          </View>
        );
      })}
      {error ? <Notice tone="bad" text={error} /> : null}
    </Screen>
  );
}
