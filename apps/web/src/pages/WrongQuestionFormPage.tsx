import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { WrongQuestionForm, type WrongQuestionFormInitial } from '../components/wrong-question-form';

/**
 * 独立表单页（编辑已有错题 / 直接进入录入）。
 * 「上传新题」页的「直接录入」与 AI 识别后的确认**内嵌同一个 WrongQuestionForm 组件**，
 * 因此本页只是它的路由外壳（用户要求：直接录入下面直接就是表单，不用再点一次）。
 */
export function WrongQuestionFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? null) as WrongQuestionFormInitial | null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/learning/wrong-questions" className="text-sm font-bold text-inkSoft hover:text-ink">
          ← 返回错题本
        </Link>
        <h1 className="text-base font-extrabold tracking-widest">{id ? '编辑错题' : '录入错题'}</h1>
      </div>
      <WrongQuestionForm
        id={id}
        prefill={state?.prefill}
        knowledgePoints={state?.knowledgePoints}
        imageKey={state?.imageKey}
        onSaved={() => navigate('/learning/wrong-questions')}
      />
    </div>
  );
}
