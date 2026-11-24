import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '../lib/session';
import { Button, Field, Muted, Notice, Title, s } from '../components/ui';

/** First run only: create the owner account. */
export default function Setup() {
  const { t } = useTranslation();
  const router = useRouter();
  const { setup } = useSession();
  const [f, setF] = useState({ setupCode: '', name: '', username: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await setup(f);
      router.replace('/home');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Title>{t('createOwner')}</Title>
        <Muted>{t('setupHelp')}</Muted>
        <Field label={t('setupCode')} value={f.setupCode} onChangeText={set('setupCode')} autoCapitalize="none" />
        <Field label={t('name')} value={f.name} onChangeText={set('name')} />
        <Field label={t('username')} value={f.username} onChangeText={set('username')} autoCapitalize="none" autoCorrect={false} />
        <Field label={t('password')} value={f.password} onChangeText={set('password')} secureTextEntry />
        {error ? <Notice tone="bad" text={error} /> : null}
        <Button title={t('createOwner')} onPress={submit} busy={busy} disabled={!f.setupCode || !f.name || !f.username || f.password.length < 6} />
      </ScrollView>
    </SafeAreaView>
  );
}
