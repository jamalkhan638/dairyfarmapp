import React from 'react';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { pickPhoto } from '../lib/photos';
import { AnimalPhoto } from './AnimalPhoto';
import { Button, Label, Row } from './ui';

export interface PhotoState {
  newPhoto: { uri: string; size: number } | null;
  remove: boolean;
}

/** Take/choose/remove a photo (e.g. a receipt). Shows the saved one or the newly picked one. */
export function PhotoPicker({ label, savedId, state, onChange }: { label: string; savedId: string | null; state: PhotoState; onChange: (s: PhotoState) => void }) {
  const { t } = useTranslation();
  const choose = async (src: 'camera' | 'library') => {
    const p = await pickPhoto(src);
    if (p) onChange({ newPhoto: p, remove: false });
  };
  const showSaved = !state.newPhoto && !state.remove && savedId;
  return (
    <>
      <Label>{label}</Label>
      <Row>
        {state.newPhoto ? <Image source={{ uri: state.newPhoto.uri }} style={{ width: 120, height: 120, borderRadius: 12 }} /> : null}
        {showSaved ? <AnimalPhoto photoId={savedId} tag="" size={120} /> : null}
      </Row>
      <Row style={{ flexWrap: 'wrap' }}>
        <Button title={t('takePhoto')} variant="secondary" onPress={() => choose('camera')} />
        <Button title={t('choosePhoto')} variant="secondary" onPress={() => choose('library')} />
        {state.newPhoto || showSaved ? <Button title={t('removePhoto')} variant="ghost" onPress={() => onChange({ newPhoto: null, remove: true })} /> : null}
      </Row>
    </>
  );
}
