import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import type { SyncStatus } from '../sync/engine';
import { local } from './db';
import { useSession } from './session';

const Ctx = createContext<{ status: SyncStatus; online: boolean; syncNow: () => void } | null>(null);

const EMPTY: SyncStatus = { phase: 'idle', pending: 0, conflicts: 0, rejected: 0, uploads: 0, lastSyncAt: null, lastError: null };

/**
 * Runs sync automatically: on opening the app, when internet returns, every minute,
 * and a moment after the user saves something.
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { me, refreshMe } = useSession();
  const [status, setStatus] = useState<SyncStatus>(EMPTY);
  const [online, setOnline] = useState(true);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!me) return;
    const { engine, repo } = local();
    const run = () => {
      engine.sync().then(() => {
        // Permission changes by the owner show up after the next sync.
        if (engine.status.phase === 'idle') refreshMe().catch(() => undefined);
      });
    };
    const unsubStatus = engine.subscribe(setStatus);
    const unsubRepo = repo.subscribe((isLocal) => {
      if (!isLocal) return;
      engine.refresh();
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(run, 1500);
    });
    const net = Network.addNetworkStateListener((s) => {
      const isOn = !!s.isConnected && s.isInternetReachable !== false;
      setOnline(isOn);
      if (isOn) run();
    });
    Network.getNetworkStateAsync().then((s) => setOnline(!!s.isConnected && s.isInternetReachable !== false));
    const app = AppState.addEventListener('change', (st) => st === 'active' && run());
    const timer = setInterval(run, 60_000);
    run();
    return () => {
      unsubStatus();
      unsubRepo();
      net.remove();
      app.remove();
      clearInterval(timer);
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  return <Ctx.Provider value={{ status, online, syncNow: () => local().engine.sync() }}>{children}</Ctx.Provider>;
}

export function useSync() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSync outside SyncProvider');
  return v;
}
