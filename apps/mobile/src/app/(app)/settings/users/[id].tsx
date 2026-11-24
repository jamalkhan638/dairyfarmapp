import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ACTIONS, MODULES, emptyPermissionMap, type PermissionMap, type Role } from '@dairy/shared';
import { api } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { Body, Button, Card, Choice, Field, Muted, Notice, Row, Screen, Section, Toggle } from '../../../../components/ui';
import { HistoryList } from '../../../../components/HistoryList';

/** Create a user (id = "new") or change a user's name, role, access and password. */
export default function UserEdit() {
  const { t } = useTranslation();
  const router = useRouter();
  const nav = useNavigation();
  const { me } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('WORKER');
  const [active, setActive] = useState(true);
  const [perms, setPerms] = useState<PermissionMap>(emptyPermissionMap());
  const [msg, setMsg] = useState<{ tone: 'info' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    nav.setOptions({ title: isNew ? t('addUser') : t('editUser') });
    if (isNew) return;
    api.users().then((all) => {
      const u = all.find((x) => x.id === id);
      if (!u) return;
      setName(u.name);
      setUsername(u.username);
      setRole(u.role);
      setActive(u.active);
      setPerms(u.permissions);
    }).catch(() => setMsg({ tone: 'bad', text: t('onlineOnly') }));
  }, [id, isNew, nav, t]);

  const toggle = (m: keyof PermissionMap, a: (typeof ACTIONS)[number], v: boolean) =>
    setPerms((p) => {
      const next = { ...p[m], [a]: v };
      if (a !== 'view' && v) next.view = true; // adding/editing needs seeing
      if (a === 'view' && !v) Object.assign(next, { add: false, edit: false, delete: false });
      return { ...p, [m]: next };
    });

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (isNew) {
        await api.createUser({ name, username, password, role, permissions: perms });
        router.back();
      } else {
        await api.updateUser(id, { name, role, active, permissions: perms });
        if (password) await api.resetPassword(id, password);
        setPassword('');
        setMsg({ tone: 'info', text: t('userSaved') });
      }
    } catch (e) {
      setMsg({ tone: 'bad', text: (e as Error).message || t('onlineOnly') });
    } finally {
      setBusy(false);
    }
  };

  const self = id === me?.id;
  return (
    <Screen footer={<Button title={t('save')} onPress={save} busy={busy} disabled={!name || (isNew && (!username || password.length < 6))} />}>
      <Field label={t('name')} value={name} onChangeText={setName} />
      <Field label={t('username')} value={username} onChangeText={setUsername} editable={isNew} autoCapitalize="none" autoCorrect={false} />
      <Field label={isNew ? t('password') : `${t('resetPassword')} (${t('optional')})`} value={password} onChangeText={setPassword} secureTextEntry />
      {!self ? <Choice label={t('role')} value={role} options={[{ value: 'WORKER', label: t('worker') }, { value: 'OWNER', label: t('owner') }]} onChange={setRole} /> : null}
      {!isNew && !self ? <Toggle label={t('activeAccount')} value={active} onChange={setActive} /> : null}
      {msg ? <Notice tone={msg.tone} text={msg.text} /> : null}

      <Section>{t('permissions')}</Section>
      {role === 'OWNER' ? (
        <Muted>{t('ownerHasAll')}</Muted>
      ) : (
        MODULES.map((m) => (
          <Card key={m}>
            <Body style={{ fontWeight: '700' }}>{t(`m_${m}`)}</Body>
            <Row style={{ flexWrap: 'wrap', gap: 16 }}>
              {ACTIONS.map((a) => (
                <View key={a} style={{ minWidth: 120 }}>
                  <Toggle label={t(`p${a[0].toUpperCase()}${a.slice(1)}` as 'pView')} value={perms[m][a]} onChange={(v) => toggle(m, a, v)} />
                </View>
              ))}
            </Row>
          </Card>
        ))
      )}
      {!isNew ? (
        <>
          <Section>{t('history')}</Section>
          <HistoryList entity="User" id={id} fieldLabel={(f) => (f === 'permissions' ? t('permissions') : f === 'active' ? t('activeAccount') : f === 'role' ? t('role') : f === 'name' ? t('name') : f)} />
        </>
      ) : null}
    </Screen>
  );
}
