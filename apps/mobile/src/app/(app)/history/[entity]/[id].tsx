import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { HistoryList } from '../../../../components/HistoryList';
import { Screen } from '../../../../components/ui';
import { fieldLabel } from '../../../../domain/entity-labels';

export default function History() {
  const { entity, id } = useLocalSearchParams<{ entity: string; id: string }>();
  return (
    <Screen>
      <HistoryList entity={entity} id={id} fieldLabel={(f) => fieldLabel(entity, f)} />
    </Screen>
  );
}
