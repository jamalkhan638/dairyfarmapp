import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ANIMAL_STATUSES, type AnimalStatus } from '@dairy/shared';
import { useSession } from '../../../../lib/session';
import { local, newId } from '../../../../lib/db';
import { changeStatus } from '../../../../domain/animals';
import { today } from '../../../../lib/format';
import { Button, Choice, DateField, Field, Notice, Screen } from '../../../../components/ui';

export default function ChangeStatus() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, can } = useSession();
  const [status, setStatus] = useState<AnimalStatus | null>(null);
  const [date, setDate] = useState<string | null>(today());
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  if (!can('animals', 'edit')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  return (
    <Screen>
      <Choice label={t('newStatus')} value={status} options={ANIMAL_STATUSES.map((s) => ({ value: s, label: t(`s_${s}`) }))} onChange={setStatus} />
      <DateField label={t('effectiveDate')} value={date} onChange={setDate} />
      <Field label={`${t('reason')} (${t('optional')})`} value={reason} onChangeText={setReason} multiline />
      <Button
        title={t('save')}
        busy={saving}
        disabled={!status || !date}
        onPress={async () => {
          setSaving(true);
          await changeStatus(local().repo, me!.id, newId, id, status!, date!, reason.trim() || null);
          router.back();
        }}
      />
    </Screen>
  );
}
