import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { LocalRecord, Row } from '../sync/repo';
import { local } from './db';

/** Run a query against the phone database and re-run it whenever local data changes. */
export function useLocalQuery<T>(query: () => Promise<T>, deps: unknown[] = []): { data: T | undefined; reload: () => void } {
  const [data, setData] = useState<T>();
  const q = useRef(query);
  q.current = query;
  const reload = useCallback(() => {
    q.current().then(setData).catch((e) => console.warn('query failed', e));
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, deps);
  useEffect(() => local().repo.subscribe(() => reload()), [reload]);
  useFocusEffect(reload);
  return { data, reload };
}

/** Map of user id to display name, from the synced user list. */
export function useUserNames() {
  const { data } = useLocalQuery(() => local().repo.list<Row>('User', { includeDeleted: true }));
  return new Map((data ?? []).map((u: LocalRecord) => [u.id, u.data.name as string]));
}
