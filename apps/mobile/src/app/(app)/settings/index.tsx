import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { api } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import { useSync } from '../../../lib/sync';
import { Button, Card, Field, InfoLine, Notice, Screen, Section } from '../../../components/ui';
import { LanguagePicker } from '../../../components/LanguagePicker';

export default function Settings() {
  const { t } = useTranslation();
  const router = useRouter();
  const { me, isOwner, logout } = useSession();
  const { status } = useSync();
  const [pw, setPw] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState<{ tone: 'info' | 'bad'; text: string } | null>(null);

  const doLogout = () => {
    const go = async () => {
      await logout();
      router.replace('/login');
    };
    const unsynced = status.pending + status.conflicts + status.rejected;
    if (unsynced > 0) {
      Alert.alert(t('logout'), t('logoutUnsynced', { count: unsynced }), [{ text: t('cancel'), style: 'cancel' }, { text: t('logout'), style: 'destructive', onPress: go }]);
    } else go();
  };

  const changePw = async () => {
    try {
      await api.changePassword(pw.current, pw.next);
      setPw({ current: '', next: '' });
      setMsg({ tone: 'info', text: t('passwordChanged') });
    } catch (e) {
      setMsg({ tone: 'bad', text: (e as Error).message || t('onlineOnly') });
    }
  };

  return (
    <Screen>
      <Card>
        <InfoLine label={t('name')} value={me?.name} />
        <InfoLine label={t('username')} value={me?.username} />
        <InfoLine label={t('role')} value={me?.role === 'OWNER' ? t('owner') : t('worker')} />
      </Card>
      <LanguagePicker />
      {isOwner ? <Button title={t('users')} onPress={() => router.push('/settings/users')} /> : null}
      <Button title={t('syncDetails')} variant="secondary" onPress={() => router.push('/sync')} />
      <Section>{t('changePassword')}</Section>
      <Field label={t('currentPassword')} value={pw.current} onChangeText={(v) => setPw((p) => ({ ...p, current: v }))} secureTextEntry />
      <Field label={t('newPassword')} value={pw.next} onChangeText={(v) => setPw((p) => ({ ...p, next: v }))} secureTextEntry />
      {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}
      <Button title={t('changePassword')} variant="secondary" onPress={changePw} disabled={!pw.current || pw.next.length < 6} />
      <Button title={t('logout')} variant="danger" onPress={doLogout} />
      <InfoLine label={t('version')} value={Constants.expoConfig?.version ?? ''} />
    </Screen>
  );
}
