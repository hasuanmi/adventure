import { cn } from '../../lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block h-4 w-4 animate-spin border-2 border-ink border-t-transparent', className)}
      role="status"
      aria-label="加载中"
    />
  );
}
