import type { AuditEntry, LoginResponse, MeResponse, Mutation, PullResponse, PushResponse, UserSummary } from '@dairy/shared';
import { File } from 'expo-file-system';
import { AuthError, OfflineError, type SyncApi } from '../sync/engine';
import { getServerUrl, saveSession, type StoredSession } from './settings';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Talks to the backend. Keeps the login tokens, renews the short-lived access token
 * automatically, and turns "no internet" into OfflineError so callers can tell.
 */
class Api implements SyncApi {
  baseUrl = '';
  session: StoredSession | null = null;
  onSessionChange?: (s: StoredSession | null) => void;
  private refreshing: Promise<void> | null = null;

  async init(session: StoredSession | null) {
    this.baseUrl = await getServerUrl();
    this.session = session;
  }

  private async raw(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
    if (!this.baseUrl) throw new OfflineError('No server address');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20_000);
    try {
      return await fetch(`${this.baseUrl}${path}`, { ...init, signal: ctrl.signal });
    } catch {
      throw new OfflineError('Cannot reach server');
    } finally {
      clearTimeout(timer);
    }
  }

  async request<T>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
    const auth = opts.auth ?? true;
    const send = () =>
      this.raw(path, {
        method: opts.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(auth && this.session ? { Authorization: `Bearer ${this.session.accessToken}` } : {}),
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      });
    let res = await send();
    if (res.status === 401 && auth && this.session) {
      await this.refresh();
      res = await send();
    }
    if (res.status === 401 && auth) throw new AuthError('Login expired');
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message ?? `Error ${res.status}`;
      throw new ApiError(res.status, msg);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  }

  /** Get a new access token with the refresh token (only one refresh at a time). */
  private refresh(): Promise<void> {
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const s = this.session;
        if (!s) throw new AuthError('Not logged in');
        const res = await this.raw('/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: s.refreshToken }),
        });
        if (res.status === 401) throw new AuthError('Login expired');
        if (!res.ok) throw new OfflineError('Server problem');
        const data: LoginResponse = await res.json();
        await this.setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken, me: data.user });
      })().finally(() => {
        this.refreshing = null;
      });
    }
    return this.refreshing;
  }

  async setSession(s: StoredSession | null) {
    this.session = s;
    await saveSession(s);
    this.onSessionChange?.(s);
  }

  // ----- auth -----
  async checkServer(url?: string) {
    if (url !== undefined) this.baseUrl = url.trim().replace(/\/+$/, '');
    return this.request<{ needsSetup: boolean }>('/auth/status', { auth: false });
  }
  login(username: string, password: string) {
    return this.request<LoginResponse>('/auth/login', { method: 'POST', body: { username, password, deviceName: 'Android' }, auth: false });
  }
  setup(body: { setupCode: string; name: string; username: string; password: string }) {
    return this.request<LoginResponse>('/auth/setup', { method: 'POST', body: { ...body, deviceName: 'Android' }, auth: false });
  }
  async logout() {
    const s = this.session;
    if (s) await this.request('/auth/logout', { method: 'POST', body: { refreshToken: s.refreshToken }, auth: false }).catch(() => undefined);
  }
  me() {
    return this.request<MeResponse>('/auth/me');
  }
  setLanguage(language: 'ur' | 'en') {
    return this.request<MeResponse>('/auth/me', { method: 'PATCH', body: { language } });
  }
  changePassword(current: string, next: string) {
    return this.request<void>('/auth/password', { method: 'POST', body: { current, next } });
  }

  // ----- users (owner) -----
  users() {
    return this.request<UserSummary[]>('/users');
  }
  createUser(body: object) {
    return this.request<UserSummary>('/users', { method: 'POST', body });
  }
  updateUser(id: string, body: object) {
    return this.request<UserSummary>(`/users/${id}`, { method: 'PATCH', body });
  }
  resetPassword(id: string, password: string) {
    return this.request<void>(`/users/${id}/password`, { method: 'POST', body: { password } });
  }

  history(entity: string, id: string) {
    return this.request<AuditEntry[]>(`/history/${entity}/${id}`);
  }

  // ----- sync -----
  push(mutations: Mutation[]) {
    return this.request<PushResponse>('/sync/push', { method: 'POST', body: { mutations } });
  }
  pull(cursor: string) {
    return this.request<PullResponse>(`/sync/pull?cursor=${encodeURIComponent(cursor)}`);
  }
  async upload(attachmentId: string, localUri: string, contentType: string): Promise<boolean> {
    const file = new File(localUri);
    if (!file.exists) return false;
    const attempt = () =>
      file.upload(`${this.baseUrl}/files/${attachmentId}`, {
        httpMethod: 'PUT',
        mimeType: contentType,
        headers: { Authorization: `Bearer ${this.session?.accessToken ?? ''}`, 'Content-Type': contentType },
      });
    try {
      let r = await attempt();
      if (r.status === 401) {
        await this.refresh();
        r = await attempt();
      }
      return r.status === 204 || r.status === 200;
    } catch {
      throw new OfflineError('Upload failed');
    }
  }
  fileSource(attachmentId: string) {
    return { uri: `${this.baseUrl}/files/${attachmentId}`, headers: { Authorization: `Bearer ${this.session?.accessToken ?? ''}` } };
  }
}

export const api = new Api();
