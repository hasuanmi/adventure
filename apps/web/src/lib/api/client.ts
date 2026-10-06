import { ApiError, toApiError } from '@huahua/shared-types';
import { clearSession, getAccessToken, setAccessToken } from '../../store/auth';

/** Web API 基址：开发走 vite 代理 /api，生产同域 */
export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

/** 续期单飞：并发多个 401 只触发一次 /auth/refresh */
let refreshInFlight: Promise<boolean> | null = null;

/**
 * 用 httpOnly Refresh Cookie 换新 access token。
 * 返回是否续期成功；失败不抛异常（由调用方决定清会话/跳登录）。
 */
export function ensureRefreshed(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) return false;
        const body = (await res.json()) as { accessToken?: string };
        if (!body.accessToken) return false;
        setAccessToken(body.accessToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(options.headers);
  const accessToken = getAccessToken();
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include', // Web：携带 httpOnly Refresh Cookie
  });

  // access token 过期（30m）→ 静默续期一次后重放原请求；续期失败则清会话交由路由跳登录
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await ensureRefreshed()) {
      return request<T>(path, options, false);
    }
    clearSession();
  }

  if (res.status === 204) return undefined as T;
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

export { ApiError };
