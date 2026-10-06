import { useSession } from './use-session';

export interface CurrentUser {
  userId: string;
  username: string;
  role: string;
  /** 登录/me 时刻的 familyId（成员变更后以 /family/me 为准） */
  familyId: string | null;
}

/** 客户端当前用户（UI 展示与按钮显隐用；授权以后端为准） */
export function useUser(): CurrentUser | null {
  const { user } = useSession();
  if (!user) return null;
  return { userId: user.id, username: user.username, role: user.role, familyId: user.familyId };
}
