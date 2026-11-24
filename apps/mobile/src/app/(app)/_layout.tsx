import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../lib/session';
import { SyncProvider } from '../../lib/sync';
import { colors } from '../../lib/theme';

/** Everything behind login. Sync runs while any of these screens is open. */
export default function AppLayout() {
  const { t } = useTranslation();
  const { ready, me } = useSession();
  if (ready && !me) return <Redirect href="/login" />;
  return (
    <SyncProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="home" options={{ title: t('appName') }} />
        <Stack.Screen name="animals/index" options={{ title: t('animals') }} />
        <Stack.Screen name="animals/new" options={{ title: t('addAnimal') }} />
        <Stack.Screen name="animals/[id]/index" options={{ title: t('animal') }} />
        <Stack.Screen name="animals/[id]/edit" options={{ title: t('editAnimal') }} />
        <Stack.Screen name="animals/[id]/status" options={{ title: t('changeStatus') }} />
        <Stack.Screen name="sync" options={{ title: t('syncDetails') }} />
        <Stack.Screen name="conflict/[id]" options={{ title: t('conflict') }} />
        <Stack.Screen name="history/[entity]/[id]" options={{ title: t('history') }} />
        <Stack.Screen name="settings/index" options={{ title: t('settings') }} />
        <Stack.Screen name="settings/users/index" options={{ title: t('users') }} />
        <Stack.Screen name="settings/users/[id]" options={{ title: t('editUser') }} />
      </Stack>
    </SyncProvider>
  );
}
