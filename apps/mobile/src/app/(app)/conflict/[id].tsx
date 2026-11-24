import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLocalQuery, useUserNames } from '../../../lib/hooks';
import { local } from '../../../lib/db';
import { useSession } from '../../../lib/session';
import { formatDateTime } from '../../../lib/format';
import { entityLabel, fieldLabel, recordTitle } from '../../../domain/entity-labels';
import { Body, Button, Card, Field, Muted, Notice, Screen, Title } from '../../../components/ui';
import type { ResolveData } from '@dairy/shared';

const show = (v: unknown, empty: string) => (v === null || v === undefined || v === '' ? empty : typeof v === 'boolean' ? (v ? '✓' : '✗') : String(v));

/** Side-by-side view of a conflict; the user decides. Nothing is overwritten until they do. */
export default function ConflictScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const names = useUserNames();
  const { data: rec } = useLocalQuery(() => local().repo.get<any>('SyncConflict', id), [id]);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [newTag, setNewTag] = useState('');

  if (!rec) return <Screen>{null}</Screen>;
  const c = rec.data;
  if (c.status !== 'OPEN') {
    return (
      <Screen>
        <Notice text={t('resolved')} />
        <Button title={t('back')} onPress={() => router.back()} />
      </Screen>
    );
  }

  const mine: Record<string, unknown> = c.mine?.data ?? {};
  const theirs: Record<string, unknown> = c.theirs ?? {};
  const fields = Object.keys(mine).filter((f) => !['initialStatus', 'initialStatusDate', 'initialStatusChangeId'].includes(f));
  const textFields = fields.filter((f) => typeof mine[f] === 'string' || mine[f] === null);
  const decide = async (d: ResolveData) => {
    await local().repo.resolveConflict(me!.id, c.id, d);
    router.back();
  };
  const explain = {
    EDIT: t('conflictExplainEdit'),
    DUPLICATE: t('conflictExplainDuplicate'),
    EDIT_DELETED: t('conflictExplainEditDeleted'),
    DELETE_EDITED: t('conflictExplainDeleteEdited'),
  }[c.type as 'EDIT'];
  const v = c.theirsVersion as number | undefined;

  return (
    <Screen>
      <Title>{entityLabel(c.entity)} {recordTitle(c.entity, c.theirs ?? mine)}</Title>
      <Notice tone="warn" text={explain} />
      {c.theirs ? <Muted>{t('changedBy', { name: names.get(c.theirs.updatedById) ?? t('unknownUser') })} · {formatDateTime(c.theirs.clientUpdatedAt ?? c.theirs.updatedAt)}</Muted> : null}

      {c.type !== 'DELETE_EDITED'
        ? fields.map((f) => (
            <Card key={f}>
              <Body style={{ fontWeight: '700' }}>{fieldLabel(c.entity, f)}</Body>
              <Muted>{t('theirs')}: {show(theirs[f], t('emptyValue'))}</Muted>
              <Body>{t('mine')}: {show(mine[f], t('emptyValue'))}</Body>
            </Card>
          ))
        : null}

      {c.type === 'EDIT' ? (
        <View style={{ gap: 10 }}>
          <Button title={t('useMine')} onPress={() => decide({ action: 'use_mine', theirsVersion: v })} />
          <Button title={t('keepTheirs')} variant="secondary" onPress={() => decide({ action: 'keep_theirs' })} />
          {textFields.length ? (
            <Card>
              <Body style={{ fontWeight: '700' }}>{t('edit')}</Body>
              {textFields.map((f) => (
                <Field key={f} label={fieldLabel(c.entity, f)} value={custom[f] ?? show(mine[f], '')} onChangeText={(x) => setCustom((p) => ({ ...p, [f]: x }))} />
              ))}
              <Button
                title={t('save')}
                variant="secondary"
                onPress={() => decide({ action: 'custom', theirsVersion: v, values: Object.fromEntries(textFields.map((f) => [f, (custom[f] ?? mine[f] ?? '') || null])) })}
              />
            </Card>
          ) : null}
        </View>
      ) : null}

      {c.type === 'DUPLICATE' ? (
        <View style={{ gap: 10 }}>
          <Button title={t('keepTheirs')} onPress={() => decide({ action: 'keep_theirs' })} />
          {c.mine?.op === 'create' && 'tag' in mine ? (
            <Card>
              <Field label={t('newTag')} value={newTag} onChangeText={setNewTag} autoCapitalize="characters" />
              <Button title={t('saveAsNew')} variant="secondary" disabled={!newTag.trim()} onPress={() => decide({ action: 'custom', values: { tag: newTag.trim() } })} />
            </Card>
          ) : null}
          <Button title={t('useMine')} variant="secondary" onPress={() => decide({ action: 'use_mine', theirsVersion: v })} />
        </View>
      ) : null}

      {c.type === 'EDIT_DELETED' ? (
        <View style={{ gap: 10 }}>
          <Button title={t('keepTheirs')} onPress={() => decide({ action: 'keep_theirs' })} />
          <Button title={t('restoreWithMine')} variant="secondary" onPress={() => decide({ action: 'use_mine', theirsVersion: v })} />
        </View>
      ) : null}

      {c.type === 'DELETE_EDITED' ? (
        <View style={{ gap: 10 }}>
          <Button title={t('keepRecord')} onPress={() => decide({ action: 'keep_theirs' })} />
          <Button title={t('deleteAnyway')} variant="danger" onPress={() => decide({ action: 'use_mine', theirsVersion: v })} />
        </View>
      ) : null}
    </Screen>
  );
}
