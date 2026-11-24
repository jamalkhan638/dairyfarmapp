import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../lib/session';
import { AnimalFormView } from '../../../components/AnimalForm';
import { Notice, Screen } from '../../../components/ui';
import { saveNewAnimal } from '../../../domain/animal-save';

export default function NewAnimal() {
  const { t } = useTranslation();
  const router = useRouter();
  const { me, can } = useSession();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!can('animals', 'add')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  return (
    <Screen>
      <AnimalFormView
        isNew
        saving={saving}
        error={error}
        initialForm={{ tag: '', sex: 'FEMALE', birthDateEstimated: false }}
        onSubmit={async (v) => {
          setSaving(true);
          setError(null);
          try {
            const r = await saveNewAnimal(me!.id, v);
            if (r.error) setError(r.error);
            else router.replace(`/animals/${r.id}`);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      />
    </Screen>
  );
}
