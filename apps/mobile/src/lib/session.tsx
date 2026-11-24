import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { can as canDo, type Action, type MeResponse, type ModuleName } from '@dairy/shared';
import { api } from './api';
import { loadSession, type StoredSession } from './settings';
import { openLocal, prepareForUser, setSyncUser } from './db';

interface SessionValue {
  ready: boolean;
  me: MeResponse | null;
  login(username: string, password: string): Promise<'ok' | 'other_user_pending'>;
  setup(body: { setupCode: string; name: string; username: string; password: string }): Promise<'ok' | 'other_user_pending'>;
  logout(): Promise<void>;
  refreshMe(): Promise<void>;
  can(module: ModuleName, action: Action): boolean;
  isOwner: boolean;
}

const Ctx = createContext<SessionValue | null>(null);

/**
 * The logged-in person. The session is kept on the phone, so the app opens and
 * works offline; the server re-checks the login and permissions on every sync.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    (async () => {
      const s = await loadSession();
      await api.init(s);
      await openLocal();
      api.onSessionChange = (next: StoredSession | null) => setMe(next?.me ?? null);
      setSyncUser(s?.me.id ?? null);
      setMe(s?.me ?? null);
      setReady(true);
    })();
  }, []);

  const start = useCallback(async (res: { accessToken: string; refreshToken: string; user: MeResponse }) => {
    const ok = await prepareForUser(res.user.id);
    if (ok !== 'ok') return ok;
    await api.setSession({ accessToken: res.accessToken, refreshToken: res.refreshToken, me: res.user });
    setSyncUser(res.user.id);
    return ok;
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      me,
      isOwner: me?.role === 'OWNER',
      can: (module, action) => (me ? canDo(me.role, me.permissions, module, action) : false),
      login: async (u, p) => start(await api.login(u, p)),
      setup: async (b) => start(await api.setup(b)),
      logout: async () => {
        await api.logout();
        await api.setSession(null);
        setSyncUser(null);
      },
      refreshMe: async () => {
        const fresh = await api.me();
        if (api.session) await api.setSession({ ...api.session, me: fresh });
      },
    }),
    [ready, me, start],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
