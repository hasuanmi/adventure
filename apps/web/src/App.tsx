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
import { LearningPage } from './pages/LearningPage';
import { AiRecognizePage, WrongQuestionUploadPage } from './pages/WrongQuestionUploadPage';
import { WrongQuestionDetailPage } from './pages/WrongQuestionDetailPage';
import { WrongQuestionFormPage } from './pages/WrongQuestionFormPage';
import { WrongQuestionListPage } from './pages/WrongQuestionListPage';
import { WrongQuestionStatsPage } from './pages/WrongQuestionStatsPage';
import { WrongQuestionPrintPage } from './pages/WrongQuestionPrintPage';
import { WrongQuestionPracticePage } from './pages/WrongQuestionPracticePage';
import { KnowledgeTagsPage } from './pages/KnowledgeTagsPage';
import { LoginPage } from './pages/LoginPage';
import { SchedulePage } from './pages/SchedulePage';
import { SubmitCompletePage } from './pages/SubmitCompletePage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { TaskFormPage } from './pages/TaskFormPage';
import { TodayPage } from './pages/TodayPage';
import { TodayBitPage } from './pages/TodayBitPage';
import { TodayComparePage } from './pages/TodayComparePage';
import { UiPreviewPage } from './pages/UiPreviewPage';

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

function withLayout(children: React.ReactNode, variant: 'default' | 'bit' = 'default') {
  return (
    <RequireAuth>
      <AppLayout variant={variant}>{children}</AppLayout>
    </RequireAuth>
  );
}

export function App() {
  useSessionBootstrap();
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* Pixel UI 原型预览（8bitcn 技法验证）：**故意不套 RequireAuth / AppLayout** ——
            它是纯静态设计验证页，无 API / 无会话 / 无业务逻辑，便于直接打开比对。
            ⚠️ 上线前必须删除此路由，或加环境变量门禁。 */}
        <Route path="/ui-preview" element={<UiPreviewPage />} />
        <Route path="/" element={withLayout(<TodayPage />)} />
        {/* 首页改版对比（**评审用，TodayPage 一行未改**）：
            /today-bit      = 新版首页（bit 外壳 + 缺角框 / 分段进度 / 缺角按钮 / 像素字）
            /today-compare  = 一键切换 旧版 ↔ 新版（连顶部 HUD 和底部功能栏一起切）
            ⚠️ 上线前必须删除这两条路由。 */}
        <Route path="/today-bit" element={withLayout(<TodayBitPage />, 'bit')} />
        <Route
          path="/today-compare"
          element={
            <RequireAuth>
              <TodayComparePage />
            </RequireAuth>
          }
        />
        {/* /tasks 列表入口重定向到今日（任务并入今日；子路由保留兼容） */}
        <Route path="/tasks" element={<Navigate to="/" replace />} />
        <Route path="/schedule" element={withLayout(<SchedulePage />)} />
        <Route path="/growth-cards" element={withLayout(<GrowthCardsPage />)} />
        {/* 学习（P6）：学习中心 → AI 解题 / 错题本（对照上游 wrong-notebook 全部功能逐步落地）
            注意顺序：静态子路由必须在 :id 之前，否则 /new 会被当成 id */}
        <Route path="/learning" element={withLayout(<LearningPage />)} />
        <Route path="/learning/ai-recognize" element={withLayout(<AiRecognizePage />)} />
        <Route path="/learning/wrong-questions" element={withLayout(<WrongQuestionListPage />)} />
        <Route path="/learning/wrong-questions/new" element={withLayout(<WrongQuestionUploadPage />)} />
        <Route path="/learning/wrong-questions/manual" element={withLayout(<WrongQuestionFormPage />)} />
        <Route path="/learning/wrong-questions/tags" element={withLayout(<KnowledgeTagsPage />)} />
        <Route path="/learning/wrong-questions/stats" element={withLayout(<WrongQuestionStatsPage />)} />
        <Route path="/learning/wrong-questions/practice" element={withLayout(<WrongQuestionPracticePage />)} />
        <Route path="/learning/wrong-questions/print" element={withLayout(<WrongQuestionPrintPage />)} />
        <Route path="/learning/wrong-questions/:id" element={withLayout(<WrongQuestionDetailPage />)} />
        <Route path="/learning/wrong-questions/:id/edit" element={withLayout(<WrongQuestionFormPage />)} />
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
