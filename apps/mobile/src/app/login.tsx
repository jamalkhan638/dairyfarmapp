import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { OfflineError } from '../sync/engine';
import { getServerUrl, setServerUrl } from '../lib/settings';
import { LanguagePicker } from '../components/LanguagePicker';
import { useSession } from '../lib/session';
import { Button, Field, Muted, Notice, Title, s } from '../components/ui';

export default function Login() {
  const { t } = useTranslation();
  const router = useRouter();
  const { login } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('');
  const [showServer, setShowServer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverMsg, setServerMsg] = useState<{ ok: boolean; needsSetup?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getServerUrl().then((u) => {
      setServer(u);
      if (!u) setShowServer(true);
    });
  }, []);

  const check = async () => {
    setServerMsg(null);
    try {
      await setServerUrl(server);
      const st = await api.checkServer(server);
      setServerMsg({ ok: true, needsSetup: st.needsSetup });
    } catch {
      setServerMsg({ ok: false });
    }
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      await setServerUrl(server);
      api.baseUrl = server.trim().replace(/\/+$/, '');
      const r = await login(username, password);
      if (r === 'other_user_pending') setError(t('otherUserPending'));
      else router.replace('/home');
    } catch (e) {
      setError(e instanceof OfflineError ? t('needsInternetFirstLogin') : (e as Error).message || t('loginFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.screen}>
      <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[s.content, { paddingTop: 48 }]} keyboardShouldPersistTaps="handled">
          <Title>🐄 {t('appName')}</Title>
          <LanguagePicker />
          <Field label={t('username')} value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
          <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry />
          {error ? <Notice tone="bad" text={error} /> : null}
          <Button title={t('login')} onPress={submit} busy={busy} disabled={!username || !password || !server} />
          <Button title={t('serverSettings')} variant="ghost" onPress={() => setShowServer((v) => !v)} />
          {showServer ? (
            <View style={{ gap: 12 }}>
              <Field label={t('serverAddress')} value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://farm.example.com/api" />
              <Button title={t('checkServer')} variant="secondary" onPress={check} disabled={!server} />
              {serverMsg ? <Notice tone={serverMsg.ok ? 'info' : 'bad'} text={serverMsg.ok ? t('serverOk') : t('serverFail')} /> : null}
              {serverMsg?.needsSetup ? <Button title={t('firstSetup')} onPress={() => router.push('/setup')} /> : null}
              <Muted>{t('setupHelp')}</Muted>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
