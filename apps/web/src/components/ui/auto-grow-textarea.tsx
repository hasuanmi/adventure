import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * 自动撑高的多行输入框（用户要求：题干、解析、笔记这类要输大量文字的，
 * **直接延伸框、全部显示文字，不做内部滚动条**）。
 *  · 高度跟随内容（scrollHeight）实时调整，含初次挂载、AI 预填、程序化改值
 *  · 关闭手动拖拽缩放与纵向滚动，避免出现"下拉条让用户划动"
 */
export function AutoGrowTextarea({ className, value, onChange, ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = (): void => {
    const el = ref.current;
    if (!el) return;
    // 先归零再按内容撑高；必须补上上下边框（border-box 下 scrollHeight 不含边框，
    // 否则会差 2px 而出现微小滚动）
    el.style.height = 'auto';
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + border}px`;
  };

  // 值变化（含 AI 预填/切换错题）后重算高度
  useLayoutEffect(resize, [value]);

  // 首次挂载与容器宽度变化（换行数变化）也要重算
  useLayoutEffect(() => {
    resize();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => resize());
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={onChange}
      className={cn('resize-none overflow-hidden', className)}
      {...props}
    />
  );
}
