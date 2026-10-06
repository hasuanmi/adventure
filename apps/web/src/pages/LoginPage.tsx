import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AUTH_REASON, ERROR_REASON, UserRole } from '@huahua/shared-types';
import { Button } from '../components/ui/button';
import { Panel } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useSession } from '../hooks/use-session';
import { ApiError } from '../lib/api/client';
import { authApi } from '../lib/api/auth';
import { setSession } from '../store/auth';

type Mode = 'login' | 'register';

// 用户名/密码规则（与 apps/api/src/auth/dto/register.dto.ts 保持一致）
const USERNAME_MIN = 3;
const USERNAME_MAX = 32;
const PASSWORD_MIN = 6;

/** 字段级校验错误 → 中文提示（服务端 fields 里是 class-validator 英文原文） */
const FIELD_HINT: Record<string, string> = {
  username: `用户名需 ${USERNAME_MIN}–${USERNAME_MAX} 个字符`,
  password: `密码需 ${PASSWORD_MIN} 位以上`,
};

/** 把任意异常转成用户能看懂的中文（避免直出 "Bad Request" / "Failed to fetch"） */
function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.reason === ERROR_REASON.VALIDATION_FAILED) {
      const fields = err.body.fields ?? {};
      const hints = Object.keys(fields).map((key) => FIELD_HINT[key] ?? `${key}: ${fields[key]}`);
      return hints.length > 0 ? hints.join('；') : '输入不符合要求，请检查用户名与密码';
    }
    if (err.reason === AUTH_REASON.USERNAME_TAKEN) return '用户名已被占用，换一个吧';
    if (err.reason === AUTH_REASON.INVALID_CREDENTIALS) return '用户名或密码错误';
    return err.reason ?? err.message;
  }
  if (err instanceof Error) {
    if (/failed to fetch|networkerror|load failed/i.test(err.message)) {
      return '连不上服务器：请确认后端已启动（docker compose ps 三个容器应为 Up）';
    }
    return err.message;
  }
  return '请求失败';
}

// 登录 / 注册（像素主题；docs/ui-reference.md §4 登录页）
// 注册后统一由 Today 页的「家庭设置」引导创建/加入家庭（P2 补的正式入口）。
export function LoginPage() {
  const navigate = useNavigate();
  const { status } = useSession();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('child');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (status === 'authed') return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name || !password) {
      setError('请填写用户名和密码');
      return;
    }
    // 前端先按后端同一套规则校验，省一次无谓的 400 往返，并给出中文原因
    if (mode === 'register') {
      if (name.length < USERNAME_MIN) {
        setError(`用户名至少 ${USERNAME_MIN} 个字符（2 个汉字不够，建议用拼音，如 xiaoming）`);
        return;
      }
      if (name.length > USERNAME_MAX) {
        setError(`用户名不能超过 ${USERNAME_MAX} 个字符`);
        return;
      }
      if (password.length < PASSWORD_MIN) {
        setError(`密码至少 ${PASSWORD_MIN} 位`);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'register') {
        await authApi.register({ username: name, password, role });
      }
      const res = await authApi.login({ username: name, password });
      setSession(res.user, res.accessToken);
      navigate('/', { replace: true });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  const tabClass = (active: boolean) =>
    `flex-1 border-2 border-ink px-3 py-2 text-sm font-extrabold shadow-pixel transition active:translate-y-1 ${
      active ? 'bg-accent text-white' : 'bg-panel text-ink'
    }`;

  return (
    <main className="mx-auto max-w-sm px-3 py-10">
      <Panel className="border-2 border-ink bg-ink text-panelLight">
        <h1 className="text-xl font-extrabold tracking-widest" style={{ textShadow: '2px 2px 0 #2c2015' }}>
          ⚔️ 话话成长 · 学习冒险岛
        </h1>
        <p className="mt-1 text-xs text-panelLight/80">家长与孩子的任务 · 日程 · 成长</p>
      </Panel>

      <div className="mt-4 flex gap-2">
        <button type="button" className={tabClass(mode === 'login')} onClick={() => setMode('login')} disabled={busy}>
          登录
        </button>
        <button
          type="button"
          className={tabClass(mode === 'register')}
          onClick={() => setMode('register')}
          disabled={busy}
        >
          注册
        </button>
      </div>

      <Panel className="mt-4">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="username">用户名</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder={mode === 'register' ? '如 xiaoming / mama01（建议拼音）' : '如 xiaoming'}
            />
            {mode === 'register' && (
              <p className="mt-1 text-xs text-inkSoft">
                {USERNAME_MIN}–{USERNAME_MAX} 个字符，登录用。建议用拼音；2 个汉字不够长。
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={mode === 'register' ? `至少 ${PASSWORD_MIN} 位` : '请输入密码'}
            />
            {mode === 'register' && <p className="mt-1 text-xs text-inkSoft">至少 {PASSWORD_MIN} 位，家长和孩子都用它登录。</p>}
          </div>

          {mode === 'register' && (
            <div>
              <Label>身份</Label>
              <div className="flex gap-2">
                {(
                  [
                    { value: 'child', label: '孩子', hint: '完成任务的冒险家' },
                    { value: 'parent', label: '家长', hint: '创建家庭、布置与确认任务' },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRole(option.value as UserRole)}
                    className={`flex-1 border-2 border-ink px-3 py-2 text-left shadow-pixel transition active:translate-y-1 ${
                      role === option.value ? 'bg-accent text-white' : 'bg-panelLight text-ink'
                    }`}
                  >
                    <span className="block text-sm font-extrabold">{option.label}</span>
                    <span className="block text-[11px] opacity-80">{option.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="border-2 border-danger bg-panelLight px-2 py-1 text-sm font-bold text-danger">{error}</p>}

          <Button type="submit" variant="accent" className="w-full" disabled={busy}>
            {busy ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}
          </Button>

          {mode === 'register' && (
            <p className="text-xs text-inkSoft">
              注册后会在首页引导你{role === 'parent' ? '创建家庭（拿到家长用户名作为邀请码）' : '用家长用户名加入家庭'}。
            </p>
          )}
        </form>
      </Panel>
    </main>
  );
}
