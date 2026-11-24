import React, { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ANIMAL_STATUSES, rupeesToPaisa, paisaToRupees, type AnimalStatus } from '@dairy/shared';
import type { AnimalForm as Form } from '../domain/animals';
import { pickPhoto } from '../lib/photos';
import { today } from '../lib/format';
import { AnimalPhoto } from './AnimalPhoto';
import { Button, Choice, DateField, Field, Notice, Row, Toggle } from './ui';
import { Image } from 'expo-image';

export interface AnimalFormValue {
  form: Form;
  initial?: { status: AnimalStatus; date: string };
  /** A newly picked photo (temporary file) not yet saved. */
  newPhoto?: { uri: string; size: number } | null;
  removePhoto?: boolean;
}

export function AnimalFormView({
  initialForm,
  photoId,
  isNew,
  saving,
  error,
  onSubmit,
}: {
  initialForm: Form;
  photoId?: string | null;
  isNew: boolean;
  saving: boolean;
  error: string | null;
  onSubmit: (v: AnimalFormValue) => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<Form>(initialForm);
  const [price, setPrice] = useState(initialForm.purchasePricePaisa != null ? String(paisaToRupees(initialForm.purchasePricePaisa)) : '');
  const [status, setStatus] = useState<AnimalStatus>('MILKING');
  const [statusDate, setStatusDate] = useState<string | null>(today());
  const [newPhoto, setNewPhoto] = useState<{ uri: string; size: number } | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));
  const text = (k: 'name' | 'breed' | 'notes' | 'tag') => (v: string) => set(k)(v === '' && k !== 'tag' ? null : v);

  const choose = async (src: 'camera' | 'library') => {
    const p = await pickPhoto(src);
    if (p) {
      setNewPhoto(p);
      setRemovePhoto(false);
    }
  };

  const submit = () => {
    const priceNum = price.trim() === '' ? null : Number(price.replace(/,/g, ''));
    onSubmit({
      form: { ...form, purchasePricePaisa: priceNum === null || Number.isNaN(priceNum) ? null : rupeesToPaisa(priceNum) },
      initial: isNew ? { status, date: statusDate ?? today() } : undefined,
      newPhoto,
      removePhoto,
    });
  };

  const showExisting = !newPhoto && !removePhoto && photoId;
  return (
    <View style={{ gap: 14 }}>
      <Field label={t('tag')} value={form.tag} onChangeText={text('tag')} autoCapitalize="characters" />
      <Field label={`${t('name')} (${t('optional')})`} value={form.name ?? ''} onChangeText={text('name')} />
      <Field label={`${t('breed')} (${t('optional')})`} value={form.breed ?? ''} onChangeText={text('breed')} />
      <Choice label={t('sex')} value={form.sex} options={[{ value: 'FEMALE', label: t('female') }, { value: 'MALE', label: t('male') }]} onChange={set('sex')} />
      {isNew ? (
        <>
          <Choice label={t('startingStatus')} value={status} options={ANIMAL_STATUSES.filter((s) => s !== 'SOLD' && s !== 'DECEASED').map((s) => ({ value: s, label: t(`s_${s}`) }))} onChange={setStatus} />
          <DateField label={t('startingStatusDate')} value={statusDate} onChange={setStatusDate} />
        </>
      ) : null}
      <DateField label={`${t('birthDate')} (${t('optional')})`} value={form.birthDate ?? null} onChange={set('birthDate')} allowEmpty />
      <Toggle label={t('birthDateEstimated')} value={form.birthDateEstimated} onChange={set('birthDateEstimated')} />
      <DateField label={`${t('purchaseDate')} (${t('optional')})`} value={form.purchaseDate ?? null} onChange={set('purchaseDate')} allowEmpty />
      <Field label={`${t('purchasePrice')} (${t('optional')})`} value={price} onChangeText={setPrice} keyboardType="numeric" />
      <Field label={`${t('notes')} (${t('optional')})`} value={form.notes ?? ''} onChangeText={text('notes')} multiline />

      <Row>
        {newPhoto ? <Image source={{ uri: newPhoto.uri }} style={{ width: 96, height: 96, borderRadius: 12 }} /> : null}
        {showExisting ? <AnimalPhoto photoId={photoId!} tag={form.tag} size={96} /> : null}
      </Row>
      <Row style={{ flexWrap: 'wrap' }}>
        <Button title={t('takePhoto')} variant="secondary" onPress={() => choose('camera')} />
        <Button title={t('choosePhoto')} variant="secondary" onPress={() => choose('library')} />
        {newPhoto || showExisting ? (
          <Button title={t('removePhoto')} variant="ghost" onPress={() => { setNewPhoto(null); setRemovePhoto(true); }} />
        ) : null}
      </Row>
      {error ? <Notice tone="bad" text={error} /> : null}
      <Button title={saving ? t('saving') : t('save')} onPress={submit} busy={saving} disabled={!form.tag.trim()} />
    </View>
  );
}
