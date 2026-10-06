import { cn } from '../../lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse border-2 border-ink/40 bg-panelLight', className)} />;
}
