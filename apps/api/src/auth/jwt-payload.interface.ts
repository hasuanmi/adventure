export interface JwtPayload {
  /** 用户 id（sub） */
  sub: string;
  /** 角色（仅用于最小校验与 UI） */
  role: string;
  /** 唯一 token id */
  jti?: string;
  iat?: number;
  exp?: number;
}
