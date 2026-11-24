import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSync } from '../lib/sync';
import { formatDateTime } from '../lib/format';
import { colors, font, space } from '../lib/theme';

/** Always-visible line showing online/offline and what is waiting to sync. Tap for details. */
export function SyncBar() {
  const { t } = useTranslation();
  const router = useRouter();
  const { status, online } = useSync();

  let tone: 'good' | 'warn' | 'bad' | 'info' = 'good';
  const lines: string[] = [];
  if (!online || status.phase === 'offline') {
    tone = 'warn';
    lines.push(t('offline'));
  } else if (status.phase === 'syncing') {
    tone = 'info';
    lines.push(t('syncing'));
  } else if (status.phase === 'login_required') {
    tone = 'bad';
    lines.push(t('sessionExpired'));
  } else if (status.phase === 'error') {
    tone = 'bad';
    lines.push(t('syncError', { msg: status.lastError ?? '' }));
  }
  if (status.conflicts) {
    tone = 'bad';
    lines.push(t('conflictsCount', { count: status.conflicts }));
  }
  if (status.rejected) {
    tone = 'bad';
    lines.push(t('rejectedCount', { count: status.rejected }));
  }
  if (status.pending) lines.push(t('waiting', { count: status.pending }));
  if (status.uploads) lines.push(t('uploadsWaiting', { count: status.uploads }));
  if (!lines.length) lines.push(status.lastSyncAt ? `${t('allSynced')} · ${formatDateTime(status.lastSyncAt)}` : t('neverSynced'));

  const bg = { good: colors.primaryLight, warn: colors.warnLight, bad: colors.dangerLight, info: colors.infoLight }[tone];
  const fg = { good: colors.primaryDark, warn: colors.warn, bad: colors.danger, info: colors.info }[tone];
  return (
    <Pressable onPress={() => router.push('/sync')} style={[st.bar, { backgroundColor: bg }]} accessibilityRole="button" accessibilityLabel={t('syncDetails')}>
      <View style={[st.dot, { backgroundColor: fg }]} />
      <Text style={[st.text, { color: fg }]} numberOfLines={2}>
        {lines.join(' · ')}
      </Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(4), paddingVertical: space(2), minHeight: 40 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { fontSize: font.small, fontWeight: '600', flexShrink: 1, textAlign: 'left' },
});
