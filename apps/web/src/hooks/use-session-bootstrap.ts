import { useEffect } from 'react';
import { authApi } from '../lib/api/auth';
import { ensureRefreshed } from '../lib/api/client';
import { clearSession, getAccessToken, getSession, setSession } from '../store/auth';

/**
 * 应用启动引导：用 httpOnly Refresh Cookie 换新 access token，再拉取当前用户。
 * 失败（无 Cookie / 已过期 / 已撤销）→ 匿名态，由路由守卫跳登录。
 *
 * 注意：必须用 `ensureRefreshed()` 而不是 `authApi.refresh()` —— 前者会把新 token
 * 写进 store，后者只返回响应体。之前用后者，导致紧接着的 `/auth/me` 不带
 * Authorization 而 401，又被下面的 catch 当成"未登录"清掉会话，于是
 * **整页刷新仍然会登出**（该问题由真实浏览器检查发现，非 typecheck 能覆盖）。
 */
export function useSessionBootstrap(): void {
  useEffect(() => {
    if (getSession().status !== 'booting') return;
    let cancelled = false;
    void (async () => {
      try {
        const refreshed = await ensureRefreshed();
        if (!refreshed) {
          if (!cancelled) clearSession();
          return;
        }
        const me = await authApi.me();
        const token = getAccessToken();
        if (cancelled) return;
        if (!token) {
          clearSession();
          return;
        }
        setSession(me.user, token);
      } catch {
        if (!cancelled) clearSession();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
