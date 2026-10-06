// 任务列表底部「＋ 添加任务」快速行（点击打开统一 TaskCreateSheet；不做自然语言解析）
export function QuickAddRow({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 border-2 border-dashed border-ink/40 bg-panelLight/60 px-3 py-2.5 text-sm font-bold text-inkSoft transition hover:bg-panelLight active:translate-y-0.5"
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center border-2 border-ink/40 bg-panel text-xs text-accent">＋</span>
      添加任务
    </button>
  );
}
