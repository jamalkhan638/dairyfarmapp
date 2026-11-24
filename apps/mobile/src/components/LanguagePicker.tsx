import React from 'react';
import { useTranslation } from 'react-i18next';
import { switchLanguage } from '../lib/language';
import { Choice } from './ui';

/** Urdu / English. Switching between them restarts the app once to flip the layout direction. */
export function LanguagePicker() {
  const { t, i18n } = useTranslation();
  return (
    <Choice
      label={t('language')}
      value={i18n.language as 'ur' | 'en'}
      options={[{ value: 'ur', label: 'اردو' }, { value: 'en', label: 'English' }]}
      onChange={(l) => switchLanguage(l)}
    />
  );
}
