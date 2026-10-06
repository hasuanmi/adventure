import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

// Pixel Button（docs/ui-reference.md §3：border-2 border-ink + shadow-pixel + active:translate-y-1 按压）
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap border-2 border-ink px-4 py-2 text-sm font-bold text-white shadow-pixel transition active:translate-y-1 disabled:opacity-50 disabled:active:translate-y-0',
  {
    variants: {
      variant: {
        accent: 'bg-accent',
        ok: 'bg-ok',
        danger: 'bg-danger',
        warning: 'bg-warning',
        ghost: 'border-ink bg-panel text-ink shadow-none active:translate-y-0',
      },
      size: {
        default: 'px-4 py-2 text-sm',
        sm: 'px-3 py-1.5 text-xs',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: { variant: 'accent', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { buttonVariants };
