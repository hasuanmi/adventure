// 会话态（P2 修正）
//
// 原实现：access token 仅存内存、无启动 bootstrap、无 401 续期 → 浏览器刷新即登出。
// 现实现：模块级 store + 订阅（useSyncExternalStore），启动时用 httpOnly Refresh Cookie 换新 access token。
// 约定不变（docs/client-architecture.md §6）：Access Token 不进 localStorage，Refresh 走 httpOnly Cookie。
import { PublicUser } from '@huahua/shared-types';

export type SessionStatus = 'booting' | 'authed' | 'anon';

export interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  user: PublicUser | null;
}

let state: SessionState = { status: 'booting', accessToken: null, user: null };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** useSyncExternalStore 订阅入口 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSession(): SessionState {
  return state;
}

export function getAccessToken(): string | null {
  return state.accessToken;
}

/** 登录成功：写入用户 + token */
export function setSession(user: PublicUser, accessToken: string): void {
  state = { status: 'authed', accessToken, user };
  emit();
}

/** 仅更新用户信息（如加入家庭后刷新 /auth/me） */
export function setUser(user: PublicUser): void {
  state = { ...state, user, status: 'authed' };
  emit();
}

/** 仅更新 access token（续期用，保持用户信息） */
export function setAccessToken(accessToken: string): void {
  state = { ...state, accessToken };
  emit();
}

/** 登出 / 续期失败：清空会话 */
export function clearSession(): void {
  state = { status: 'anon', accessToken: null, user: null };
  emit();
}
