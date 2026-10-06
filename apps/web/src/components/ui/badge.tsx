import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

// Pixel Tag / Badge（docs/ui-reference.md §3）
const badgeVariants = cva(
  'inline-flex items-center gap-1 border-2 border-ink px-2 py-0.5 text-xs font-bold text-white',
  {
    variants: {
      variant: {
        accent: 'bg-accent',
        ok: 'bg-ok',
        warning: 'bg-warning',
        danger: 'bg-danger',
        ink: 'bg-ink text-panelLight',
        soft: 'border-ink bg-panelLight text-ink',
      },
    },
    defaultVariants: { variant: 'accent' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
