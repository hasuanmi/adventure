import { useEffect } from 'react';
import { authApi } from '../lib/api/auth';
import { clearSession, getSession, setSession } from '../store/auth';

/**
 * 应用启动引导：用 httpOnly Refresh Cookie 换新 access token，再拉取当前用户。
 * 失败（无 Cookie / 已过期 / 已撤销）→ 匿名态，由路由守卫跳登录。
 */
export function useSessionBootstrap(): void {
  useEffect(() => {
    if (getSession().status !== 'booting') return;
    let cancelled = false;
    void (async () => {
      try {
        const refreshed = await authApi.refresh();
        const me = await authApi.me();
        if (cancelled) return;
        setSession(me.user, refreshed.accessToken);
      } catch {
        if (!cancelled) clearSession();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
