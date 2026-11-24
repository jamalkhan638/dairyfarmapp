import { DevSettings, I18nManager } from 'react-native';
import * as Updates from 'expo-updates';
import i18n from './i18n';
import { getLanguage, setLanguageSetting } from './settings';

async function reload() {
  try {
    await Updates.reloadAsync();
  } catch {
    DevSettings.reload();
  }
}

/**
 * Urdu is right-to-left. React Native can only flip the layout direction on a
 * restart, so changing between Urdu and English restarts the app once.
 */
export async function applyStoredLanguage(): Promise<boolean> {
  const lang = (await getLanguage()) ?? 'ur';
  await i18n.changeLanguage(lang);
  const wantRTL = lang === 'ur';
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL !== wantRTL) {
    I18nManager.forceRTL(wantRTL);
    await reload();
    return false;
  }
  return true;
}

export async function switchLanguage(lang: 'ur' | 'en') {
  await setLanguageSetting(lang);
  await i18n.changeLanguage(lang);
  const wantRTL = lang === 'ur';
  if (I18nManager.isRTL !== wantRTL) {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(wantRTL);
    await reload();
  }
}
