import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../../lib/session';
import { useLocalQuery } from '../../../../lib/hooks';
import { local } from '../../../../lib/db';
import type { Animal } from '../../../../domain/animals';
import { AnimalFormView } from '../../../../components/AnimalForm';
import { Notice, Screen } from '../../../../components/ui';
import { saveAnimalEdits } from '../../../../domain/animal-save';

export default function EditAnimal() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, can } = useSession();
  const { data: rec } = useLocalQuery(() => local().repo.get<Animal>('Animal', id), [id]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!can('animals', 'edit')) return <Screen><Notice tone="bad" text={t('noPermission')} /></Screen>;
  if (!rec) return <Screen>{null}</Screen>;
  const a = rec.data;
  return (
    <Screen>
      <AnimalFormView
        isNew={false}
        saving={saving}
        error={error}
        photoId={a.photoId}
        initialForm={{ tag: a.tag, name: a.name, breed: a.breed, sex: a.sex, birthDate: a.birthDate, birthDateEstimated: a.birthDateEstimated, purchaseDate: a.purchaseDate, purchasePricePaisa: a.purchasePricePaisa, notes: a.notes }}
        onSubmit={async (v) => {
          setSaving(true);
          setError(null);
          try {
            const r = await saveAnimalEdits(me!.id, id, v);
            if (r.error) setError(r.error);
            else router.back();
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
