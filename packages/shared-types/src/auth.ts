// Auth 契约（P0，与 docs/auth-design.md 一致）

export const USER_ROLES = ['child', 'parent', 'teacher'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** 对外暴露的用户信息（不含密码哈希） */
export interface PublicUser {
  id: string;
  username: string;
  role: UserRole;
  familyId: string | null;
}

/** 认证失败 reason 常量（两端共用，按 reason 分支 UI） */
export const AUTH_REASON = {
  INVALID_CREDENTIALS: 'invalid_credentials',
  USERNAME_TAKEN: 'username_taken',
  MISSING_TOKEN: 'missing_token',
  INVALID_TOKEN: 'invalid_token',
  REFRESH_REUSED: 'refresh_reused',
  REFRESH_INVALID: 'refresh_invalid',
  REFRESH_EXPIRED: 'refresh_expired',
  UNAUTHORIZED: 'unauthorized',
} as const;
export type AuthReason = (typeof AUTH_REASON)[keyof typeof AUTH_REASON];

/** 通道标识：Web 省略；Mobile 必须带 X-Auth-Channel: mobile */
export const AUTH_CHANNEL_HEADER = 'x-auth-channel';
export const AUTH_CHANNEL_MOBILE = 'mobile';

// ---- DTO ----

export interface RegisterRequest {
  username: string;
  password: string;
  role?: UserRole;
}

export interface RegisterResponse {
  user: PublicUser;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  /** 仅 Mobile 通道返回；Web 走 httpOnly Cookie */
  refreshToken?: string;
  user: PublicUser;
}

export interface RefreshResponse {
  accessToken: string;
  /** 仅 Mobile 通道返回 */
  refreshToken?: string;
}

export interface AuthMeResponse {
  user: PublicUser;
}
