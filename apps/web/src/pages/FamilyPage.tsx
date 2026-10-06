import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FAMILY_REASON } from '@huahua/shared-types';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Panel, PanelHeader } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Skeleton } from '../components/ui/skeleton';
import { useUser } from '../hooks/use-user';
import { authApi } from '../lib/api/auth';
import { ApiError } from '../lib/api/client';
import { familyApi } from '../lib/api/family';
import { setUser } from '../store/auth';

const REASON_TEXT: Record<string, string> = {
  [FAMILY_REASON.ALREADY_IN_FAMILY]: '你已经在家庭中了',
  [FAMILY_REASON.PARENT_REQUIRED]: '只有家长账号可以创建家庭',
  [FAMILY_REASON.INVALID_CODE]: '邀请码不存在，请核对家长用户名',
  [FAMILY_REASON.CODE_NOT_PARENT]: '该邀请码不是家长账号',
  [FAMILY_REASON.CODE_OWNER_NO_FAMILY]: '该家长还没有创建家庭',
  [FAMILY_REASON.CANNOT_JOIN_SELF]: '不能加入自己创建的家庭',
};

const ROLE_LABEL: Record<string, string> = { parent: '家长', child: '孩子', teacher: '教师' };

// 家庭设置（P2 补的正式入口；替代 P1 用 SQL 直接改 family_id）
export function FamilyPage() {
  const user = useUser();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const familyQuery = useQuery({ queryKey: ['family'], queryFn: () => familyApi.me() });

  /** 家庭变更后：刷新会话用户（familyId）+ 家庭数据 */
  async function refreshIdentity(): Promise<void> {
    const me = await authApi.me();
    setUser(me.user);
    await queryClient.invalidateQueries({ queryKey: ['family'] });
  }

  function onError(err: unknown): void {
    if (err instanceof ApiError) setError(REASON_TEXT[err.reason ?? ''] ?? err.message);
    else setError(err instanceof Error ? err.message : '操作失败');
  }

  const createMutation = useMutation({
    mutationFn: () => familyApi.create(),
    onSuccess: refreshIdentity,
    onError,
  });

  const joinMutation = useMutation({
    mutationFn: (value: string) => familyApi.join(value),
    onSuccess: refreshIdentity,
    onError,
  });

  const family = familyQuery.data;
  const busy = createMutation.isPending || joinMutation.isPending;

  async function onCopy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (familyQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader>👨‍👩‍👧 我的家庭</PanelHeader>

        {!family?.familyId ? (
          <div className="space-y-4">
            <p className="text-sm text-inkSoft">
              加入家庭后，家长才能给孩子布置任务、确认完成；孩子也要在同一家庭里才能看到任务。
            </p>

            {user?.role === 'parent' ? (
              <div className="border-2 border-ink bg-panelLight p-3">
                <p className="text-sm font-bold">我是家长：创建家庭</p>
                <p className="mt-1 text-xs text-inkSoft">
                  创建后你的用户名就是家庭邀请码，把它告诉孩子（或其他家长）即可加入。
                </p>
                <Button className="mt-2" disabled={busy} onClick={() => { setError(null); createMutation.mutate(); }}>
                  {createMutation.isPending ? '创建中…' : '创建家庭'}
                </Button>
              </div>
            ) : null}

            <form
              className="border-2 border-ink bg-panelLight p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!code.trim()) {
                  setError('请输入家长用户名');
                  return;
                }
                setError(null);
                joinMutation.mutate(code.trim());
              }}
            >
              <Label htmlFor="family-code">加入家庭（输入家长用户名）</Label>
              <Input
                id="family-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="如 mama"
              />
              <Button type="submit" variant="ok" className="mt-2" disabled={busy}>
                {joinMutation.isPending ? '加入中…' : '加入家庭'}
              </Button>
            </form>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-inkSoft">家庭邀请码</span>
              <Badge variant="ink">{family.inviteCode ?? '（创建者账号已不存在）'}</Badge>
              {family.inviteCode && (
                <Button size="sm" variant="ghost" onClick={() => void onCopy(family.inviteCode!)}>
                  {copied ? '已复制' : '复制'}
                </Button>
              )}
            </div>
            <p className="text-xs text-inkSoft">把邀请码告诉家人，让他们在登录后「加入家庭」。</p>

            <div>
              <p className="mb-1 text-xs font-bold text-inkSoft">成员 {family.members.length} 人</p>
              <ul className="divide-y-2 divide-ink/20 border-2 border-ink bg-panelLight">
                {family.members.map((member) => (
                  <li key={member.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="font-bold">
                      {member.username}
                      {member.isSelf ? <span className="ml-1 text-xs text-inkSoft">（我）</span> : null}
                    </span>
                    <Badge variant={member.role === 'parent' ? 'accent' : 'soft'}>
                      {ROLE_LABEL[member.role] ?? member.role}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {error && <p className="mt-3 border-2 border-danger bg-panelLight px-2 py-1 text-sm font-bold text-danger">{error}</p>}
      </Panel>

      <Link to="/" className="inline-block text-sm font-bold text-inkSoft hover:text-ink">
        ← 返回今日
      </Link>
    </div>
  );
}
