import { DevSettings, I18nManager, Platform } from 'react-native';
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
/** Web preview only: the page direction stands in for Android's right-to-left restart. */
function setWebDirection(lang: 'ur' | 'en') {
  if (typeof document !== 'undefined') document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
}

export async function applyStoredLanguage(): Promise<boolean> {
  const lang = (await getLanguage()) ?? 'ur';
  await i18n.changeLanguage(lang);
  if (Platform.OS === 'web') {
    setWebDirection(lang);
    return true;
  }
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
  if (Platform.OS === 'web') return setWebDirection(lang);
  const wantRTL = lang === 'ur';
  if (I18nManager.isRTL !== wantRTL) {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(wantRTL);
    await reload();
  }
}
