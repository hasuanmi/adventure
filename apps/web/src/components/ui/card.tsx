import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

// Pixel Panel / Card（docs/ui-reference.md §3：Panel=直角像素块，Card=轻描边圆角变体）
export const Panel = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('border-2 border-ink bg-panel p-4 shadow-pixel', className)} {...props} />
  ),
);
Panel.displayName = 'Panel';

export const Card = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-xl border border-ink/30 bg-panel p-4', className)} {...props} />
  ),
);
Card.displayName = 'Card';

export function PanelHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mb-3 text-sm font-extrabold tracking-widest text-ink', className)}>{children}</div>;
}
