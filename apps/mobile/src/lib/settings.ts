import * as NativeSecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Android: the phone's secure storage. Web preview only: the browser's storage. */
const SecureStore =
  Platform.OS === 'web'
    ? {
        getItemAsync: async (k: string) => globalThis.localStorage?.getItem(k) ?? null,
        setItemAsync: async (k: string, v: string) => globalThis.localStorage?.setItem(k, v),
        deleteItemAsync: async (k: string) => globalThis.localStorage?.removeItem(k),
      }
    : NativeSecureStore;

/** Small values kept in the phone's secure storage (survive app restarts). */
const KEYS = { server: 'serverUrl', session: 'session', language: 'language' } as const;

export async function getServerUrl(): Promise<string> {
  return (await SecureStore.getItemAsync(KEYS.server)) ?? (Constants.expoConfig?.extra?.apiUrl as string) ?? '';
}
export async function setServerUrl(url: string) {
  await SecureStore.setItemAsync(KEYS.server, url.trim().replace(/\/+$/, ''));
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  me: import('@dairy/shared').MeResponse;
}
export async function loadSession(): Promise<StoredSession | null> {
  const s = await SecureStore.getItemAsync(KEYS.session);
  return s ? JSON.parse(s) : null;
}
export async function saveSession(s: StoredSession | null) {
  if (s) await SecureStore.setItemAsync(KEYS.session, JSON.stringify(s));
  else await SecureStore.deleteItemAsync(KEYS.session);
}

export async function getLanguage(): Promise<'ur' | 'en' | null> {
  return (await SecureStore.getItemAsync(KEYS.language)) as 'ur' | 'en' | null;
}
export async function setLanguageSetting(l: 'ur' | 'en') {
  await SecureStore.setItemAsync(KEYS.language, l);
}
