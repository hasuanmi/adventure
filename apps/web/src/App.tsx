import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/layout/app-layout';
import { Panel } from './components/ui/card';
import { Spinner } from './components/ui/spinner';
import { useSession } from './hooks/use-session';
import { useSessionBootstrap } from './hooks/use-session-bootstrap';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { FamilyPage } from './pages/FamilyPage';
import { GrowthCardsPage } from './pages/GrowthCardsPage';
import { GrowthPage } from './pages/GrowthPage';
import { LoginPage } from './pages/LoginPage';
import { SchedulePage } from './pages/SchedulePage';
import { SubmitCompletePage } from './pages/SubmitCompletePage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { TaskFormPage } from './pages/TaskFormPage';
import { TodayPage } from './pages/TodayPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

/** 启动引导期间的中性界面（避免用"无 token"直接判定未登录而闪回登录页） */
function BootingScreen() {
  return (
    <div className="mx-auto mt-24 max-w-xs">
      <Panel className="flex items-center gap-3">
        <Spinner />
        <span className="text-sm font-bold">正在恢复登录状态…</span>
      </Panel>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  if (status === 'booting') return <BootingScreen />;
  if (status === 'anon') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function withLayout(children: React.ReactNode) {
  return (
    <RequireAuth>
      <AppLayout>{children}</AppLayout>
    </RequireAuth>
  );
}

export function App() {
  useSessionBootstrap();
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={withLayout(<TodayPage />)} />
        {/* /tasks 列表入口重定向到今日（任务并入今日；子路由保留兼容） */}
        <Route path="/tasks" element={<Navigate to="/" replace />} />
        <Route path="/schedule" element={withLayout(<SchedulePage />)} />
        <Route path="/growth-cards" element={withLayout(<GrowthCardsPage />)} />
        <Route path="/growth" element={withLayout(<GrowthPage />)} />
        <Route path="/approvals" element={withLayout(<ApprovalsPage />)} />
        <Route path="/family" element={withLayout(<FamilyPage />)} />
        <Route path="/tasks/new" element={withLayout(<TaskFormPage />)} />
        <Route path="/tasks/:id/edit" element={withLayout(<TaskFormPage />)} />
        <Route path="/tasks/:id" element={withLayout(<TaskDetailPage />)} />
        <Route path="/tasks/:id/submit" element={withLayout(<SubmitCompletePage />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </QueryClientProvider>
  );
}
