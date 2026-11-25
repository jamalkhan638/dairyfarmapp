import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { HistoryList } from '../../../../components/HistoryList';
import { RecordMeta } from '../../../../components/RecordMeta';
import { Section, Screen } from '../../../../components/ui';
import { useLocalQuery } from '../../../../lib/hooks';
import { local } from '../../../../lib/db';
import { entityLabel, recordTitle } from '../../../../domain/entity-labels';
import { useLookups } from '../../../../lib/use-animal-tags';

/** Any record: who added it, who changed it last, and its full change history. */
export default function History() {
  const { entity, id } = useLocalSearchParams<{ entity: string; id: string }>();
  const lookups = useLookups();
  const { data: rec } = useLocalQuery(() => local().repo.get(entity, id), [entity, id]);
  return (
    <Screen>
      {rec ? (
        <>
          <Section>{entityLabel(entity)} {recordTitle(entity, rec.data, lookups)}</Section>
          <RecordMeta data={rec.data} syncState={rec.syncState} />
        </>
      ) : null}
      <HistoryList entity={entity} id={id} />
    </Screen>
  );
}
