import { Link, useLocation } from 'react-router-dom';
import { BarChart3, BookOpen, Tags, Upload } from 'lucide-react';

const ITEMS = [
  { to: '/learning/wrong-questions/new', label: '上传新题', icon: Upload, match: '/new' },
  { to: '/learning/wrong-questions', label: '查看错题本', icon: BookOpen, match: 'exact' },
  { to: '/learning/wrong-questions/tags', label: '标签管理', icon: Tags, match: '/tags' },
  { to: '/learning/wrong-questions/stats', label: '统计中心', icon: BarChart3, match: '/stats' },
] as const;

/** 错题本顶部四入口（对照上游首页：上传新题 / 查看错题本 / 标签管理 / 统计中心） */
export function WrongQuestionNav() {
  const { pathname } = useLocation();
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-wrong-question-nav>
      {ITEMS.map((item) => {
        const active =
          item.match === 'exact' ? pathname === '/learning/wrong-questions' : pathname.includes(item.match);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            data-nav-item={item.label}
            className={`flex items-center justify-center gap-1.5 border-2 border-ink px-3 py-2.5 text-xs font-extrabold shadow-pixel transition active:translate-y-0.5 ${
              active ? 'bg-accent text-white' : 'bg-panel text-ink hover:bg-panelLight'
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
