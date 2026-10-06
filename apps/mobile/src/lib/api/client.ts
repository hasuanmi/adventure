import { AUTH_CHANNEL_HEADER, AUTH_CHANNEL_MOBILE, ApiError, toApiError } from '@huahua/shared-types';

/** Mobile API 基址：生产指向公网 API（EXPO_PUBLIC_API_URL），本地开发默认本机 */
export const API_BASE: string = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

// Access Token 仅存内存（与 Web 一致，V1 最小方案）
let accessToken: string | null = null;

export const tokenStore = {
  get: (): string | null => accessToken,
  set: (token: string | null): void => {
    accessToken = token;
  },
};

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    [AUTH_CHANNEL_HEADER]: AUTH_CHANNEL_MOBILE,
    ...((options.headers as Record<string, string> | undefined) ?? {}),
  };
  const token = tokenStore.get();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 204) return undefined as T;
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

export { ApiError };
