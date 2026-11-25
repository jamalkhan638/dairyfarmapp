import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { Body, Button, Card, Muted, Notice, Section } from './ui';

type Status = Awaited<ReturnType<typeof api.backupStatus>>;

/** Owner only: when the last backup worked, a warning if it is old or failed, and "Back up now". Needs internet. */
export function BackupCard() {
  const { t } = useTranslation();
  const [s, setS] = useState<Status | null>(null);
  const [offline, setOffline] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(() => {
    api.backupStatus().then((x) => { setS(x); setOffline(false); }).catch(() => setOffline(true));
  }, []);
  useEffect(load, [load]);

  const old = s?.lastSuccess ? Date.now() - Date.parse(s.lastSuccess) > 36 * 3600_000 : false;
  const failedAfter = s?.lastError && (!s.lastSuccess || s.lastError > s.lastSuccess);
  return (
    <Card>
      <Section>{t('backups')}</Section>
      {offline ? <Notice tone="warn" text={t('onlineOnly')} /> : null}
      {s && !s.available ? <Muted>{t('backupNotConnected')}</Muted> : null}
      {s?.available ? (
        <>
          <Body>{s.lastSuccess ? t('lastBackup', { time: formatDateTime(s.lastSuccess) }) : t('noBackupYet')}</Body>
          {failedAfter ? <Notice tone="bad" text={t('backupFailed', { time: formatDateTime(s.lastError!.split(' ')[0]) })} /> : null}
          {old && !failedAfter ? <Notice tone="warn" text={t('backupOld')} /> : null}
          {s.latest.map((f) => <Muted key={f.name}>{f.name} · {(f.sizeBytes / 1024 / 1024).toFixed(1)} MB</Muted>)}
          {msg ? <Notice text={msg} /> : null}
          <Button
            title={t('backupNow')}
            variant="secondary"
            disabled={s.requested}
            onPress={async () => {
              try {
                await api.requestBackup();
                setMsg(t('backupRequested'));
                setTimeout(load, 45_000);
                load();
              } catch {
                setMsg(t('onlineOnly'));
              }
            }}
          />
        </>
      ) : null}
      <Muted>{t('backupHelp')}</Muted>
    </Card>
  );
}
