import { useSyncExternalStore } from 'react';
import { getSession, SessionState, subscribe } from '../store/auth';

/** 订阅会话态（boot / authed / anon），供路由守卫与 HUD 使用 */
export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSession, getSession);
}
